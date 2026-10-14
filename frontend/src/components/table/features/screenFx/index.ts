import { lazy } from 'react';

/**
 * Effets d'écran : le MJ secoue, éclaire ou assombrit l'écran de toute la table (effets d'un
 * clic, ambiance qui dure) ; voir `state.ts`. Pas de bouton à part : la commande vit dans le
 * menu Météo de la carte (`ui/screen-fx-controls.tsx`) ; la surcouche joue les effets chez tous.
 */
export const screenFxOverlay = lazy(() =>
  import('./ui/screen-fx-overlay').then((m) => ({ default: m.ScreenFxOverlay })),
);
