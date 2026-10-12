import { Library } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

export const resourcesFeature = {
  kind: 'panel',
  id: 'resources',
  icon: Library,
  // R relance le dernier jet dans le panneau Dés : B comme bibliothèque
  shortcut: { code: 'KeyB', label: 'B' },
  width: 'full',
  mode: 'side',
  roles: ALL_ROLES,
  component: lazy(() =>
    import('../../onglets/resources').then((m) => ({ default: m.OngletResources })),
  ),
} as const satisfies PanelFeature;
