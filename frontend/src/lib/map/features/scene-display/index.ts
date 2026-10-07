/**
 * Module « affichage de la scène » (docs/carte.md § 10, Fond et scènes) : le fond de la scène
 * et les familles affichées à toute la table (MJ).
 */
import { translate } from '@/i18n/runtime';
import { ImageIcon, SlidersHorizontal } from 'lucide-react';
import { BackgroundButton, DisplayMenu } from './ui/scene-display';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapFeature } from '@/lib/map/engine/map-engine';

export const sceneDisplayFeature: MapFeature = {
  id: 'scene-display',
  register: (engine) => [
    engine.registerToolbarEntry({
      kind: 'custom',
      id: 'scene.background',
      label: translate('map.display.background'),
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
      label: translate('map.display.display'),
      icon: SlidersHorizontal,
      available: isGm,
      className: 'p-3',
      content: DisplayMenu,
    }),
  ],
};
