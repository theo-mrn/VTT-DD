/**
 * Réglages des outils Dessin (P) et Texte (T) : forme, couleur, épaisseur, opacité,
 * remplissage, destination (annotation ou calque), taille et police des textes.
 *
 * Un magasin zustand vanilla, hors de React : l'outil le lit à chaque geste, la barre
 * contextuelle s'y abonne. Mémorisé dans le navigateur (confort de chacun) : `localStorage`
 * peut manquer ou refuser (navigation privée, stockage plein), tout passe par try/catch et les
 * valeurs relues sont vérifiées une à une.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  DEFAULT_DRAWING_COLOR,
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  DEFAULT_NOTE_COLOR,
  DEFAULT_OPACITY,
  DEFAULT_WIDTH,
  FONT_SIZE_RANGE,
  OPACITY_RANGE,
  parseColor,
  WIDTH_RANGE,
} from './palette';

/** Forme de l'outil Dessin. */
export const DRAW_SHAPES = ['pen', 'line', 'rectangle', 'circle', 'eraser'] as const;
export type DrawShape = (typeof DRAW_SHAPES)[number];

/**
 * Où va ce qu'on pose : `annotation` (hors calque, au-dessus de l'ombre, toujours visible) ou
 * `layer` (dans un calque du MJ, sous l'ombre, comme le reste de la carte).
 */
export type DrawTarget = 'annotation' | 'layer';

export interface DrawSettings {
  shape: DrawShape;
  /** `#rrggbb` (l'opacité est à part). */
  color: string;
  /** 0,1 à 1. */
  opacity: number;
  /** Pixels du monde. */
  width: number;
  /** Rectangle et ellipse remplis. */
  fill: boolean;
  target: DrawTarget;
  text: {
    color: string;
    fontSize: number;
    fontFamily: string;
  };
}

export const DEFAULT_SETTINGS: DrawSettings = {
  shape: 'pen',
  color: DEFAULT_DRAWING_COLOR,
  opacity: DEFAULT_OPACITY,
  width: DEFAULT_WIDTH,
  fill: false,
  target: 'annotation',
  text: { color: DEFAULT_NOTE_COLOR, fontSize: DEFAULT_FONT_SIZE, fontFamily: DEFAULT_FONT },
};

export const SETTINGS_KEY = 'vtt:carte:dessin:v1';

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

const hexOr = (value: unknown, fallback: string) =>
  typeof value === 'string' ? (parseColor(value)?.hex ?? fallback) : fallback;

/** Réglages relus, chaque valeur vérifiée (une valeur abîmée reprend sa valeur par défaut). */
export function sanitizeSettings(raw: unknown): DrawSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = (r.text && typeof r.text === 'object' ? r.text : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    shape: DRAW_SHAPES.includes(r.shape as DrawShape) ? (r.shape as DrawShape) : d.shape,
    color: hexOr(r.color, d.color),
    opacity: clamp(r.opacity, OPACITY_RANGE.min, OPACITY_RANGE.max, d.opacity),
    width: clamp(r.width, WIDTH_RANGE.min, WIDTH_RANGE.max, d.width),
    fill: typeof r.fill === 'boolean' ? r.fill : d.fill,
    target: r.target === 'layer' || r.target === 'annotation' ? r.target : d.target,
    text: {
      color: hexOr(t.color, d.text.color),
      fontSize: clamp(t.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, d.text.fontSize),
      fontFamily:
        typeof t.fontFamily === 'string' && t.fontFamily.trim() && t.fontFamily.length <= 100
          ? t.fontFamily
          : d.text.fontFamily,
    },
  };
}

function browserStorage(): SettingsStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export type DrawSettingsStore = StoreApi<DrawSettings> & {
  /** Modifie une partie des réglages (mémorisés). */
  patch(
    patch: Partial<Omit<DrawSettings, 'text'>> & { text?: Partial<DrawSettings['text']> },
  ): void;
};

/** Magasin des réglages, relu du stockage (défaut : `localStorage`, s'il répond). */
export function createDrawSettings(
  storage: SettingsStorage | null = browserStorage(),
): DrawSettingsStore {
  let initial = DEFAULT_SETTINGS;
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) initial = sanitizeSettings(JSON.parse(raw));
  } catch {
    // Stockage indisponible ou valeur illisible : réglages par défaut
  }
  const store = createStore<DrawSettings>()(() => initial) as DrawSettingsStore;
  store.patch = (patch) => {
    const cur = store.getState();
    const next = sanitizeSettings({ ...cur, ...patch, text: { ...cur.text, ...patch.text } });
    store.setState(next, true);
    try {
      storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Stockage plein ou refusé : les réglages valent pour cette session
    }
  };
  return store;
}
