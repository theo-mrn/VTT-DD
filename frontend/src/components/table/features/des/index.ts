import { Dices } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

export const desFeature = {
  kind: 'panel',
  id: 'des',
  icon: Dices,
  shortcut: { code: 'KeyD', label: 'D' },
  width: 'fit',
  mode: 'floating',
  roles: ALL_ROLES,
  activity: ['dice.rolled'],
  component: lazy(() => import('../../onglets/des').then((m) => ({ default: m.OngletDes }))),
} as const satisfies PanelFeature;
