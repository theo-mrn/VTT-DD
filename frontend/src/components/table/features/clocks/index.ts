import { PieChart } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Horloges de progression : menaces et projets en cercles à segments, que le MJ remplit ; les
 * visibles s'affichent chez tous en bas à droite (`state.ts`).
 */
export const clocksFeature = {
  kind: 'panel',
  id: 'clocks',
  icon: PieChart,
  width: 'narrow',
  mode: 'side',
  roles: ['gm'],
  extra: true,
  component: lazy(() => import('./ui/clocks-panel').then((m) => ({ default: m.ClocksPanel }))),
  overlay: lazy(() => import('./ui/clocks-overlay').then((m) => ({ default: m.ClocksOverlay }))),
} as const satisfies PanelFeature;
