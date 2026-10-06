/**
 * Module « affichage de la scène » (docs/carte.md § 10, Fond et scènes) : le fond de la scène
 * et les familles affichées à toute la table (MJ).
 */
import { ImageIcon, SlidersHorizontal } from 'lucide-react';
import { BackgroundButton, DisplayMenu } from './ui/scene-display';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapModule } from '@/lib/map/engine/map-engine';

export const sceneDisplayModule: MapModule = {
  id: 'scene-display',
  register: (engine) => [
    engine.registerToolbarEntry({
      kind: 'custom',
      id: 'scene.background',
      label: 'Fond de la scène',
      icon: ImageIcon,
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
