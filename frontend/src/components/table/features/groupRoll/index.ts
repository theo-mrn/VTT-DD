import { lazy } from 'react';

/**
 * Jet de groupe : le MJ le demande depuis son lanceur de dés (bouton « Groupe » : la formule et
 * l'intitulé du plateau ; partagé si le jet est public), chaque joueur le lance d'un clic, et les
 * résultats se rangent en direct sous le lanceur du MJ (`state.ts`). Pas de bouton à part dans
 * la barre : la surcouche porte l'invite chez les joueurs et reçoit les résultats chez le MJ.
 */
export const groupRollOverlay = lazy(() =>
  import('./ui/group-roll-overlay').then((m) => ({ default: m.GroupRollOverlay })),
);
