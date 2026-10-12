import { Shuffle } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Tables aléatoires du MJ (noms, rumeurs, butin, rencontres) : un clic tire une entrée et la
 * poste dans le chat, ou la garde pour lui. Rangées sur son compte (`state.ts`).
 */
export const randomTablesFeature = {
  kind: 'panel',
  id: 'randomTables',
  icon: Shuffle,
  width: 'narrow',
  mode: 'side',
  roles: ['gm'],
  extra: true,
  component: lazy(() =>
    import('./ui/random-tables-panel').then((m) => ({ default: m.RandomTablesPanel })),
  ),
} as const satisfies PanelFeature;
