import { Skull } from 'lucide-react';
import { lazy } from 'react';
import { type PanelFeature } from '../types';

export const pnjFeature = {
  kind: 'panel',
  id: 'pnj',
  icon: Skull,
  shortcut: { code: 'KeyU', label: 'U' },
  width: 'wide',
  mode: 'side',
  roles: ['gm'],
  component: lazy(() => import('../../onglets/pnj').then((m) => ({ default: m.OngletPnj }))),
} as const satisfies PanelFeature;
