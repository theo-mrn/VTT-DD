/**
 * Préférences locales de la visibilité (confort de chacun, jamais partagées) : animation de la
 * brume. Gardées dans `localStorage` quand il répond ; « mouvement réduit » l'éteint par défaut.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '../../engine/map-engine';

export interface VisionPrefs {
  /** La brume dérive lentement (sinon figée). */
  fogAnimation: boolean;
}

const KEY = 'vtt:carte:brume-animee';

function initial(): VisionPrefs {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  } catch {
    stored = null;
  }
  if (stored === '0' || stored === '1') return { fogAnimation: stored === '1' };
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { fogAnimation: !reduced };
}

const stores = new WeakMap<MapEngine, StoreApi<VisionPrefs>>();

/** Préférences de la visibilité pour ce moteur (une par carte montée). */
export function visionPrefs(engine: MapEngine): StoreApi<VisionPrefs> {
  let store = stores.get(engine);
  if (!store) {
    store = createStore<VisionPrefs>()(initial);
    stores.set(engine, store);
  }
  return store;
}

export function setFogAnimation(engine: MapEngine, on: boolean) {
  visionPrefs(engine).setState({ fogAnimation: on });
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Stockage indisponible : la préférence vaut pour la session
  }
  engine.invalidate();
}
