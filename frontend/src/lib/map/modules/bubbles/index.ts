/**
 * Module « bulles » (docs/carte.md § 8) : le bouton Bulle du joueur, qui fait parler son héros.
 * Le calque des bulles et la touche K restent montés par `map-canvas.tsx` (MapBubbles).
 */
import { BubbleToolbarButton } from '@/components/map/bubbles/bubble-picker';
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
  ],
};
