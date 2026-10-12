import { Volume2 } from 'lucide-react';
import { lazy } from 'react';
import { type PanelFeature } from '../types';

export const volumeFeature = {
  kind: 'panel',
  id: 'volume',
  icon: Volume2,
  // Même touche que « Son » pour le MJ : chacun ouvre son réglage du son avec S
  shortcut: { code: 'KeyS', label: 'S' },
  width: 'compact',
  mode: 'floating',
  roles: ['player', 'spectator'],
  component: lazy(() => import('../../onglets/volume').then((m) => ({ default: m.OngletVolume }))),
} as const satisfies PanelFeature;
