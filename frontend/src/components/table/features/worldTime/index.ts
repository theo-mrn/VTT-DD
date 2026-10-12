import { CalendarClock } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Temps du monde : jour et heure de la fiction, que le MJ avance (10 min, une heure, un repos
 * long, le matin suivant…) ; la table les voit en haut à droite, sauf s'il les cache.
 */
export const worldTimeFeature = {
  kind: 'panel',
  id: 'worldTime',
  icon: CalendarClock,
  width: 'compact',
  mode: 'floating',
  roles: ['gm'],
  extra: true,
  component: lazy(() =>
    import('./ui/world-time-panel').then((m) => ({ default: m.WorldTimePanel })),
  ),
  overlay: lazy(() =>
    import('./ui/world-time-overlay').then((m) => ({ default: m.WorldTimeOverlay })),
  ),
} as const satisfies PanelFeature;
