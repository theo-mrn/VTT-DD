/** Ouverture du panneau des calques (sur mon écran), un magasin par moteur. */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '@/lib/map/engine/map-engine';

export interface LayersPanelState {
  open: boolean;
}

const panels = new WeakMap<MapEngine, StoreApi<LayersPanelState>>();

export function layersPanelOf(engine: MapEngine): StoreApi<LayersPanelState> {
  let store = panels.get(engine);
  if (!store) {
    store = createStore<LayersPanelState>()(() => ({ open: false }));
    panels.set(engine, store);
  }
  return store;
}

/** Ouvre, ferme ou bascule (sans argument) le panneau des calques. */
export function toggleLayersPanel(engine: MapEngine, open?: boolean) {
  layersPanelOf(engine).setState((s) => ({ open: open ?? !s.open }));
}
