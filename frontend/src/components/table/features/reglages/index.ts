import { Settings } from 'lucide-react';
import { lazy } from 'react';
import { type PanelFeature } from '../types';

export const reglagesFeature = {
  kind: 'panel',
  id: 'reglages',
  icon: Settings,
  shortcut: { code: 'KeyO', label: 'O' },
  width: 'medium',
  mode: 'side',
  roles: ['gm'],
  component: lazy(() =>
    import('../../onglets/reglages').then((m) => ({ default: m.OngletReglages })),
  ),
} as const satisfies PanelFeature;
