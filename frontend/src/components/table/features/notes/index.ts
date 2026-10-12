import { NotebookPen } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

export const notesFeature = {
  kind: 'panel',
  id: 'notes',
  icon: NotebookPen,
  shortcut: { code: 'KeyN', label: 'N' },
  width: 'full',
  mode: 'side',
  roles: ALL_ROLES,
  activity: ['note.created'],
  component: lazy(() => import('../../onglets/notes').then((m) => ({ default: m.OngletNotes }))),
} as const satisfies PanelFeature;
