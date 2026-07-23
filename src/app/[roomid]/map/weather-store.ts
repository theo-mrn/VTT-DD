// Store global de "météo" de la carte — pont générique entre l'état partagé (settings/general.weather,
// écrit par le MJ, lu par tous via useMapData) et la couche de rendu WeatherCanvas. Même modèle que
// view-flags-store : un singleton lu via useSyncExternalStore, seule porte d'écriture depuis du code
// qui n'a pas accès au state React de page.tsx (ici le listener Firestore de useMapData).
//
// La météo est purement cosmétique : une couche de particules (pluie/neige) ou de nappes (brouillard)
// posée au-dessus des canvas de carte, non bloquante. Elle ne modifie aucune règle de jeu ni la vision.

export type WeatherType = 'none' | 'rain' | 'snow' | 'fog';

export interface WeatherState {
  type: WeatherType;
  /** Densité/opacité relative de l'effet, borné [0..1]. 0 ≈ absent, 1 = maximal. */
  intensity: number;
}

const DEFAULT_WEATHER: WeatherState = { type: 'none', intensity: 0 };

let weather: WeatherState = DEFAULT_WEATHER;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function clampIntensity(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Fusionne une météo partielle dans l'état courant. Appelé par le listener settings/general (synchro
 *  entrante) ou par la mise à jour optimiste du picker MJ (synchro sortante). Ne notifie que si quelque
 *  chose change réellement — évite un re-render inutile de WeatherCanvas. */
export function setWeather(partial: Partial<WeatherState>): void {
  const next: WeatherState = {
    type: partial.type ?? weather.type,
    intensity: partial.intensity !== undefined ? clampIntensity(partial.intensity) : weather.intensity,
  };
  if (next.type === weather.type && next.intensity === weather.intensity) return;
  weather = next;
  notify();
}

/** Coupe toute météo (aucun effet, RAF de WeatherCanvas stoppé). */
export function resetWeather(): void {
  setWeather(DEFAULT_WEATHER);
}

export function getWeather(): WeatherState {
  return weather;
}

/** Snapshot serveur stable (SSR) — identité constante pour éviter les boucles d'hydratation. */
export function getServerWeather(): WeatherState {
  return DEFAULT_WEATHER;
}

export function subscribeWeather(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
