/**
 * Mémoire de l'exploration côté client (docs/exploration.md § 5) : le masque du serveur et une
 * couche locale, sans Pixi ni React (testé à blanc).
 *
 * - Le masque vient du chargement de la carte (`MapSnapshot.exploration`, rangé dans
 *   `extras.exploration` du magasin), puis des événements `map.exploration_updated`, appliqués
 *   dans l'ordre des versions : la suivante est appliquée, une plus ancienne ignorée, un trou fait
 *   relire le masque (`GET …/exploration`).
 * - Couche locale : pendant un glisser, ce que voit le joueur est marqué ici (`markLocal`), en
 *   attendant le calcul du serveur ; elle s'efface 3 s après le dernier marquage, et à toute
 *   réinitialisation reçue. Elle n'est jamais envoyée.
 * - `revision` change à chaque modification (rendu, surlignage de l'outil du MJ).
 */
import type { MapExploration, MapExplorationUpdatedPayload } from '@vtt/contracts';
import {
  applyWindow,
  decodeMask,
  decodeWindow,
  ExplorationMask,
  markView,
  type CellRect,
  type CellWindow,
  type PreparedScene,
  type View,
} from '@vtt/vision';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { ExplorationApi } from './api';

/** La couche locale s'efface ce temps après le dernier marquage (le serveur a répondu). */
export const LOCAL_TTL_MS = 3000;

/** Ce que le rendu lit de la mémoire (module vision), sans dépendre de ce module. */
export interface MemorySource {
  /** Change à chaque modification du masque, de la couche locale ou du mode. */
  readonly revision: number;
  /** Mémoire à montrer (exploration active et masque connu). */
  readonly active: boolean;
  readonly cols: number;
  readonly rows: number;
  /** Écrit le masque montré, 4 octets par case (RGBA, 255 : explorée, 0 sinon). */
  write(out: Uint8Array): void;
}

export interface ExplorationUiState {
  revision: number;
  /** Exploration active sur la scène (réglage du MJ). */
  enabled: boolean;
  /** Version du masque connu (null : aucun). */
  version: number | null;
}

interface Timers {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultTimers: Timers = {
  now: () => performance.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ExplorationModel implements MemorySource {
  private mask: ExplorationMask | null = null;
  private local: Uint8Array | null = null;
  /** Masque montré : serveur ∪ couche locale, refait quand le masque du serveur change. */
  private shownMask: ExplorationMask | null = null;
  private localTimer: unknown = null;
  private reloading: Promise<void> | null = null;
  private disposed = false;
  version: number | null = null;
  revision = 0;
  readonly ui: StoreApi<ExplorationUiState>;
  private readonly timers: Timers;

  constructor(
    private readonly engine: MapEngine,
    private readonly api: ExplorationApi | null,
    timers: Partial<Timers> = {},
  ) {
    this.timers = { ...defaultTimers, ...timers };
    this.ui = createStore<ExplorationUiState>()(() => ({
      revision: 0,
      enabled: this.enabled,
      version: null,
    }));
  }

  /** Exploration active sur la scène affichée (réglage du MJ). */
  get enabled(): boolean {
    return this.engine.store.getState().scene?.exploration === 'party';
  }

  get active(): boolean {
    return this.enabled && this.mask !== null;
  }

  get cols() {
    return this.mask?.cols ?? 0;
  }

  get rows() {
    return this.mask?.rows ?? 0;
  }

  /** Taille de la carte (pixels du monde), celle de la scène. */
  bounds(): { width: number; height: number } | null {
    const s = this.engine.store.getState().scene;
    const width = s?.width;
    const height = s?.height;
    return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
      ? { width, height }
      : null;
  }

  /** Copie du masque du serveur (null : aucun). */
  serverMask(): ExplorationMask | null {
    return this.mask?.clone() ?? null;
  }

  /** La case est-elle montrée explorée (masque ou couche locale) ? */
  explored(col: number, row: number): boolean {
    const m = this.mask;
    if (!m || col < 0 || row < 0 || col >= m.cols || row >= m.rows) return false;
    const i = row * m.cols + col;
    return m.cells[i] === 1 || this.local?.[i] === 1;
  }

  write(out: Uint8Array) {
    const shown = this.shown();
    if (!shown) return;
    const cells = shown.cells;
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i] === 1 ? 255 : 0;
      const o = 4 * i;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = v;
    }
  }

  // ─── Serveur ─────────────────────────────────────────────────────────────────

  /** Masque reçu entier (chargement, relecture, réponse d'une écriture). */
  load(e: MapExploration | null | undefined) {
    if (e === undefined) return;
    if (e === null) {
      if (this.mask === null) return this.refreshUi();
      this.mask = null;
      this.version = null;
      this.dropLocal();
      this.changed();
      return;
    }
    if (e.mapId !== this.engine.store.getState().mapId) return;
    if (this.version !== null && e.version < this.version) return;
    let mask: ExplorationMask;
    try {
      mask = decodeMask(e, e.window);
    } catch {
      return;
    }
    if (this.mask && !this.mask.sameGrid(mask)) this.dropLocal();
    this.mask = mask;
    this.version = e.version;
    this.changed();
  }

