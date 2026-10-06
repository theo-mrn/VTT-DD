/**
 * Outil actif, outils disponibles et raccourcis (docs/carte.md § 6). Un seul outil actif ; la
 * sélection (V) est l'outil par défaut, vers lequel on revient à Échap ou quand un outil
 * disparaît. Observable par React avec des instantanés stables (barre d'outils).
 */
import type { MapViewer } from '../entities/entity-kind';
import type { MapEngine } from '../map-engine';
import { mapToolShortcut } from '../../shortcuts';
import type { Tool, ToolDefinition } from './tool';

export const SELECT_TOOL_ID = 'select';

interface Entry {
  def: ToolDefinition;
  tool: Tool | null;
}

export class ToolManager {
  private readonly entries = new Map<string, Entry>();
  private activeId = SELECT_TOOL_ID;
  private listSnapshot: readonly ToolDefinition[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly engine: MapEngine) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  private changed() {
    for (const l of this.listeners) l();
  }

  /** Identifiant de l'outil actif (instantané stable : une chaîne). */
  getActiveId = (): string => this.activeId;

  /** Définitions, dans l'ordre de la barre (tableau stable entre deux enregistrements). */
  getDefinitions = (): readonly ToolDefinition[] => this.listSnapshot;

  register(def: ToolDefinition): () => void {
    if (this.entries.has(def.id)) throw new Error(`Outil déjà enregistré : ${def.id}`);
    this.entries.set(def.id, { def, tool: null });
    this.refreshList();
    return () => {
      if (this.activeId === def.id) this.activate(SELECT_TOOL_ID);
      this.entries.delete(def.id);
      this.refreshList();
    };
  }

  private refreshList() {
    this.listSnapshot = Object.freeze(
      [...this.entries.values()]
        .map((e) => e.def)
        .sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    );
    this.changed();
  }

  /** Outils que cet utilisateur peut prendre. */
  availableFor(viewer: MapViewer): ToolDefinition[] {
    return this.listSnapshot.filter((d) =>
      d.available ? d.available(viewer) : viewer.role === 'gm',
    );
  }

  private instance(id: string): Tool | null {
    const e = this.entries.get(id);
    if (!e) return null;
    e.tool ??= e.def.create(this.engine);
    return e.tool;
  }

  /** Outil actif (la sélection si l'outil demandé n'existe pas). */
  get active(): Tool {
    const tool = this.instance(this.activeId) ?? this.instance(SELECT_TOOL_ID);
    if (!tool) throw new Error('Aucun outil de sélection enregistré');
    return tool;
  }

  get activeDefinition(): ToolDefinition | undefined {
    return this.entries.get(this.activeId)?.def;
  }

  /** Change d'outil ; l'ancien revient à un état sûr. Renvoie faux si l'outil est inconnu ou interdit. */
  activate(id: string): boolean {
    const e = this.entries.get(id);
    if (!e) return false;
    const available = e.def.available
      ? e.def.available(this.engine.viewer)
      : this.engine.viewer.role === 'gm';
    if (!available) return false;
    if (id === this.activeId) return true;
    const previous = this.instance(this.activeId);
    previous?.cancel?.(this.engine);
    previous?.deactivate?.(this.engine);
    this.activeId = id;
    this.instance(id)?.activate?.(this.engine);
    this.engine.refreshCursor();
    this.engine.invalidate();
    this.changed();
    return true;
  }

  /** Outil de ce viewer dont la touche effective est celle-ci (`KeyP`, `Shift+KeyP`). */
  byShortcut(chord: string): ToolDefinition | undefined {
    return this.availableFor(this.engine.viewer).find(
      (d) => !d.hidden && this.engine.bindingOf(mapToolShortcut(d)) === chord,
    );
  }

  /** Démontage : chaque outil instancié revient à un état sûr. */
  dispose() {
    for (const e of this.entries.values()) {
      e.tool?.cancel?.(this.engine);
      e.tool?.deactivate?.(this.engine);
      e.tool = null;
    }
    this.listeners.clear();
  }
}
