// Store des climats météo SUPPLÉMENTAIRES enregistrés par un bundle de règles (via
// api.map.registerWeather). Le moteur de rendu (WeatherCanvas) sait dessiner tous les types connus,
// mais certains ne sont thématiques que pour un système donné (ex 'alert' / 'static' pour Star Wars)
// et ne doivent PAS apparaître dans le picker météo tant que le bundle qui les fournit n'est pas
// chargé. Ce singleton (même patron que view-flags-store / map-overlay-store) porte la liste que le
// picker fusionne avec ses climats natifs. Vidé au déchargement du bundle par l'ExtensionHost.

import type { WeatherType } from './weather-store';

export interface WeatherClimateOption {
  /** Type de climat — doit être un WeatherType que WeatherCanvas sait rendre. */
  type: WeatherType;
  /** Libellé affiché dans le picker (ex « Alerte rouge »). */
  label: string;
  /** Nom d'icône lucide-react (ex 'Siren', 'RadioTower') — résolu par le picker, fallback si inconnu. */
  icon?: string;
}

let climates: WeatherClimateOption[] = [];
const listeners = new Set<() => void>();
// Identité stable côté SSR/first snapshot pour useSyncExternalStore (évite une boucle d'hydratation).
const EMPTY: WeatherClimateOption[] = [];

function notify() {
  listeners.forEach((fn) => fn());
}

/** Remplace la liste des climats bundle (register est un remplacement complet, jamais un cumul —
 *  comme setOverlays). No-op si identique (mêmes type+label+icon dans le même ordre). */
export function setWeatherClimates(next: WeatherClimateOption[]): void {
  const same =
    next.length === climates.length &&
    next.every((c, i) => c.type === climates[i].type && c.label === climates[i].label && c.icon === climates[i].icon);
  if (same) return;
  climates = next.length > 0 ? next.slice() : EMPTY;
  notify();
}

export function getWeatherClimates(): WeatherClimateOption[] {
  return climates;
}

export function getServerWeatherClimates(): WeatherClimateOption[] {
  return EMPTY;
}

export function subscribeWeatherClimates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
