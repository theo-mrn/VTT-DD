/**
 * Catalogue des effets de météo (docs/carte.md § 10, Météo) : des données, lues par la
 * simulation (`simulation.ts`) et par le choix du MJ. Tout est en pixels d'écran (CSS) et en
 * secondes. Les couleurs sont des données de l'effet (RVB), comme la palette des dessins.
 *
 * Un effet se compose de :
 * - un voile plein écran (teinte, opacité à intensité nulle et pleine, respiration lente) ;
 * - des nappes de bruit qui dérivent avec le vent (`TilingSprite`) ;
 * - des émetteurs de particules (2 au plus), chacun un `ParticleContainer` ;
 * - des éclairs (orage), une vignette (alerte) ou un grain de parasites.
 */
import { translate } from '@/i18n/runtime';

/** Frames de l'atlas des particules (`textures.ts`). */
export type AtlasFrame = 'streak' | 'dot' | 'flake' | 'leaf0' | 'leaf1' | 'leaf2' | 'ring';

export type Range = readonly [number, number];

export interface EmitterSpec {
  id: string;
  /** Frames de l'atlas, une tirée par particule. */
  frames: readonly AtlasFrame[];
  /** Teintes (RVB), une tirée par particule. */
  tints: readonly number[];
  blend: 'normal' | 'add';
  /** Particules par million de pixels CSS de la vue, à intensité 1. */
  density: number;
  /** Largeur à l'écran (px) ; taille pour les points et feuilles. */
  size: Range;
  /** Traînées : longueur à l'écran (px), orientée selon la vitesse. */
  length?: Range;
  alpha: Range;
  /** Chute (px/s, négatif : monte). */
  fall: Range;
  /** Vitesse donnée par un vent de force 1 (px/s). */
  drift: number;
  /** Profondeur : facteur tiré par particule sur la vitesse, la taille et l'opacité. */
  depth?: Range;
  /** Balancement perpendiculaire au mouvement : amplitude (px) et fréquence (Hz). */
  sway?: { amp: Range; freq: Range };
  /** Rotation propre (rad/s, sens tiré au hasard). */
  spin?: Range;
  /** Feuille qui se retourne : fréquence (Hz) de l'écrasement de sa hauteur. */
  flip?: Range;
  /** Scintillement doux de l'opacité (Hz). */
  flicker?: Range;
  /** Durée de vie (s) : particule immobile qui grandit et s'efface (éclaboussures). */
  life?: Range;
  /** Taille au début et à la fin de la vie (× `size`). */
  grow?: Range;
  /** Montrée dans l'image fixe (animation coupée) ; faux pour les éclaboussures. */
  still?: boolean;
}

export interface MistSpec {
  color: number;
  /** Opacité à intensité 0 et 1. */
  alpha: Range;
  /** Agrandissement du bruit (256 px). */
  scale: number;
  /** Vitesse (px/s) à vent de force 1 ; un plancher garde la nappe en mouvement. */
  speed: number;
  /** Écart d'angle avec le vent (degrés) : deux nappes ne dérivent pas ensemble. */
  angle?: number;
  /** Respiration : période (s) et amplitude (fraction de l'opacité). */
  breathe?: { period: number; depth: number };
}

export interface StrongSpec {
  density: number;
  speed: number;
  alpha: number;
  lightning?: number;
}

/** Un effet de météo ; son nom : `map.weather.types.<id>` (`weatherName`). */
export interface WeatherEffect {
  id: WeatherType;
  group: 'nature' | 'scifi';
  /** Vent par défaut ; null : le vent n'a pas de sens pour l'effet (alerte, parasites). */
  wind: { direction: number; strength: number } | null;
  /** Force minimale : l'effet reste poussé même « sans vent » (sable, blizzard). */
  minWind?: number;
  /**
   * Renfort au-delà de l'intensité 1 (l'ancien maximum, au milieu du curseur), atteint à 2 :
   * multiplicateurs du nombre de particules, de leur vitesse, des opacités (particules, voile,
   * nappes, vignette, grain) et de la fréquence des éclairs. Montée linéaire entre 1 et 2.
   */
  strong: StrongSpec;
  veil?: {
    color: number;
    alpha: Range;
    breathe?: { period: number; depth: number };
  };
  mists?: readonly MistSpec[];
  emitters: readonly EmitterSpec[];
  lightning?: { color: number; peak: Range; interval: Range };
  vignette?: { color: number; alpha: Range; pulse: { period: number; depth: number } };
  static?: { noise: Range; scanlines: Range; bands: Range };
}

