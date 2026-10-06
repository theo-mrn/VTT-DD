/**
 * Module « bulles » (docs/carte.md § 8) : le bouton Bulle du joueur, qui fait parler son héros,
 * et `MapBubbles` (réception et envoi sur le canal éphémère, bulles au-dessus des tokens, touche
 * K du joueur, écoutée sur toute la table et pas seulement sur la carte).
 */
import { BubbleToolbarButton } from '@/components/map/bubbles/bubble-picker';
import { MapBubbles } from '@/components/map/bubbles/map-bubbles';
import type { MapModule } from '../../engine/map-engine';

export const bubblesModule: MapModule = {
  id: 'bubbles',
  register: (engine) => [
    engine.registerToolbarEntry({
      kind: 'custom',
      id: 'bubbles',
      group: 'view',
      order: 0,
      available: (viewer) => viewer.role === 'player',
      component: BubbleToolbarButton,
    }),
    engine.registerOverlay({ id: 'bubbles.layer', slot: 'none', component: MapBubbles }),
  ],
};
