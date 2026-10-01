/**
 * Préférence locale du fond vidéo (confort de chacun, jamais partagée) : la vidéo joue, ou reste
 * sur sa première image. « Mouvement réduit » et les machines économes la figent par défaut ;
 * gardée dans `localStorage` quand il répond : un choix explicite l'emporte toujours.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { prefersEconomy, prefersReducedMotion } from '@/lib/perf/device';
import type { MapEngine } from './map-engine';

const VIDEO_EXT = /\.(webm|mp4|m4v|mov)(\?|#|$)/i;
/** Fond vidéo (sinon une image). Ici et pas dans `background.ts`, qui importe Pixi. */
export const isVideoUrl = (url: string) => VIDEO_EXT.test(url);

export interface BackgroundPrefs {
  /** Le fond vidéo joue (sinon sa première image). */
  animate: boolean;
}

const KEY = 'vtt:carte:fond-anime';

function initial(): BackgroundPrefs {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  } catch {
    stored = null;
  }
  return {
    animate:
      stored === '0' || stored === '1'
        ? stored === '1'
        : !prefersReducedMotion() && !prefersEconomy(),
  };
}

const stores = new WeakMap<MapEngine, StoreApi<BackgroundPrefs>>();

/** Préférence du fond pour ce moteur (une par carte montée). */
export function backgroundPrefs(engine: MapEngine): StoreApi<BackgroundPrefs> {
  let store = stores.get(engine);
  if (!store) {
    store = createStore<BackgroundPrefs>()(initial);
    stores.set(engine, store);
  }
  return store;
}

export function setBackgroundAnimation(engine: MapEngine, on: boolean) {
  backgroundPrefs(engine).setState({ animate: on });
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Stockage indisponible : la préférence vaut pour la session
  }
}
