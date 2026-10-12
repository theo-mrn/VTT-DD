import { Star } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

/**
 * Jetons de destin : réserve commune que le MJ remplit et que les joueurs dépensent ; visible
 * de tous en bas à gauche (`state.ts`).
 */
export const fateFeature = {
  kind: 'panel',
  id: 'fate',
  icon: Star,
  width: 'compact',
  mode: 'floating',
  roles: ALL_ROLES,
  extra: true,
  component: lazy(() => import('./ui/fate-panel').then((m) => ({ default: m.FatePanel }))),
  overlay: lazy(() => import('./ui/fate-overlay').then((m) => ({ default: m.FateOverlay }))),
} as const satisfies PanelFeature;
