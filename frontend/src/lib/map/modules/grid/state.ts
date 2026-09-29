/**
 * État partagé du module « quadrillage » : réglages du calibrage (menu et outil) et
 * enregistrement des quadrillages de la scène (commande annulable, `PATCH /maps/:mapId`).
 */
import type { MapGrid } from '@vtt/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '../../engine/map-engine';

export interface CalibrateSettings {
  /** Quadrillage à aligner. */
  gridId: string | null;
  /** Cases couvertes par le glisser. */
  cells: number;
}

const calibrations = new WeakMap<MapEngine, StoreApi<CalibrateSettings>>();

/** Réglages du calibrage de ce moteur (partagés par le menu et l'outil). */
export function calibrateSettings(engine: MapEngine): StoreApi<CalibrateSettings> {
  let store = calibrations.get(engine);
  if (!store) {
    store = createStore<CalibrateSettings>()(() => ({ gridId: null, cells: 1 }));
    calibrations.set(engine, store);
  }
  return store;
}

/** Quadrillages de la scène affichée (copie modifiable). */
export const gridsOf = (engine: MapEngine): MapGrid[] =>
  ((engine.store.getState().scene?.grids as MapGrid[] | undefined) ?? []).slice();

/** Enregistre les quadrillages de la scène (commande annulable). */
export function saveGrids(engine: MapEngine, label: string, grids: MapGrid[]) {
  return engine.updateScene(label, { grids });
}