export const WEATHER_TYPES = [
  'rain',
  'storm',
  'snow',
  'blizzard',
  'fog',
  'leaves',
  'embers',
  'sandstorm',
  'alert',
  'static',
] as const;

export type WeatherType = (typeof WEATHER_TYPES)[number];

const RAIN_TINT = 0xaec2e0;
const SPLASH_TINT = 0xc8d6ec;

const rainDrops = (density: number, speed: Range, length: Range): EmitterSpec => ({
  id: 'drops',
  frames: ['streak'],
  tints: [RAIN_TINT],
  blend: 'normal',
  density,
  size: [1, 1.5],
  length,
  alpha: [0.3, 0.55],
  fall: speed,
  drift: 700,
  depth: [0.6, 1],
});

const splashes = (density: number): EmitterSpec => ({
  id: 'splashes',
  frames: ['ring'],
  tints: [SPLASH_TINT],
  blend: 'normal',
  density,
  size: [14, 22],
  alpha: [0.35, 0.55],
  fall: [0, 0],
  drift: 0,
  life: [0.35, 0.55],
  grow: [0.15, 1],
  still: false,
});

/** Nom d'un effet dans la langue de la page. */
export const weatherName = (id: WeatherType) => translate(`map.weather.types.${id}`);

export const WEATHER_EFFECTS: Readonly<Record<WeatherType, WeatherEffect>> = {
  rain: {
    id: 'rain',
    group: 'nature',
    strong: { density: 2.4, speed: 1.3, alpha: 1.35 },
    wind: { direction: 0, strength: 0.2 },
    veil: { color: 0x0f1a2a, alpha: [0.02, 0.08] },
    emitters: [rainDrops(380, [900, 1300], [14, 26]), splashes(40)],
  },
  storm: {
    id: 'storm',
    group: 'nature',
    strong: { density: 2.3, speed: 1.3, alpha: 1.35, lightning: 2 },
    wind: { direction: 0, strength: 0.45 },
    veil: { color: 0x0b1220, alpha: [0.08, 0.22] },
    emitters: [rainDrops(520, [1100, 1600], [18, 34]), splashes(60)],
    lightning: { color: 0xdfe8ff, peak: [0.18, 0.28], interval: [4, 12] },
  },
  snow: {
    id: 'snow',
    group: 'nature',
    strong: { density: 2.4, speed: 1.15, alpha: 1.15 },
    wind: { direction: 0, strength: 0.15 },
    veil: { color: 0xe8eef7, alpha: [0.01, 0.06] },
    emitters: [
      {
        id: 'far',
        frames: ['dot'],
        tints: [0xffffff],
        blend: 'normal',
        density: 170,
        size: [2.5, 4],
        alpha: [0.45, 0.7],
        fall: [25, 45],
        drift: 120,
        sway: { amp: [6, 14], freq: [0.2, 0.45] },
      },
      {
        id: 'near',
        frames: ['flake'],
        tints: [0xffffff],
        blend: 'normal',
        density: 70,
        size: [4.5, 7.5],
        alpha: [0.75, 0.95],
        fall: [50, 85],
        drift: 160,
        sway: { amp: [10, 22], freq: [0.25, 0.5] },
      },
    ],
  },
  blizzard: {
    id: 'blizzard',
    group: 'nature',
    strong: { density: 2.4, speed: 1.35, alpha: 1.35 },
    wind: { direction: 20, strength: 0.85 },
    minWind: 0.35,
    veil: { color: 0xf0f4fa, alpha: [0.08, 0.24] },
    mists: [{ color: 0xffffff, alpha: [0.05, 0.28], scale: 3, speed: 320, angle: 0 }],
    emitters: [
      {
        id: 'gusts',
        frames: ['streak'],
        tints: [0xffffff],
        blend: 'normal',
        density: 320,
        size: [1.5, 2.5],
        length: [6, 14],
        alpha: [0.45, 0.75],
        fall: [60, 140],
        drift: 900,
        depth: [0.6, 1],
      },
      {
        id: 'flakes',
        frames: ['dot'],
        tints: [0xffffff],
        blend: 'normal',
        density: 260,
        size: [2.5, 5],
        alpha: [0.6, 0.9],
        fall: [80, 160],
        drift: 700,
        depth: [0.6, 1],
        sway: { amp: [4, 10], freq: [0.5, 1] },
      },
    ],
  },
  fog: {
    id: 'fog',
    group: 'nature',
    strong: { density: 1, speed: 1.2, alpha: 1.45 },
    wind: { direction: 0, strength: 0.2 },
    veil: { color: 0xd0d5df, alpha: [0.04, 0.16] },
    mists: [
      {
        color: 0xdfe3ea,
        alpha: [0.1, 0.5],
        scale: 3.2,
        speed: 40,
        angle: 0,
        breathe: { period: 9, depth: 0.15 },
      },
      {
        color: 0xe8ebf0,
        alpha: [0.06, 0.36],
        scale: 5.5,
        speed: 70,
        angle: 25,
        breathe: { period: 13, depth: 0.2 },
      },
    ],
    emitters: [],
  },
  leaves: {
    id: 'leaves',
    group: 'nature',
    strong: { density: 2.4, speed: 1.2, alpha: 1 },
    wind: { direction: 15, strength: 0.55 },
    minWind: 0.2,
    emitters: [
      {
        id: 'leaves',
        frames: ['leaf0', 'leaf1', 'leaf2'],
        tints: [0xc2562b, 0xd98e2f, 0x9a6b2e, 0x7d8f3a],
        blend: 'normal',
        density: 26,
        size: [11, 19],
        alpha: [0.85, 1],
        fall: [15, 40],
        drift: 320,
        depth: [0.7, 1],
        sway: { amp: [10, 26], freq: [0.2, 0.5] },
        spin: [0.8, 2.6],
        flip: [0.3, 0.9],
      },
    ],
  },
  embers: {
    id: 'embers',
    group: 'nature',
    strong: { density: 2.4, speed: 1.15, alpha: 1.2 },
    wind: { direction: 0, strength: 0.15 },
    veil: { color: 0x2a1408, alpha: [0.02, 0.1] },
    emitters: [
      {
        id: 'ash',
        frames: ['dot'],
        tints: [0x8f8a84, 0xa39d96, 0x6f6a64],
        blend: 'normal',
        density: 120,
        size: [2.5, 4.5],
        alpha: [0.4, 0.7],
        fall: [18, 40],
        drift: 60,
        sway: { amp: [6, 16], freq: [0.2, 0.5] },
      },
      {
        id: 'embers',
        frames: ['dot'],
        tints: [0xff7a2e, 0xffa640, 0xffd27a],
        blend: 'add',
        density: 45,
        size: [3, 6],
        alpha: [0.55, 0.95],
        fall: [-70, -30],
        drift: 80,
        sway: { amp: [8, 20], freq: [0.3, 0.7] },
        flicker: [1.5, 3.5],
      },
    ],
  },
  sandstorm: {
    id: 'sandstorm',
    group: 'nature',
    strong: { density: 2.4, speed: 1.35, alpha: 1.35 },
    wind: { direction: 0, strength: 0.9 },
    minWind: 0.35,
    veil: { color: 0xc49a56, alpha: [0.08, 0.3], breathe: { period: 5, depth: 0.25 } },
    mists: [
      { color: 0xd2a863, alpha: [0.06, 0.3], scale: 2.6, speed: 420, angle: 0 },
      { color: 0xc49a56, alpha: [0.04, 0.2], scale: 5, speed: 260, angle: -8 },
    ],
    emitters: [
      {
        id: 'grains',
        frames: ['streak'],
        tints: [0xd6b478, 0xe0c28a],
        blend: 'normal',
        density: 420,
        size: [1, 1.6],
        length: [6, 16],
        alpha: [0.4, 0.65],
        fall: [-20, 20],
        drift: 1100,
        depth: [0.5, 1],
      },
    ],
  },
  alert: {
    id: 'alert',
    group: 'scifi',
    strong: { density: 1, speed: 1, alpha: 1.25 },
    wind: null,
    emitters: [],
    vignette: { color: 0xd20f0f, alpha: [0.35, 0.8], pulse: { period: 2.2, depth: 0.45 } },
  },
  static: {
    id: 'static',
    group: 'scifi',
    strong: { density: 1, speed: 1, alpha: 1.5 },
    wind: null,
    emitters: [],
    static: { noise: [0.04, 0.26], scanlines: [0.02, 0.14], bands: [0.03, 0.14] },
  },
};

/** Effets dans l'ordre du choix du MJ. */
export const WEATHER_EFFECT_LIST: readonly WeatherEffect[] = WEATHER_TYPES.map(
  (t) => WEATHER_EFFECTS[t],
);

/** Intensité proposée quand le MJ passe de « Aucune » à un effet : le milieu du curseur. */
export const DEFAULT_INTENSITY = 1;
