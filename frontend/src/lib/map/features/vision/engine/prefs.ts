/**
 * Préférences locales de la visibilité (confort de chacun, jamais partagées) : animation de la
 * brume (« mouvement réduit » et les machines économes l'éteignent par défaut) et rayons de
 * vision (montrés par défaut). Gardées dans `localStorage` quand il répond : un choix explicite
 * l'emporte toujours sur le défaut.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { prefersEconomy, prefersReducedMotion } from '@/lib/perf/device';
import type { MapEngine } from '@/lib/map/engine/map-engine';

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
  return {
    fogAnimation:
      stored === '0' || stored === '1'
        ? stored === '1'
        : !prefersReducedMotion() && !prefersEconomy(),
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
