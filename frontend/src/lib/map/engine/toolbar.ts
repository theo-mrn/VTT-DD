/**
 * Actions et barre d'outils déclarative (docs/carte.md § 6, Fonctions branchables). Une action
 * est un geste nommé que la barre et le clavier déclenchent de la même façon ; la barre n'est
 * qu'une liste d'entrées rangées en groupes, fournies par les modules. `toolbar.tsx` ne connaît
 * aucune fonction : il rend ce que `toolbarGroups` lui donne.
 */
import type { ComponentType } from 'react';
import type { MapViewer } from './entities/entity-kind';
import type { MapEngine } from './map-engine';
import type { ToolDefinition } from './tools/tool';
import { SELECT_TOOL_ID } from './tools/tool-manager';

/** ⌘ sur Mac, Ctrl+ ailleurs (touches affichées). */
export const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '')
    ? '⌘'
    : 'Ctrl+';

/** Groupes de la barre, dans cet ordre ; un séparateur entre deux groupes non vides. */
export const TOOLBAR_GROUPS = ['tools', 'history', 'view', 'assist'] as const;
export type ToolbarGroup = (typeof TOOLBAR_GROUPS)[number];

type Icon = ComponentType<{ className?: string }>;

/** État affiché d'un bouton, lu dans React par ce seul bouton. */
export interface ActionStatus {
  /** Faux : grisé (défaut : vrai). */
  enabled?: boolean;
  /** Bascule enfoncée. */
  active?: boolean;
  /** Libellé du moment (« Annuler « Déplacer » »), à la place de `label`. */
  label?: string;
  /** Icône du moment (plein écran : Réduire), à la place de `icon`. */
  icon?: Icon;
}

/** Geste nommé d'un module : bouton de la barre, touche, ou les deux. */
export interface MapAction {
  /** « module.action » : `camera.fit`, `history.undo`. */
  id: string;
  /** Info-bulle, et nom dans la personnalisation de la barre. */
  label: string;
  icon: Icon;
  /** Lettre seule, branchée par le moteur quand la carte a le focus (`KeyX`, la lettre tapée). */
  shortcut?: { code: string; label: string };
  /** Touche affichée seulement, gérée ailleurs (⌘Z : geste commun du contrôleur). */
  hint?: string;
  /** Qui la voit et la déclenche (défaut : tous). */
  available?(viewer: MapViewer): boolean;
  run(engine: MapEngine): void;
  /** Hook React du bouton : grisé, enfoncé, libellé du moment. */
  useStatus?(engine: MapEngine): ActionStatus;
  /** Place dans la barre ; absent : touche seule. */
  toolbar?: { group: ToolbarGroup; order?: number };
}

interface EntryBase {
  id: string;
  /** Nom et icône dans la personnalisation de la barre (et info-bulle d'un `menu`). */
  label: string;
  icon: Icon;
  group: ToolbarGroup;
  /** Place dans le groupe (croissant, défaut 100). */
  order?: number;
  /** Qui voit l'entrée (défaut : tous). */
  available?(viewer: MapViewer): boolean;
}

/** Entrée de la barre fournie par un module (les outils ont la leur d'office). */
export type ToolbarEntry =
  /** Bouton d'une action (créé par `registerAction` quand l'action a `toolbar`). */
  | (EntryBase & { kind: 'action'; action: MapAction })
  /** Bouton qui ouvre un menu (popover) au-dessus de la barre. */
  | (EntryBase & {
      kind: 'menu';
      content: ComponentType<{ engine: MapEngine }>;
      /** Classes du panneau (largeur, marges). */
      className?: string;
      /** Libellé du moment, bouton mis en avant. */
      useStatus?(engine: MapEngine): ActionStatus;
    })
  /** Composant libre (bouton et fenêtre à soi), construit avec les briques de la barre. */
  | (EntryBase & { kind: 'custom'; component: ComponentType<{ engine: MapEngine }> });

/** Entrée prête à rendre : un outil, ou une entrée d'un module. */
export type ToolbarSlot = { kind: 'tool'; id: string; tool: ToolDefinition } | ToolbarEntry;

