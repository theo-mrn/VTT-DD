import { Flashlight } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/** Projecteur (MJ) : temps de scène de chaque joueur pendant la séance, pour équilibrer. */
export const spotlightFeature = {
  kind: 'panel',
  id: 'spotlight',
  icon: Flashlight,
  width: 'compact',
  mode: 'floating',
  roles: ['gm'],
  extra: true,
  component: lazy(() =>
    import('./ui/spotlight-panel').then((m) => ({ default: m.SpotlightPanel })),
  ),
} as const satisfies PanelFeature;
