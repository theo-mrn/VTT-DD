/**
 * Palette et préréglages des dessins et des textes (docs/carte.md § 10, Dessins et textes).
 * Les couleurs de dessin sont des **données** : elles vivent ici, jamais dans les composants
 * React, et partent telles quelles au serveur (`color`, `fill`, chaînes CSS).
 *
 * Opacité : portée par la couleur elle-même (`#rrggbbaa`), pour qu'elle voyage avec le tracé,
 * dans la base comme dans le direct (`map.live.stroke.color`), sans champ de plus au contrat.
 */
import { translate } from '@/i18n/runtime';
import type { Messages } from '@/i18n/types';

export interface PaletteColor {
  id: string;
  /** Nom lu par les lecteurs d'écran et affiché en info-bulle (traduit à chaque lecture). */
  readonly label: string;
  /** `#rrggbb`. */
  value: string;
}

/**
 * Libellé traduit à la lecture : les listes ci-dessous sont des constantes de module, leur nom
 * suit la langue active sans être figé au chargement (docs/i18n.md § 8).
 */
const labelled = <T extends object>(item: T, key: () => string): T & { readonly label: string } =>
  Object.defineProperty(item, 'label', { get: key, enumerable: true }) as T & {
    readonly label: string;
  };

/** Couleurs proposées : contrastées sur une carte sombre comme sur une carte claire. */
export const DRAWING_COLORS: readonly PaletteColor[] = (
  [
    ['ivory', '#f5f1e8'],
    ['charcoal', '#1f1d24'],
    ['crimson', '#e5484d'],
    ['amber', '#f5a524'],
    ['gold', '#d4b16a'],
    ['lime', '#99d52a'],
    ['emerald', '#30a46c'],
    ['teal', '#12a594'],
    ['azure', '#3e9bf5'],
    ['indigo', '#5b5bd6'],
    ['violet', '#8e4ec6'],
    ['rose', '#e93d82'],
  ] as const
).map(([id, value]) => labelled({ id, value }, () => translate(`map.drawings.colors.${id}`)));

export const DEFAULT_DRAWING_COLOR = '#e5484d';
export const DEFAULT_NOTE_COLOR = '#f5f1e8';

/** Épaisseur du trait, en pixels du monde. */
export const WIDTH_RANGE = { min: 1, max: 80, step: 1 } as const;
export const WIDTH_PRESETS: readonly { readonly label: string; value: number }[] = (
  [
    ['thin', 3],
    ['medium', 6],
    ['thick', 12],
    ['veryThick', 24],
  ] as const
).map(([id, value]) => labelled({ value }, () => translate(`map.drawings.widths.${id}`)));
export const DEFAULT_WIDTH = 6;

/** Opacité du trait et du remplissage. */
export const OPACITY_RANGE = { min: 0.1, max: 1, step: 0.05 } as const;
export const DEFAULT_OPACITY = 1;
/** Opacité du remplissage, relative à celle du trait. */
export const FILL_ALPHA = 0.35;

/** Taille des textes, en pixels du monde. */
export const FONT_SIZE_RANGE = { min: 8, max: 240, step: 1 } as const;
export const FONT_SIZE_PRESETS: readonly { readonly label: string; value: number }[] = (
  [
    ['small', 20],
    ['medium', 32],
    ['large', 56],
    ['title', 96],
  ] as const
).map(([id, value]) => labelled({ value }, () => translate(`map.drawings.fontSizes.${id}`)));
export const DEFAULT_FONT_SIZE = 32;

export interface NoteFont {
  id: string;
  readonly label: string;
  /** Valeur enregistrée (`fontFamily`) : une pile CSS, variables du thème permises. */
  value: string;
  /** Groupe du sélecteur. */
  group: NoteFontGroup;
}

/** Groupes du sélecteur ; nom affiché : `map.drawings.fontGroups.<groupe>`. */
export const NOTE_FONT_GROUPS = [
  'readable',
  'fantasy',
  'handwritten',
  'posters',
  'scifi',
  'typewriter',
  'horror',
] as const;
export type NoteFontGroup = (typeof NOTE_FONT_GROUPS)[number] | 'system';

export const noteFontGroupLabel = (group: NoteFontGroup) =>
  translate(`map.drawings.fontGroups.${group}`);

