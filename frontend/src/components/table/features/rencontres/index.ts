import { Swords } from 'lucide-react';
import { lazy } from 'react';
import { type PanelFeature } from '../types';

export const rencontresFeature = {
  kind: 'panel',
  id: 'rencontres',
  icon: Swords,
  // M comme monstres (libre depuis le retrait du panneau Combat)
  shortcut: { code: 'KeyM', label: 'M' },
  width: 'full',
  mode: 'side',
  roles: ['gm'],
  component: lazy(() =>
    import('../../../encounters/encounters-panel').then((m) => ({ default: m.EncountersPanel })),
  ),
} as const satisfies PanelFeature;
