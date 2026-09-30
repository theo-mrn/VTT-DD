/**
 * Mise en page du panneau Combat (docs/combat.md § 12.3) : décidée par la largeur du panneau
 * (requête de conteneur, mesurée par `usePanelWidth`), jamais par celle de l'écran. Le même
 * panneau est large sur un grand écran, plein écran sur un téléphone ou une tablette.
 *
 * - `split` : l'ancien tableau de bord. Ordre du tour à gauche ; à droite les cartes compactes
 *   (Consulté, Cibles, Personnage actif) puis les rapports sur tout l'espace restant ; chaque
 *   colonne défile pour elle-même.
 * - `stack` : l'ancienne vue mobile, une seule colonne qui défile : carte active, rapports,
 *   ordre.
 *
 * Le rendu suit l'ordre visuel dans le DOM (lecteur d'écran, tabulation) : chaque mode a son
 * propre arbre, ce qui serait impossible avec une requête de conteneur en CSS seule.
 */

export type CombatLayoutMode = 'stack' | 'split';

export interface CombatLayout {
  mode: CombatLayoutMode;
  /** Colonnes de la grille des rapports d'attaque. */
  reportColumns: 1 | 2;
  /** En-tête serré : les boutons secondaires n'ont que leur icône. */
  compactHeader: boolean;
}

/** Largeur (px) à partir de laquelle l'ordre du tour passe dans sa colonne. */
export const SPLIT_MIN_WIDTH = 720;
/** Rapports sur deux colonnes : la colonne de droite (7/12 du panneau) dépasse ~600 px. */
export const SPLIT_TWO_REPORT_COLUMNS = 1080;
/** Vue empilée : deux colonnes de rapports dès qu'une carte garde ~300 px. */
export const STACK_TWO_REPORT_COLUMNS = 640;
/** En dessous, l'en-tête ne garde que les icônes des boutons secondaires. */
export const COMPACT_HEADER_BELOW = 520;

/** Mise en page pour une largeur de panneau ; 0 ou invalide : pas encore mesurée (empilée). */
export function combatLayout(width: number): CombatLayout {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const mode: CombatLayoutMode = w >= SPLIT_MIN_WIDTH ? 'split' : 'stack';
  const twoColumns =
    mode === 'split' ? w >= SPLIT_TWO_REPORT_COLUMNS : w >= STACK_TWO_REPORT_COLUMNS;
  return {
    mode,
    reportColumns: twoColumns ? 2 : 1,
    compactHeader: w > 0 && w < COMPACT_HEADER_BELOW,
  };
}
