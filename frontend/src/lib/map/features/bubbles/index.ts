/**
 * Module « bulles » (docs/carte.md § 8) : le bouton Bulle du joueur, qui fait parler son héros,
 * et `MapBubbles` (réception et envoi sur le canal éphémère, bulles au-dessus des tokens, touche
 * K du joueur, écoutée sur toute la table et pas seulement sur la carte).
 */
import { translate } from '@/i18n/runtime';
import { MessageCircle } from 'lucide-react';
import { BubbleToolbarButton } from './ui/bubble-picker';
import { MapBubbles } from './ui/map-bubbles';
import type { MapFeature } from '@/lib/map/engine/map-engine';

export const bubblesFeature: MapFeature = {
  id: 'bubbles',
  register: (engine) => [
    engine.registerToolbarEntry({
      kind: 'custom',
      id: 'bubbles',
      label: translate('shortcuts.commands.bubble'),
      icon: MessageCircle,
      group: 'view',
      order: 0,
      available: (viewer) => viewer.role === 'player',
      component: BubbleToolbarButton,
    }),
    engine.registerOverlay({ id: 'bubbles.layer', slot: 'none', component: MapBubbles }),
  ],
};