type FontName = keyof Messages['map']['drawings']['fonts'];

/** Une police servie par `next/font` ; son nom vient du catalogue (`map.drawings.fonts.<name>`). */
const font = (id: string, name: FontName, group: NoteFontGroup, fallback: string): NoteFont =>
  named({ id, group, value: `var(--font-map-${id}), ${fallback}` }, name);

const named = (f: Omit<NoteFont, 'label'>, name: FontName): NoteFont =>
  labelled(f, () => translate(`map.drawings.fonts.${name}`));

/**
 * Polices des textes posés sur la carte. Les quatre premières gardent leurs valeurs d'origine
 * (textes déjà posés) ; les autres sont servies par `next/font` (`app/map-fonts.ts`), sans
 * téléchargement tant qu'elles ne servent pas.
 */
export const NOTE_FONTS: readonly NoteFont[] = [
  named({ id: 'sans', value: 'var(--font-sans)', group: 'readable' }, 'readable'),
  named({ id: 'display', value: 'var(--font-display)', group: 'fantasy' }, 'title'),
  named(
    {
      id: 'hand',
      value: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive', // i18n-ignore
      group: 'handwritten',
    },
    'handwritten',
  ),
  named({ id: 'mono', value: 'var(--font-mono)', group: 'typewriter' }, 'mono'),
  font('lora', 'book', 'readable', 'serif'),
  font('im-fell', 'grimoire', 'fantasy', 'serif'),
  font('medieval-sharp', 'medieval', 'fantasy', 'serif'),
  font('uncial', 'uncial', 'fantasy', 'serif'),
  font('almendra', 'almendra', 'fantasy', 'serif'),
  font('cinzel-decorative', 'illumination', 'fantasy', 'serif'),
  font('unifraktur', 'gothic', 'fantasy', 'serif'),
  font('pirata', 'pirate', 'fantasy', 'serif'),
  font('caveat', 'notebook', 'handwritten', 'cursive'),
  font('kalam', 'quill', 'handwritten', 'cursive'),
  font('dancing', 'calligraphy', 'handwritten', 'cursive'),
  font('indie-flower', 'scribble', 'handwritten', 'cursive'),
  font('shadows', 'chalk', 'handwritten', 'cursive'),
  font('bebas', 'poster', 'posters', 'sans-serif'),
  named(
    { id: 'aclonica', value: 'var(--font-aclonica), sans-serif', group: 'posters' },
    'roundTitle',
  ),
  font('orbitron', 'orbitron', 'scifi', 'sans-serif'),
  font('audiowide', 'neon', 'scifi', 'sans-serif'),
  font('share-tech', 'terminal', 'scifi', 'monospace'),
  font('special-elite', 'typewriter', 'typewriter', 'monospace'),
  font('creepster', 'dread', 'horror', 'cursive'),
  font('nosifer', 'bloody', 'horror', 'cursive'),
];

/** Police d'un système (fichier déclaré par sa présentation, chargé à la table). */
export function systemNoteFont(famille: string): NoteFont {
  const safe = famille.replace(/["\\]/g, '');
  return {
    id: `system:${safe}`,
    label: safe,
    group: 'system',
    value: `"${safe}", var(--font-sans)`,
  };
}

export const DEFAULT_FONT = NOTE_FONTS[0]!.value;

/** Polices de l’ancienne carte (var(--font-body)…), lues avec leur équivalent d’aujourd’hui. */
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

/** Police du préréglage correspondant (catalogue, puis polices du système), s'il y en a un. */
export const noteFontOf = (stored: string | null | undefined, extra: readonly NoteFont[] = []) => {
  const value = noteFontValue(stored);
  return NOTE_FONTS.find((f) => f.value === value) ?? extra.find((f) => f.value === value) ?? null;
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
    const alpha = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { hex: `#${h.slice(0, 6)}`, alpha: Math.round(alpha * 100) / 100 };
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const to2 = (n: string) =>
      Math.round(Math.min(255, Math.max(0, Number(n))))
        .toString(16)
        .padStart(2, '0');
    const a = alphaOf(m[4]);
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

/** Opacité CSS : absente (1), en pourcentage, ou en fraction. */
function alphaOf(v: string | undefined): number {
  if (v === undefined) return 1;
  return v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v);
}
