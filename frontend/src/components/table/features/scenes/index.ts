import { MapPinned } from 'lucide-react';
import { lazy } from 'react';
import { type PanelFeature } from '../types';

export const scenesFeature = {
  kind: 'panel',
  id: 'scenes',
  icon: MapPinned,
  // E comme scènE : ni un panneau (F D C N J H S B M O) ni un outil de la carte (V P T W G L R K)
  shortcut: { code: 'KeyE', label: 'E' },
  width: 'narrow',
  mode: 'side',
  roles: ['gm'],
  component: lazy(() =>
    import('../../../map/scenes/scenes-panel').then((m) => ({ default: m.ScenesPanel })),
  ),
} as const satisfies PanelFeature;
