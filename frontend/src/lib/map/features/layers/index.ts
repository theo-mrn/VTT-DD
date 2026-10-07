/**
 * Module « calques » (docs/carte.md § 5, Calques du MJ) : le panneau des calques (colonne de
 * droite), son bouton et la touche K. La pile, le calque actif, l'œil local et l'isolement
 * restent au moteur : le rendu et le toucher en dépendent.
 */
import { translate } from '@/i18n/runtime';
import { Layers } from 'lucide-react';
import { useStore } from 'zustand';
import { LayersPanel } from './ui/layers-panel';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { layersPanelOf, toggleLayersPanel } from './engine/panel';

export const layersFeature: MapFeature = {
  id: 'layers',
  register: (engine) => [
    engine.registerAction({
      id: 'layers.panel',
      label: translate('map.actions.layersPanel'),
      icon: Layers,
      shortcut: { code: 'KeyK', label: 'K' },
      available: isGm,
      run: (e) => toggleLayersPanel(e),
      useStatus: (e) => ({ active: useStore(layersPanelOf(e), (s) => s.open) }),
      toolbar: { group: 'view', order: 30 },
    }),
    engine.registerOverlay({
      id: 'layers.panel',
      slot: 'right',
      order: 10,
      available: isGm,
      component: LayersPanel,
    }),
    () => toggleLayersPanel(engine, false),
  ],
};
