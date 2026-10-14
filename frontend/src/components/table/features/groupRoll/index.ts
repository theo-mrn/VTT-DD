import { Dices } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Jet de groupe : le MJ demande un jet à tous les joueurs, chacun le lance d'un clic, les
 * résultats se rangent en direct (`state.ts`).
 */
export const groupRollFeature = {
  kind: 'panel',
  id: 'groupRoll',
  icon: Dices,
  width: 'compact',
  mode: 'floating',
  roles: ['gm'],
  extra: true,
  component: lazy(() =>
    import('./ui/group-roll-panel').then((m) => ({ default: m.GroupRollPanel })),
  ),
  overlay: lazy(() =>
    import('./ui/group-roll-overlay').then((m) => ({ default: m.GroupRollOverlay })),
  ),
} as const satisfies PanelFeature;
