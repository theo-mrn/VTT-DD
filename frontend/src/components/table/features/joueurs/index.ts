import { Users } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

export const joueursFeature = {
  kind: 'panel',
  id: 'joueurs',
  icon: Users,
  shortcut: { code: 'KeyJ', label: 'J' },
  width: 'full',
  mode: 'side',
  roles: ALL_ROLES,
  component: lazy(() =>
    import('../../onglets/joueurs').then((m) => ({ default: m.PanneauJoueurs })),
  ),
} as const satisfies PanelFeature;