  /**
   * `map.exploration_updated` : la version suivante est appliquée (sa fenêtre remplace le
   * rectangle), une plus ancienne ignorée ; un trou ou une autre grille fait relire le masque.
   */
  applyUpdate(p: MapExplorationUpdatedPayload) {
    if (p.mapId !== this.engine.store.getState().mapId) return;
    const m = this.mask;
    const full =
      p.window.x === 0 && p.window.y === 0 && p.window.w === p.cols && p.window.h === p.rows;
    if (this.version !== null && p.version <= this.version) return;
    let win: CellWindow;
    try {
      win = decodeWindow(p.window);
    } catch {
      void this.reload();
      return;
    }
    // Toute la grille (réinitialisation) : remplace le masque, quelle que soit sa version
    if (full) {
      this.mask = new ExplorationMask(p.cols, p.rows, win.cells);
      this.version = p.version;
      this.dropLocal();
      this.changed();
      return;
    }
    if (!m || this.version === null || p.version !== this.version + 1 || !m.sameGrid(p)) {
      void this.reload();
      return;
    }
    applyWindow(m, win, 'set');
    this.version = p.version;
    this.changed();
  }

  /** Relit le masque au serveur (un seul appel à la fois). */
  reload(): Promise<void> {
    if (!this.api || this.disposed) return Promise.resolve();
    this.reloading ??= this.api
      .get()
      .then((e) => {
        if (!this.disposed) this.load(e);
      })
      .catch(() => {
        // La prochaine relecture rattrapera
      })
      .finally(() => {
        this.reloading = null;
      });
    return this.reloading;
  }

  // ─── Gestes du MJ (optimistes) ───────────────────────────────────────────────

  /** Révéler ou oublier une fenêtre, tout de suite ; renvoie le rectangle changé. */
  editLocal(op: 'reveal' | 'forget', win: CellWindow): CellRect | null {
    const m = this.mask;
    if (!m || win.x + win.w > m.cols || win.y + win.h > m.rows) return null;
    const changed = applyWindow(m, win, op);
    if (changed) this.changed();
    return changed;
  }

  /** Remplace tout le masque, tout de suite (réinitialiser, l'annuler). */
  replaceLocal(mask: ExplorationMask) {
    this.mask = mask.clone();
    this.dropLocal();
    this.changed();
  }

  // ─── Couche locale (glisser d'un joueur) ─────────────────────────────────────

  /**
   * Marque ce que montre la vue dans la couche locale ; renvoie vrai si une case s'y ajoute.
   * Les cases déjà explorées (masque ou couche) sont sautées.
   */
  markLocal(prep: PreparedScene, view: View): boolean {
    const m = this.mask;
    const shown = this.shown();
    if (!m || !shown || !this.enabled) return false;
    // Marquée sur le masque montré : ses cases (serveur ou locales) sont sautées sans test
    const rect = markView(shown, prep, view);
    if (!rect) return false;
    const local = (this.local ??= new Uint8Array(m.cols * m.rows));
    for (let r = rect.y; r < rect.y + rect.h; r++)
      for (let c = rect.x; c < rect.x + rect.w; c++) {
        const i = r * m.cols + c;
        if (shown.cells[i] === 1 && m.cells[i] !== 1) local[i] = 1;
      }
    this.scheduleLocalExpiry();
    this.changed(true);
    return true;
  }

  /** Masque ∪ couche locale (gardé ; refait après un changement du serveur). */
  private shown(): ExplorationMask | null {
    const m = this.mask;
    if (!m) return null;
    if (this.shownMask) return this.shownMask;
    const cells = m.cells.slice();
    const local = this.local;
    if (local) for (let i = 0; i < cells.length; i++) if (local[i] === 1) cells[i] = 1;
    this.shownMask = new ExplorationMask(m.cols, m.rows, cells);
    return this.shownMask;
  }

  private scheduleLocalExpiry() {
    if (this.localTimer !== null) this.timers.clear(this.localTimer);
    this.localTimer = this.timers.set(() => {
      this.localTimer = null;
      if (!this.local) return;
      this.local = null;
      this.changed();
    }, LOCAL_TTL_MS);
  }

  private dropLocal() {
    if (this.localTimer !== null) this.timers.clear(this.localTimer);
    this.localTimer = null;
    this.local = null;
  }

  // ─── Changements ─────────────────────────────────────────────────────────────

  /** Le mode de la scène a changé : relire si l'exploration s'active sans masque connu. */
  sceneChanged() {
    if (this.enabled && !this.mask) void this.reload();
    this.changed();
  }

  /** `localOnly` : seule la couche locale a grandi, déjà portée sur le masque montré. */
  private changed(localOnly = false) {
    if (!localOnly) this.shownMask = null;
    this.revision += 1;
    this.refreshUi();
    this.engine.invalidate();
  }

  private refreshUi() {
    this.ui.setState({ revision: this.revision, enabled: this.enabled, version: this.version });
  }

  dispose() {
    this.disposed = true;
    this.dropLocal();
  }
}

const models = new WeakMap<MapEngine, ExplorationModel>();

/** Mémoire de l'exploration de ce moteur (null : fonction non chargée). */
export const explorationOf = (engine: MapEngine): ExplorationModel | null =>
  models.get(engine) ?? null;

/**
 * Crée la mémoire du moteur et la relie au magasin (chargement de la carte, mode de la scène) ;
 * renvoie le nettoyage.
 */
export function attachExploration(
  engine: MapEngine,
  api: ExplorationApi | null,
  timers?: Partial<Timers>,
): { model: ExplorationModel; dispose(): void } {
  const model = new ExplorationModel(engine, api, timers);
  models.set(engine, model);
  const initial = engine.store.getState();
  model.load(initial.extras.exploration as MapExploration | null | undefined);
  const unsubscribe = engine.store.subscribe((s, prev) => {
    if (s.extras.exploration !== prev.extras.exploration)
      model.load(s.extras.exploration as MapExploration | null | undefined);
    if (s.scene?.exploration !== prev.scene?.exploration) model.sceneChanged();
  });
  return {
    model,
    dispose() {
      unsubscribe();
      model.dispose();
      if (models.get(engine) === model) models.delete(engine);
    },
  };
}
