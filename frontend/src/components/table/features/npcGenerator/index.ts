import { IdCard } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Générateur de PNJ express (MJ) : nom selon le peuple, métier, trait, manie, voix, motivation,
 * secret ; d'un clic dans Mes PNJ (`generate.ts`).
 */
export const npcGeneratorFeature = {
  kind: 'panel',
  id: 'npcGenerator',
  icon: IdCard,
  width: 'narrow',
  mode: 'side',
  roles: ['gm'],
  extra: true,
  component: lazy(() =>
    import('./ui/npc-generator-panel').then((m) => ({ default: m.NpcGeneratorPanel })),
  ),
} as const satisfies PanelFeature;
