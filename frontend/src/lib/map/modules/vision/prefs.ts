/**
 * Préférences locales de la visibilité (confort de chacun, jamais partagées) : animation de la
 * brume (« mouvement réduit » l'éteint par défaut) et rayons de vision (montrés par défaut).
 * Gardées dans `localStorage` quand il répond.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '../../engine/map-engine';

export interface VisionPrefs {
  /** La brume dérive lentement (sinon figée). */
  fogAnimation: boolean;
  /** Cercle du rayon de vision autour des observateurs (les siens, ceux des joueurs pour le MJ). */
  visionRadius: boolean;
}

const KEY = 'vtt:carte:brume-animee';
const RADIUS_KEY = 'vtt:carte:rayons-vision';

function read(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function initial(): VisionPrefs {
  const stored = read(KEY);
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    fogAnimation: stored === '0' || stored === '1' ? stored === '1' : !reduced,
    visionRadius: read(RADIUS_KEY) !== '0',
  };
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

export function setVisionRadiusShown(engine: MapEngine, on: boolean) {
  visionPrefs(engine).setState({ visionRadius: on });
  try {
    localStorage.setItem(RADIUS_KEY, on ? '1' : '0');
  } catch {
    // Stockage indisponible : la préférence vaut pour la session
  }
  engine.invalidate();
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
