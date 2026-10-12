import { Coffee } from 'lucide-react';
import { lazy } from 'react';
import { useStore } from 'zustand';
import type { ActionFeature } from '../types';
import { tablePause, togglePause } from './state';

/** Pause de table : un bouton (sans panneau) qui fige la partie chez tous, reclic pour reprendre. */
export const pauseFeature = {
  kind: 'action',
  id: 'pause',
  icon: Coffee,
  roles: ['gm'],
  extra: true,
  run: togglePause,
  useActive: () => useStore(tablePause.store, (s) => s.value !== null),
  overlay: lazy(() => import('./ui/pause-overlay').then((m) => ({ default: m.PauseOverlay }))),
} as const satisfies ActionFeature;
