import { Hourglass } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Minuteur : le MJ lance un compte à rebours (décision à prendre, piège qui se referme) ;
 * toute la table le voit en haut de l'écran (`overlay`), sans rien enregistrer (`state.ts`).
 */
export const timerFeature = {
  kind: 'panel',
  id: 'timer',
  icon: Hourglass,
  width: 'compact',
  mode: 'floating',
  roles: ['gm'],
  extra: true,
  component: lazy(() => import('./ui/timer-panel').then((m) => ({ default: m.TimerPanel }))),
  overlay: lazy(() => import('./ui/timer-overlay').then((m) => ({ default: m.TimerOverlay }))),
} as const satisfies PanelFeature;
