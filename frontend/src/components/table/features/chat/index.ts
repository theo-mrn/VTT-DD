import { MessagesSquare } from 'lucide-react';
import { lazy } from 'react';
import { isChatEventForMe } from '@/lib/campaign-chat';
import { ALL_ROLES, type PanelFeature } from '../types';

export const chatFeature = {
  kind: 'panel',
  id: 'chat',
  icon: MessagesSquare,
  shortcut: { code: 'KeyC', label: 'C' },
  width: 'narrow',
  mode: 'side',
  roles: ALL_ROLES,
  activity: ['campaign.message_posted'],
  activityFilter: isChatEventForMe,
  component: lazy(() => import('../../onglets/chat').then((m) => ({ default: m.ChatPanel }))),
} as const satisfies PanelFeature;