export interface ToolbarSection {
  group: ToolbarGroup;
  slots: ToolbarSlot[];
}

const byOrder = (a: { order?: number }, b: { order?: number }) =>
  (a.order ?? 100) - (b.order ?? 100);

/** Un outil va dans la barre s'il n'est pas lancé ailleurs et que ce viewer peut le prendre. */
export function toolShown(def: ToolDefinition, viewer: MapViewer): boolean {
  if (def.hidden) return false;
  return def.available ? def.available(viewer) : viewer.role === 'gm';
}

/**
 * Disposition choisie par l'utilisateur (docs/carte.md § 6, Personnalisation) : `order`, ordre
 * voulu (une entrée absente garde sa place par défaut), `hidden`, entrées masquées.
 */
export interface ToolbarLayout {
  order: readonly string[];
  hidden: readonly string[];
}

export const DEFAULT_LAYOUT: ToolbarLayout = { order: [], hidden: [] };

/** Entrée qu'on ne masque pas : la sélection (V), toujours là. */
export const canHide = (id: string) => id !== SELECT_TOOL_ID;

/**
 * Ordre voulu dans un groupe : les entrées citées par `order` se rangent entre elles, dans les
 * places qu'elles occupent par défaut ; les autres (fonction ajoutée depuis) gardent la leur.
 */
export function arrange<T extends { id: string }>(slots: readonly T[], order: readonly string[]) {
  const rank = new Map(order.map((id, i) => [id, i]));
  const known = slots
    .filter((s) => rank.has(s.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  let k = 0;
  return slots.map((s) => (rank.has(s.id) ? known[k++]! : s));
}

/**
 * Barre de ce viewer : groupes non vides, dans l'ordre, entrées triées puis rangées selon la
 * disposition. `withHidden` : entrées masquées comprises (personnalisation).
 */
export function toolbarGroups(
  tools: readonly ToolDefinition[],
  entries: readonly ToolbarEntry[],
  viewer: MapViewer,
  layout: ToolbarLayout = DEFAULT_LAYOUT,
  withHidden = false,
): ToolbarSection[] {
  const hidden = new Set(layout.hidden);
  const shown = (id: string) => withHidden || !hidden.has(id) || !canHide(id);
  const sections: ToolbarSection[] = [];
  for (const group of TOOLBAR_GROUPS) {
    const slots: ToolbarSlot[] =
      group === 'tools'
        ? tools
            .filter((t) => toolShown(t, viewer))
            .toSorted(byOrder)
            .map((tool) => ({ kind: 'tool', id: tool.id, tool }))
        : [];
    slots.push(
      ...entries
        .filter((e) => e.group === group && (e.available ? e.available(viewer) : true))
        .toSorted(byOrder),
    );
    const arranged = arrange(slots, layout.order).filter((x) => shown(x.id));
    if (arranged.length) sections.push({ group, slots: arranged });
  }
  return sections;
}

/** Nom et icône d'une entrée (liste de personnalisation). */
export function slotLabel(slot: ToolbarSlot): { label: string; icon: Icon } {
  return slot.kind === 'tool' ? { label: slot.tool.label, icon: slot.tool.icon } : slot;
}

/**
 * Déplace `id` à la place `to` de son groupe (`ids` : le groupe tel qu'affiché, masquées
 * comprises). Le groupe entier est noté dans `order`, à la suite des autres groupes.
 */
export function moveEntry(
  layout: ToolbarLayout,
  ids: readonly string[],
  id: string,
  to: number,
): ToolbarLayout {
  const from = ids.indexOf(id);
  if (from < 0 || to < 0 || to >= ids.length || from === to) return layout;
  const group = ids.filter((x) => x !== id);
  group.splice(to, 0, id);
  const inGroup = new Set(ids);
  return { ...layout, order: [...layout.order.filter((x) => !inGroup.has(x)), ...group] };
}

/** Masque ou remontre une entrée (la sélection reste). */
export function hideEntry(layout: ToolbarLayout, id: string, hide: boolean): ToolbarLayout {
  if (!canHide(id)) return layout;
  const rest = layout.hidden.filter((x) => x !== id);
  return { ...layout, hidden: hide ? [...rest, id] : rest };
}
