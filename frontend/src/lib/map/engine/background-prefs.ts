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

/** Domaines de la bibliothèque (même bucket R2), où existent les variantes 1080p. */
const LIBRARY = ['https://assets.yner.fr/', 'https://pub-6b6ff93daa684afe8aca1537c143add0.r2.dev/'];

/**
 * Variante 1080p d'une carte animée de la bibliothèque (`infra/library/maps-1080p.sh`) :
 * `Map/…/Animated/X.webm` → `Map/…/Animated/1080p/X.mp4`, H.264 décodé par le matériel (les
 * originaux sont en VP8 4K à 60 i/s). Null hors bibliothèque : l'original est lu tel quel.
 */
export function videoVariant(url: string): string | null {
  const host = LIBRARY.find((h) => url.startsWith(h));
  if (!host) return null;
  const path = url.slice(host.length).split(/[?#]/)[0]!;
  const m = /^(Map\/.+)\/([^/]+)\.(webm|mp4)$/i.exec(path);
  return m ? `${host}${m[1]}/1080p/${m[2]}.mp4` : null;
}

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
