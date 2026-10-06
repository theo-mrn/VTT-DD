/**
 * État partagé du module « météo » : préférences locales de chacun, aperçu du MJ pendant un
 * geste, et enregistrement de la météo de la scène (commande annulable, `PATCH /maps/:mapId`).
 */
import type { MapWeather } from '@vtt/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '@/lib/map/engine/map-engine';

export interface WeatherPrefs {
  /** La météo s'anime (sinon une image fixe et discrète). */
  animate: boolean;
  /** Éclairs, pulsation de l'alerte, bandes des parasites. */
  flashes: boolean;
}

const ANIMATE_KEY = 'vtt:carte:meteo-animee';
const FLASHES_KEY = 'vtt:carte:meteo-eclairs';

function read(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Stockage indisponible : la préférence vaut pour la session
  }
}

/** Préférence enregistrée, sinon : permise sauf « mouvement réduit ». */
function initial(): WeatherPrefs {
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pick = (key: string) => {
    const stored = read(key);
    return stored === '0' || stored === '1' ? stored === '1' : !reduced;
  };
  return { animate: pick(ANIMATE_KEY), flashes: pick(FLASHES_KEY) };
}

const prefsStores = new WeakMap<MapEngine, StoreApi<WeatherPrefs>>();

/** Préférences de la météo pour ce moteur (une par carte montée). */
export function weatherPrefs(engine: MapEngine): StoreApi<WeatherPrefs> {
  let store = prefsStores.get(engine);
  if (!store) {
    store = createStore<WeatherPrefs>()(initial);
    prefsStores.set(engine, store);
  }
  return store;
}

export function setWeatherAnimated(engine: MapEngine, on: boolean) {
  weatherPrefs(engine).setState({ animate: on });
  write(ANIMATE_KEY, on);
  engine.invalidate();
}

export function setWeatherFlashes(engine: MapEngine, on: boolean) {
  weatherPrefs(engine).setState({ flashes: on });
  write(FLASHES_KEY, on);
  engine.invalidate();
}

/**
 * Aperçu local du MJ pendant un geste (curseur d'intensité, de force du vent) : montré sur son
 * écran seulement, puis remplacé par la commande au lâcher. `undefined` : pas d'aperçu.
 */
export interface WeatherPreview {
  weather: MapWeather | null | undefined;
}

const previews = new WeakMap<MapEngine, StoreApi<WeatherPreview>>();

export function weatherPreview(engine: MapEngine): StoreApi<WeatherPreview> {
  let store = previews.get(engine);
  if (!store) {
    store = createStore<WeatherPreview>()(() => ({ weather: undefined }));
    previews.set(engine, store);
  }
  return store;
}

export function setWeatherPreview(engine: MapEngine, weather: MapWeather | null | undefined) {
  weatherPreview(engine).setState({ weather });
}

/** Météo enregistrée de la scène affichée (null : aucune). */
export function sceneWeather(engine: MapEngine): MapWeather | null {
  return (engine.store.getState().scene?.weather as MapWeather | null | undefined) ?? null;
}

/** Météo à dessiner : l'aperçu du MJ s'il y en a un, sinon celle de la scène. */
export function displayedWeather(engine: MapEngine): MapWeather | null {
  const preview = weatherPreview(engine).getState().weather;
  return preview !== undefined ? preview : sceneWeather(engine);
}

/** Enregistre la météo de la scène : une commande annulable (« Météo »), l'aperçu effacé. */
export function saveWeather(engine: MapEngine, weather: MapWeather | null, label = 'Météo') {
  setWeatherPreview(engine, undefined);
  const current = sceneWeather(engine);
  if (JSON.stringify(current) === JSON.stringify(weather)) return null;
  return engine.updateScene(label, { weather });
}
