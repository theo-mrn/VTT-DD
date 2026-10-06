/**
 * Réglages de l'outil Mesurer (barre de l'outil), gardés dans le navigateur : forme, couleur,
 * options du cône, effets animés, « Épingler au lâcher », et pour le MJ « Visible des joueurs ».
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import {
  coneRecord,
  DEFAULT_CONE_ANGLE,
  DEFAULT_MEASURE_COLOR,
  MEASURE_SHAPES,
  type ConeOptions,
  type MeasureShape,
} from './model';

export interface MeasureSettings {
  shape: MeasureShape;
  /** Couleur (donnée, `#rrggbb`). */
  color: string;
  cone: ConeOptions;
  /** Effet animé choisi par forme (chemin relatif de l'ancienne app, null : aucun). */
  skins: { circle: string | null; cone: string | null };
  /** Le lâcher pose tout de suite un gabarit durable (l'ancien « Mode permanent »). */
  pinOnRelease: boolean;
  /** MJ : la mesure en cours part aussi aux joueurs (sinon aux MJ seulement). */
  shared: boolean;
}

export const DEFAULT_MEASURE_SETTINGS: MeasureSettings = {
  shape: 'line',
  color: DEFAULT_MEASURE_COLOR,
  cone: { angle: DEFAULT_CONE_ANGLE, mode: 'angle', width: null, length: null, rounded: true },
  skins: { circle: null, cone: null },
  pinOnRelease: false,
  shared: true,
};

const KEY = 'vtt:carte:mesure';

function load(): MeasureSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULT_MEASURE_SETTINGS;
    const v = JSON.parse(raw) as Partial<MeasureSettings>;
    const d = DEFAULT_MEASURE_SETTINGS;
    return {
      shape: MEASURE_SHAPES.some((s) => s.value === v.shape) ? v.shape! : d.shape,
      color: typeof v.color === 'string' && v.color ? v.color : d.color,
      cone: { ...d.cone, ...v.cone },
      skins: { ...d.skins, ...v.skins },
      pinOnRelease: v.pinOnRelease === true,
      shared: v.shared !== false,
    };
  } catch {
    return DEFAULT_MEASURE_SETTINGS;
  }
}

const stores = new WeakMap<MapEngine, StoreApi<MeasureSettings>>();

/** Réglages de l'outil pour ce moteur, gardés dans le navigateur à chaque changement. */
export function measureSettings(engine: MapEngine): StoreApi<MeasureSettings> {
  let store = stores.get(engine);
  if (!store) {
    store = createStore<MeasureSettings>()(load);
    store.subscribe((s) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        // Stockage indisponible : les réglages valent pour la session
      }
    });
    stores.set(engine, store);
  }
  return store;
}

/** Options enregistrées de la forme (cône : noms de l'ancienne app). */
export const optionsFor = (s: MeasureSettings, shape: MeasureShape): Record<string, unknown> =>
  shape === 'cone' ? coneRecord(s.cone) : {};

/** Effet animé de la forme (cercle et cône seulement). */
export const skinFor = (s: MeasureSettings, shape: MeasureShape): string | null =>
  shape === 'circle' || shape === 'cone' ? s.skins[shape] : null;
