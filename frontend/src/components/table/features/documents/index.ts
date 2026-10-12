import { Images } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

export const documentsFeature = {
  kind: 'panel',
  id: 'documents',
  icon: Images,
  // Toutes les lettres sont prises (carte et panneaux) : ouvert depuis le rail
  width: 'medium',
  mode: 'side',
  roles: ALL_ROLES,
  activity: ['handout.shared'],
  component: lazy(() =>
    import('@/components/handouts/documents-panel').then((m) => ({
      default: m.DocumentsPanel,
    })),
  ),
} as const satisfies PanelFeature;
