import { History } from 'lucide-react';
import { lazy } from 'react';
import { type PanelFeature } from '../types';

export const historiqueFeature = {
  kind: 'panel',
  id: 'historique',
  icon: History,
  shortcut: { code: 'KeyH', label: 'H' },
  width: 'narrow',
  mode: 'side',
  // La chronique dévoile ce que les joueurs n'ont pas à savoir : MJ seulement
  roles: ['gm'],
  component: lazy(() =>
    import('../../onglets/historique').then((m) => ({ default: m.OngletHistorique })),
  ),
} as const satisfies PanelFeature;
