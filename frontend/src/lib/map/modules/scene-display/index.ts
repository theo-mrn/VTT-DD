/**
 * Module « affichage de la scène » (docs/carte.md § 10, Fond et scènes) : le fond de la scène
 * et les familles affichées à toute la table (MJ).
 */
import { SlidersHorizontal } from 'lucide-react';
import { BackgroundButton, DisplayMenu } from '@/components/map/scenes/scene-display';
import { isGm } from '../../engine/entities/entity-kind';
import type { MapModule } from '../../engine/map-engine';

export const sceneDisplayModule: MapModule = {
  id: 'scene-display',
  register: (engine) => [
    engine.registerToolbarEntry({
      kind: 'custom',
      id: 'scene.background',
      group: 'view',
      order: 31,
      available: isGm,
      component: BackgroundButton,
    }),
    engine.registerToolbarEntry({
      kind: 'menu',
      id: 'scene.display',
      group: 'view',
      order: 32,
      label: 'Affichage',
      icon: SlidersHorizontal,
      available: isGm,
      className: 'p-3',
      content: DisplayMenu,
    }),
  ],
};
