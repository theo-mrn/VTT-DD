/**
 * Module « calques » (docs/carte.md § 5, Calques du MJ) : le bouton et la touche K du panneau
 * des calques.
 */
import { Layers } from 'lucide-react';
import { useStore } from 'zustand';
import { isGm } from '../../engine/entities/entity-kind';
import type { MapModule } from '../../engine/map-engine';

export const layersModule: MapModule = {
  id: 'layers',
  register: (engine) => [
    engine.registerAction({
      id: 'layers.panel',
      label: 'Calques',
      icon: Layers,
      shortcut: { code: 'KeyK', label: 'K' },
      available: isGm,
      run: (e) => e.toggleLayersPanel(),
      useStatus: (e) => ({ active: useStore(e.ui, (s) => s.layersPanel) }),
      toolbar: { group: 'view', order: 30 },
    }),
  ],
};
