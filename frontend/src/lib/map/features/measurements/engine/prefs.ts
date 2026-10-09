/**
 * Préférences locales des mesures (confort de chacun, jamais partagées), gardées dans
 * `localStorage` quand il répond : distance au clic, effets animés. Le décompte des diagonales
 * est une règle de la table, réglée par le MJ (`map_settings.diagonals`).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '@/lib/map/engine/map-engine';

export interface MeasurePrefs {
  /** Distance depuis mon personnage au clic (activée par défaut). */
  clickDistance: boolean;
  /** Effets animés des gabarits (éteints avec « mouvement réduit » : image fixe). */
  animateSkins: boolean;
}

const KEYS = {
  clickDistance: 'vtt:carte:distance-clic',
  animateSkins: 'vtt:carte:effets-animes',
} as const;

function read(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée) : la préférence vaut pour la session
  }
}

function initial(): MeasurePrefs {
  const skins = read(KEYS.animateSkins);
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    clickDistance: read(KEYS.clickDistance) !== '0',
    animateSkins: skins === '0' || skins === '1' ? skins === '1' : !reduced,
  };
}

const stores = new WeakMap<MapEngine, StoreApi<MeasurePrefs>>();

/** Préférences des mesures pour ce moteur (une par carte montée). */
export function measurePrefs(engine: MapEngine): StoreApi<MeasurePrefs> {
  let store = stores.get(engine);
  if (!store) {
    store = createStore<MeasurePrefs>()(initial);
    stores.set(engine, store);
  }
  return store;
}

export function setClickDistance(engine: MapEngine, on: boolean) {
  measurePrefs(engine).setState({ clickDistance: on });
  write(KEYS.clickDistance, on ? '1' : '0');
  engine.invalidate();
}

export function setAnimateSkins(engine: MapEngine, on: boolean) {
  measurePrefs(engine).setState({ animateSkins: on });
  write(KEYS.animateSkins, on ? '1' : '0');
  engine.invalidate();
}
