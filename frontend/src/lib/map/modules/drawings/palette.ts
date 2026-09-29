/**
 * Palette et préréglages des dessins et des textes (docs/carte.md § 10, Dessins et textes).
 * Les couleurs de dessin sont des **données** : elles vivent ici, jamais dans les composants
 * React, et partent telles quelles au serveur (`color`, `fill`, chaînes CSS).
 *
 * Opacité : portée par la couleur elle-même (`#rrggbbaa`), pour qu'elle voyage avec le tracé,
 * dans la base comme dans le direct (`map.live.stroke.color`), sans champ de plus au contrat.
 */

export interface PaletteColor {
  id: string;
  /** Nom lu par les lecteurs d'écran et affiché en info-bulle. */
  label: string;
  /** `#rrggbb`. */
  value: string;
}

/** Couleurs proposées : contrastées sur une carte sombre comme sur une carte claire. */
export const DRAWING_COLORS: readonly PaletteColor[] = [
  { id: 'ivory', label: 'Ivoire', value: '#f5f1e8' },
  { id: 'charcoal', label: 'Charbon', value: '#1f1d24' },
  { id: 'crimson', label: 'Carmin', value: '#e5484d' },
  { id: 'amber', label: 'Ambre', value: '#f5a524' },
  { id: 'gold', label: 'Or', value: '#d4b16a' },
  { id: 'lime', label: 'Tilleul', value: '#99d52a' },
  { id: 'emerald', label: 'Émeraude', value: '#30a46c' },
  { id: 'teal', label: 'Sarcelle', value: '#12a594' },
  { id: 'azure', label: 'Azur', value: '#3e9bf5' },
  { id: 'indigo', label: 'Indigo', value: '#5b5bd6' },
  { id: 'violet', label: 'Violet', value: '#8e4ec6' },
  { id: 'rose', label: 'Rose', value: '#e93d82' },
];

export const DEFAULT_DRAWING_COLOR = '#e5484d';
export const DEFAULT_NOTE_COLOR = '#f5f1e8';

/** Épaisseur du trait, en pixels du monde. */
export const WIDTH_RANGE = { min: 1, max: 80, step: 1 } as const;
export const WIDTH_PRESETS: readonly { label: string; value: number }[] = [
  { label: 'Fin', value: 3 },
  { label: 'Moyen', value: 6 },
  { label: 'Épais', value: 12 },
  { label: 'Très épais', value: 24 },
];
export const DEFAULT_WIDTH = 6;

/** Opacité du trait et du remplissage. */
export const OPACITY_RANGE = { min: 0.1, max: 1, step: 0.05 } as const;
export const DEFAULT_OPACITY = 1;
/** Opacité du remplissage, relative à celle du trait. */
export const FILL_ALPHA = 0.35;

/** Taille des textes, en pixels du monde. */
export const FONT_SIZE_RANGE = { min: 8, max: 240, step: 1 } as const;
export const FONT_SIZE_PRESETS: readonly { label: string; value: number }[] = [
  { label: 'Petit', value: 20 },
  { label: 'Moyen', value: 32 },
  { label: 'Grand', value: 56 },
  { label: 'Titre', value: 96 },
];
export const DEFAULT_FONT_SIZE = 32;

export interface NoteFont {
  id: string;
  label: string;
  /** Valeur enregistrée (`fontFamily`) : une pile CSS, variables du thème permises. */
  value: string;
}

/** Polices lisibles des textes posés sur la carte. */
export const NOTE_FONTS: readonly NoteFont[] = [
  { id: 'sans', label: 'Lisible', value: 'var(--font-sans)' },
  { id: 'display', label: 'Titre', value: 'var(--font-display)' },
  {
    id: 'hand',
    label: 'Manuscrit',
    value: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
  },
  { id: 'mono', label: 'Machine', value: 'var(--font-mono)' },
];
export const DEFAULT_FONT = NOTE_FONTS[0]!.value;

/** Polices de l'ancienne carte (`var(--font-body)`…), lues avec leur équivalent d'aujourd'hui. */
const LEGACY_FONTS: Readonly<Record<string, string>> = {
  'var(--font-body)': 'var(--font-sans)',
  'var(--font-modern)': 'var(--font-sans)',
  'var(--font-title)': 'var(--font-display)',
  'var(--font-medieval)': 'var(--font-display)',
  'var(--font-hand)': NOTE_FONTS[2]!.value,
};

/** Police à utiliser pour une valeur enregistrée (nulle : la police lisible). */
export function noteFontValue(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_FONT;
  return LEGACY_FONTS[stored] ?? stored;
}

/** Police du préréglage correspondant, s'il y en a un. */
export const noteFontOf = (stored: string | null | undefined) => {
  const value = noteFontValue(stored);
  return NOTE_FONTS.find((f) => f.value === value) ?? null;
};

// ─── Couleurs (chaînes CSS) ──────────────────────────────────────────────────

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Quelques noms de l'ancienne carte (`yellow` par défaut pour les textes). */
const NAMED: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
};

export interface ParsedColor {
  /** `#rrggbb`. */
  hex: string;
  /** 0 à 1. */
  alpha: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Lit une couleur enregistrée : `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`, ou
 * un nom simple. Null si elle n'est pas lisible ici (le rendu Pixi, lui, lit tout le CSS).
 */
export function parseColor(value: string | null | undefined): ParsedColor | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const named = NAMED[v];
  if (named) return { hex: named, alpha: 1 };
  if (HEX.test(v)) {
    let h = v.slice(1);
    if (h.length <= 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { hex: `#${h.slice(0, 6)}`, alpha: Math.round(alpha * 100) / 100 };
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const to2 = (n: string) =>
      Math.round(Math.min(255, Math.max(0, Number(n))))
        .toString(16)
        .padStart(2, '0');
    const a =
      m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return { hex: `#${to2(m[1]!)}${to2(m[2]!)}${to2(m[3]!)}`, alpha: clamp01(a) };
  }
  return null;
}

/** Couleur enregistrée : `#rrggbb` si opaque, sinon `#rrggbbaa`. */
export function withAlpha(hex: string, alpha: number): string {
  const base = parseColor(hex)?.hex ?? DEFAULT_DRAWING_COLOR;
  const a = clamp01(alpha);
  if (a >= 0.995) return base;
  return `${base}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** Remplissage d'une forme : la couleur du trait, plus transparente. */
export const fillFor = (color: string) => {
  const c = parseColor(color);
  return withAlpha(c?.hex ?? DEFAULT_DRAWING_COLOR, (c?.alpha ?? 1) * FILL_ALPHA);
};
