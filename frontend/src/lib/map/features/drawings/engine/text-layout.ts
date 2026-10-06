/**
 * Mise en page des textes posés sur la carte (couche `notes`) : taille de la boîte, ligne de
 * base, police réelle. Le moteur en a besoin **sans Pixi** (toucher, contour, poignées), et le
 * rendu doit tomber exactement au même endroit : les deux mesurent avec le même canevas 2D
 * (`measureText`), comme `CanvasTextMetrics` de Pixi. Hors navigateur (tests), une estimation.
 *
 * Convention (celle de l'ancienne carte) : `pos` est le début de la ligne de base de la première
 * ligne, en pixels du monde ; `fontSize` est en pixels du monde.
 */
import { noteFontValue } from './palette';

/** Interligne, en multiple de la taille. */
export const LINE_HEIGHT = 1.25;

/** Taille de référence des mesures (les largeurs sont proportionnelles à la taille). */
const REFERENCE = 100;
/** Chaîne de mesure de l'œil de la police (celle de Pixi). */
const METRICS_STRING = '|ÉqÅM';
const MAX_CACHE = 2_000;

export interface NoteLayout {
  /** Lignes (retours à la ligne `\n`, et `<br>` de l'ancienne carte). */
  lines: string[];
  /** Largeur de la plus longue ligne. */
  width: number;
  height: number;
  /** Du haut de la boîte à la ligne de base de la première ligne. */
  baseline: number;
  lineHeight: number;
}

export const noteLines = (text: string) => text.replace(/<br\s*\/?>/gi, '\n').split('\n');

// ─── Police réelle ───────────────────────────────────────────────────────────

const resolvedFonts = new Map<string, string>();

/**
 * Pile de polices utilisable par un canevas : les variables du thème (`var(--font-sans)`,
 * posées par `next/font`) sont remplacées par leur valeur.
 */
export function resolveFontFamily(stored: string | null | undefined): string {
  const value = noteFontValue(stored);
  const cached = resolvedFonts.get(value);
  if (cached) return cached;
  let out = value;
  if (value.includes('var(')) {
    const style =
      typeof document !== 'undefined' && typeof getComputedStyle === 'function'
        ? getComputedStyle(document.documentElement)
        : null;
    out = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      const v = style?.getPropertyValue(name).trim();
      return v || 'sans-serif';
    });
    // Sans document (tests), on ne garde pas une valeur par défaut en cache
    if (!style) return out;
  }
  resolvedFonts.set(value, out);
  return out;
}

// ─── Mesures ─────────────────────────────────────────────────────────────────

let context: CanvasRenderingContext2D | null | undefined;

function measuringContext(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  try {
    context =
      typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  } catch {
    context = null;
  }
  return context;
}

const fontMetrics = new Map<string, { ascent: number; descent: number }>();
const widths = new Map<string, number>();

/** Hauteur au-dessus et au-dessous de la ligne de base, pour une taille de 1. */
function metricsOf(family: string): { ascent: number; descent: number } {
  const cached = fontMetrics.get(family);
  if (cached) return cached;
  const ctx = measuringContext();
  if (!ctx) return { ascent: 0.8, descent: 0.22 };
  ctx.font = `${REFERENCE}px ${family}`;
  const m = ctx.measureText(METRICS_STRING);
  const out = {
    ascent: (m.actualBoundingBoxAscent || REFERENCE * 0.8) / REFERENCE,
    descent: (m.actualBoundingBoxDescent || REFERENCE * 0.22) / REFERENCE,
  };
  fontMetrics.set(family, out);
  return out;
}

/** Largeur d'une ligne pour une taille de 1. */
function lineWidth(family: string, line: string): number {
  if (!line) return 0;
  const key = `${family}\u0000${line}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  const ctx = measuringContext();
  let w: number;
  if (ctx) {
    ctx.font = `${REFERENCE}px ${family}`;
    w = ctx.measureText(line).width / REFERENCE;
  } else {
    w = line.length * 0.55;
  }
  if (widths.size >= MAX_CACHE) widths.delete(widths.keys().next().value!);
  widths.set(key, w);
  return w;
}

/** Une police de plus a fini de charger : les mesures en cache ne valent plus. */
export function clearTextMetrics() {
  fontMetrics.clear();
  widths.clear();
  resolvedFonts.clear();
}

// ─── Chargement des polices ──────────────────────────────────────────────────

/**
 * Un canevas ne télécharge pas une police déclarée en CSS : il dessine avec celle de secours.
 * Chaque police utilisée est donc chargée (`document.fonts.load`) ; à son arrivée, les mesures
 * sont oubliées, la génération avance et les textes se refont (`onFontsLoaded`).
 */
let generation = 0;
const loading = new Set<string>();
const fontListeners = new Set<() => void>();

/** Génération des polices : change à chaque police arrivée (textes à redessiner). */
export const fontGeneration = () => generation;

/** Prévenu quand une police utilisée par un texte vient d'arriver. Renvoie le désabonnement. */
export function onFontsLoaded(listener: () => void): () => void {
  fontListeners.add(listener);
  return () => void fontListeners.delete(listener);
}

/** Les polices ont changé ailleurs (typographie du système) : tout se remesure. */
export function fontsChanged() {
  generation += 1;
  clearTextMetrics();
  for (const l of fontListeners) l();
}

/** Charge la police d'une pile (sa première famille) si elle ne l'est pas encore. */
export function ensureFontLoaded(family: string) {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts || loading.has(family)) return;
  const probe = `32px ${family}`;
  try {
    if (fonts.check(probe)) return;
  } catch {
    return;
  }
  loading.add(family);
  fonts.load(probe).then(
    (faces) => {
      loading.delete(family);
      if (faces.length) fontsChanged();
    },
    () => loading.delete(family),
  );
}

/** Mise en page d'un texte (mêmes règles que `Text` de Pixi avec `lineHeight`). */
export function layoutNote(text: string, fontSize: number, fontFamily: string | null): NoteLayout {
  const family = resolveFontFamily(fontFamily);
  ensureFontLoaded(family);
  const lines = noteLines(text);
  const { ascent, descent } = metricsOf(family);
  const a = ascent * fontSize;
  const glyph = (ascent + descent) * fontSize;
  const lineHeight = LINE_HEIGHT * fontSize;
  const shift = Math.max(0, (lineHeight - glyph) / 2);
  let width = 0;
  for (const line of lines) width = Math.max(width, lineWidth(family, line) * fontSize);
  return {
    lines,
    width,
    height: Math.max(lineHeight, glyph) + (lines.length - 1) * lineHeight,
    baseline: a + shift,
    lineHeight,
  };
}
