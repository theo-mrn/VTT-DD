/**
 * Règles de la météo, sans Pixi ni DOM (docs/carte.md § 10, Météo) : lecture de `maps.weather`
 * (données anciennes comprises), vent effectif, budget de particules.
 */
import type { MapWeather } from '@vtt/contracts';
import { WEATHER_EFFECTS, type WeatherEffect, type WeatherType } from './effects';

/** Images par seconde demandées par la météo elle-même, au plus. */
export const WEATHER_FPS = 30;
/** Plafond de particules (toute la vue), et sous Windows (plantages GPU relevés). */
export const MAX_PARTICLES = 1_400;
export const MAX_PARTICLES_WINDOWS = 600;
/** Image fixe (animation coupée, « mouvement réduit ») : part des particules et de leur opacité. */
export const STILL_COUNT = 0.35;
export const STILL_ALPHA = 0.6;

/** Météo lue et bornée : l'effet, l'intensité de 0 à 1, le vent effectif. */
export interface WeatherSettings {
  effect: WeatherEffect;
  intensity: number;
  wind: WeatherWind;
}

export interface WeatherWind {
  /** Degrés, 0 vers l'est, 90 vers le sud. */
  direction: number;
  /** 0 à 1, après le plancher de l'effet. */
  strength: number;
  /** Vecteur unitaire × force (pixels d'écran, y vers le bas). */
  x: number;
  y: number;
}

const isType = (t: unknown): t is WeatherType =>
  typeof t === 'string' && Object.prototype.hasOwnProperty.call(WEATHER_EFFECTS, t);

/** Effet d'une météo enregistrée, null s'il n'y en a pas ou s'il est inconnu. */
export function effectOf(raw: unknown): WeatherEffect | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as { type?: unknown }).type;
  return isType(type) ? WEATHER_EFFECTS[type] : null;
}

/** Intensité de 0 à 1 (l'ancienne app a pu écrire jusqu'à 10 : compris comme 1). */
export function clampIntensity(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Vent enregistré, sinon celui de l'effet ; plancher de l'effet ; sans vent pour l'alerte. */
export function windOf(effect: WeatherEffect, raw: MapWeather['wind'] | undefined): WeatherWind {
  const base = effect.wind;
  if (!base) return { direction: 0, strength: 0, x: 0, y: 0 };
  const w = raw && Number.isFinite(raw.direction) && Number.isFinite(raw.strength) ? raw : base;
  const direction = (((w.direction % 360) + 360) % 360) as number;
  const strength = Math.max(effect.minWind ?? 0, Math.min(1, Math.max(0, w.strength)));
  const rad = (direction * Math.PI) / 180;
  return { direction, strength, x: Math.cos(rad) * strength, y: Math.sin(rad) * strength };
}

/**
 * Météo à afficher : null pour aucune, un type inconnu, ou une intensité nulle (rien ne se
 * dessine, rien ne tourne).
 */
export function normalizeWeather(raw: unknown): WeatherSettings | null {
  const effect = effectOf(raw);
  if (!effect) return null;
  const w = raw as MapWeather;
  const intensity = clampIntensity(w.intensity);
  if (intensity <= 0) return null;
  return { effect, intensity, wind: windOf(effect, w.wind) };
}

export interface BudgetOptions {
  /** Taille de la vue, en pixels CSS. */
  width: number;
  height: number;
  intensity: number;
  windows?: boolean;
  /** Image fixe (animation coupée) : 35 % des particules, sans les éclaboussures. */
  still?: boolean;
}

/**
 * Nombre de particules de chaque émetteur : densité × surface de la vue × intensité, puis le
 * total ramené proportionnellement sous le plafond (plus bas sous Windows).
 */
export function particleBudget(effect: WeatherEffect, opts: BudgetOptions): number[] {
  const area = (Math.max(0, opts.width) * Math.max(0, opts.height)) / 1_000_000;
  const intensity = clampIntensity(opts.intensity);
  const raw = effect.emitters.map((e) => {
    if (opts.still && e.still === false) return 0;
    return e.density * area * intensity * (opts.still ? STILL_COUNT : 1);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  const cap = opts.windows ? MAX_PARTICLES_WINDOWS : MAX_PARTICLES;
  const k = total > cap ? cap / total : 1;
  return raw.map((n) => Math.floor(n * k));
}

/** Plateforme Windows (plafond plus bas), d'après le navigateur donné. */
export function isWindowsPlatform(
  nav: { platform?: string; userAgent?: string; userAgentData?: { platform?: string } } | undefined,
): boolean {
  if (!nav) return false;
  return (
    /win/i.test(nav.userAgentData?.platform ?? nav.platform ?? '') ||
    /Windows/i.test(nav.userAgent ?? '')
  );
}

/** Nom lisible d'une météo enregistrée (« Pluie », « Aucune »). */
export function weatherLabel(raw: unknown): string {
  return effectOf(raw)?.label ?? 'Aucune';
}
