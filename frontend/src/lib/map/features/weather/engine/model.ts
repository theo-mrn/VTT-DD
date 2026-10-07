/**
 * Règles de la météo, sans Pixi ni DOM (docs/carte.md § 10, Météo) : lecture de `maps.weather`
 * (données anciennes comprises), vent effectif, budget de particules.
 */
import { translate } from '@/i18n/runtime';
import type { MapWeather } from '@vtt/contracts';
import { WEATHER_EFFECTS, type WeatherEffect, type WeatherType, weatherName } from './effects';

/** Images par seconde demandées par la météo elle-même, au plus. */
export const WEATHER_FPS = 30;
/** Même chose sur une machine économe (Windows, machine modeste). */
export const WEATHER_FPS_ECONOMY = 20;
/**
 * Plafonds de particules : par million de pixels CSS de la vue (le nombre reste proportionnel à
 * sa surface), et en tout (grands écrans) ; moitié moins sur une machine économe (option
 * `windows` : Windows, où des plantages GPU ont été relevés, ou machine modeste).
 */
export const MAX_DENSITY = 1_400;
export const MAX_DENSITY_WINDOWS = 700;
export const MAX_PARTICLES = 3_000;
export const MAX_PARTICLES_WINDOWS = 1_200;
/**
 * Intensité enregistrée la plus forte (le contrat accepte jusqu'à 10 : au-delà, comprise comme
 * 2). 1 garde son sens, l'ancien maximum, désormais au milieu du curseur ; de 1 à 2, le
 * renfort de l'effet (`strong`) monte linéairement.
 */
export const MAX_INTENSITY = 2;
/** Image fixe (animation coupée, « mouvement réduit ») : part des particules et de leur opacité. */
export const STILL_COUNT = 0.35;
export const STILL_ALPHA = 0.6;

/** Météo lue et bornée : l'effet, l'intensité de 0 à 2, le vent effectif. */
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
  typeof t === 'string' && Object.hasOwn(WEATHER_EFFECTS, t);

/** Effet d'une météo enregistrée, null s'il n'y en a pas ou s'il est inconnu. */
export function effectOf(raw: unknown): WeatherEffect | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as { type?: unknown }).type;
  return isType(type) ? WEATHER_EFFECTS[type] : null;
}

/** Intensité de 0 à 2 (le contrat accepte jusqu'à 10 : au-delà de 2, comprise comme 2). */
export function clampIntensity(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_INTENSITY, Math.max(0, v)) : 0;
}

/** Part de l'intensité jusqu'à l'ancien maximum (0 à 1) : les plages des effets. */
export const baseLevel = (intensity: number) => Math.min(1, Math.max(0, intensity));

/**
 * Renfort au-delà de 1 : ×1 à l'intensité 1, ×`factor` à 2, linéaire entre les deux (aucun
 * palier) ; ×1 en dessous de 1.
 */
export function overdrive(intensity: number, factor: number | undefined): number {
  const k = Math.min(1, Math.max(0, intensity - 1));
  return 1 + k * ((factor ?? 1) - 1);
}

/** Part du nombre de particules : l'intensité jusqu'à 1, puis le renfort de l'effet. */
export function densityFactor(effect: WeatherEffect, intensity: number): number {
  return intensity <= 1 ? Math.max(0, intensity) : overdrive(intensity, effect.strong.density);
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
  /** Réglages économes : plafonds bas (Windows, machine modeste). */
  windows?: boolean;
  /** Image fixe (animation coupée) : 35 % des particules, sans les éclaboussures. */
  still?: boolean;
  /** Part du budget gardée (dégradation automatique quand les images coûtent trop) ; 1 : tout. */
  scale?: number;
}

/**
 * Nombre de particules de chaque émetteur : densité × surface de la vue × part de l'intensité
 * (renfort compris), puis le total ramené proportionnellement sous le plafond : par million de
 * pixels et en tout, plus bas sous Windows.
 */
export function particleBudget(effect: WeatherEffect, opts: BudgetOptions): number[] {
  const area = (Math.max(0, opts.width) * Math.max(0, opts.height)) / 1_000_000;
  const level = densityFactor(effect, clampIntensity(opts.intensity));
  const raw = effect.emitters.map((e) => {
    if (opts.still && e.still === false) return 0;
    return e.density * area * level * (opts.still ? STILL_COUNT : 1);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  const scale = Math.min(1, Math.max(0, opts.scale ?? 1));
  const cap =
    (opts.windows
      ? Math.min(MAX_PARTICLES_WINDOWS, MAX_DENSITY_WINDOWS * area)
      : Math.min(MAX_PARTICLES, MAX_DENSITY * area)) * scale;
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
  const effect = effectOf(raw);
  return effect ? weatherName(effect.id) : translate('map.weather.none');
}
