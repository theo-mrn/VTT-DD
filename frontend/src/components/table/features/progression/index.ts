import { Trophy } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

export const progressionFeature = {
  kind: 'panel',
  id: 'progression',
  icon: Trophy,
  // Toutes les lettres sont prises : ouvert depuis le rail (touche au choix, raccourcis)
  width: 'narrow',
  mode: 'side',
  roles: ALL_ROLES,
  component: lazy(() =>
    import('../../onglets/progression').then((m) => ({ default: m.OngletProgression })),
  ),
} as const satisfies PanelFeature;
