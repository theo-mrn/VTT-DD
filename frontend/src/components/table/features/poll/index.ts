import { Vote } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Sondage rapide : le MJ pose une question (« On va où ? »), la table vote d'un clic, les
 * résultats suivent en direct (`state.ts`).
 */
export const pollFeature = {
  kind: 'panel',
  id: 'poll',
  icon: Vote,
  width: 'compact',
  mode: 'floating',
  roles: ['gm'],
  extra: true,
  component: lazy(() => import('./ui/poll-panel').then((m) => ({ default: m.PollPanel }))),
  overlay: lazy(() => import('./ui/poll-overlay').then((m) => ({ default: m.PollOverlay }))),
} as const satisfies PanelFeature;
