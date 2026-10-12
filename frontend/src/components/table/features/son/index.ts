import { Music } from 'lucide-react';
import { lazy } from 'react';
import { type PanelFeature } from '../types';

export const sonFeature = {
  kind: 'panel',
  id: 'son',
  icon: Music,
  // S comme son (Q, l'ancien raccourci du mixeur, reste libre)
  shortcut: { code: 'KeyS', label: 'S' },
  width: 'medium',
  mode: 'side',
  // Le son se pilote par le MJ seul ; les autres n'ont que leur volume (panneau « Volume »)
  roles: ['gm'],
  component: lazy(() => import('../../onglets/son').then((m) => ({ default: m.OngletSon }))),
} as const satisfies PanelFeature;
