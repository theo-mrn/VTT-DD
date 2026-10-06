/**
 * Raccourcis du site (docs/raccourcis.md § 3) : description des commandes et conflits. Pur,
 * sans DOM : l'aiguilleur (`dispatcher.ts`) et l'éditeur s'en servent.
 */
import { bindingsClash, parseBinding } from './chord';

/**
 * Où une commande écoute :
 * - `global` : partout (recherche, lanceur rapide) ;
 * - `table` : sur la table (panneaux, note rapide, bulle) ;
 * - `map` : la carte a le focus (outils et actions de la carte, aiguillés par la carte) ;
 * - `dice` : une table de dés est affichée (relancer, macros, raccourcis créés) ;
 * - `notes` : l'espace des notes est affiché.
 */
export type ShortcutScope = 'global' | 'table' | 'map' | 'dice' | 'notes';
export type ShortcutRole = 'gm' | 'player' | 'spectator';

export const SCOPES: readonly ShortcutScope[] = ['global', 'table', 'map', 'dice', 'notes'];

export interface ShortcutDescriptor {
  /** `table.panel.chat`, `map.tool.draw`, `dice.reroll`, `custom.<id>`… */
  id: string;
  label: string;
  scope: ShortcutScope;
  /** Touche par défaut (`Shift+KeyN`, `Space Enter`), ou null : aucune. */
  defaultBinding: string | null;
  /** Rôles à la table qui l'ont (absent : tous). */
  roles?: readonly ShortcutRole[];
  /** Geste standard (Échap, ⌘Z…) : affiché, non modifiable. */
  fixed?: boolean;
  /** Touche affichée d'un geste qui n'est pas une touche unique (« ↑ ↓ ← → »). */
  fixedLabel?: string;
  /** Une seule frappe, pas de séquence (carte : aiguillée par la carte). */
  single?: boolean;
  /** Marche aussi pendant la saisie (⌘K). */
  inInput?: boolean;
  /**
   * Passe après la page (dés, notes, bulle) : une touche prise par la carte (R : rotation de
   * la sélection) ou un champ ne la déclenche pas. Sinon, avant tout (table, recherche).
   */
  late?: boolean;
}

/** Les portées qui peuvent être actives ensemble (la table contient la carte). */
const OVERLAPS: Record<ShortcutScope, readonly ShortcutScope[]> = {
  global: SCOPES,
  table: ['global', 'table', 'map'],
  map: ['global', 'table', 'map'],
  dice: ['global', 'dice'],
  notes: ['global', 'notes'],
};

export const scopesOverlap = (a: ShortcutScope, b: ShortcutScope) => OVERLAPS[a].includes(b);

export function rolesOverlap(
  a: readonly ShortcutRole[] | undefined,
  b: readonly ShortcutRole[] | undefined,
): boolean {
  if (!a || !b) return true;
  return a.some((r) => b.includes(r));
}

export interface ResolvedShortcut {
  descriptor: ShortcutDescriptor;
  /** Touche effective (défaut ou choix de l'utilisateur). */
  binding: string | null;
}

/**
 * Conflits : deux commandes que l'on peut avoir ensemble (portées et rôles) dont les touches
 * se gênent (identiques, ou l'une commence l'autre). Deux gestes standards ne se signalent pas
 * entre eux. Renvoie, pour chaque commande en conflit, les commandes qui la gênent.
 */
export function findConflicts(entries: readonly ResolvedShortcut[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const live = entries.filter((e) => parseBinding(e.binding));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.descriptor.fixed && b.descriptor.fixed) continue;
      if (!scopesOverlap(a.descriptor.scope, b.descriptor.scope)) continue;
      if (!rolesOverlap(a.descriptor.roles, b.descriptor.roles)) continue;
      if (!bindingsClash(a.binding!, b.binding!)) continue;
      out.set(a.descriptor.id, [...(out.get(a.descriptor.id) ?? []), b.descriptor.id]);
      out.set(b.descriptor.id, [...(out.get(b.descriptor.id) ?? []), a.descriptor.id]);
    }
  }
  return out;
}

/** Commandes de ce rôle (l'éditeur à la table ne montre que les siennes). */
export const forRole = (list: readonly ShortcutDescriptor[], role: ShortcutRole | null) =>
  role ? list.filter((d) => !d.roles || d.roles.includes(role)) : [...list];
