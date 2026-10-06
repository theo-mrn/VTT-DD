/**
 * Mesures de la carte (docs/carte.md § 10, Mesures) : unités, cases, formes. Données pures,
 * sans Pixi ni DOM, testées à blanc.
 *
 * - Distance **euclidienne** entre deux points du monde, divisée par la case de la scène
 *   (`pixelsPerUnit`), arrondie à la demi-unité, écrite avec `unitName` (« 4,5 m »). Aucune
 *   règle de jeu : le nombre de cases à parcourir, avec une grille de jeu, suit un réglage de
 *   comptage choisi par chacun (`GridCounting`).
 * - Formes (`MapMeasurement.shape`) : règle (`line`), cône, cercle, carré (`cube`). Une mesure va
 *   de `start` (origine ou centre) à `end` (le pointeur) ; ses options gardent les noms de
 *   l'ancienne app (`coneAngle`, `coneMode`, `coneWidth`, `fixedLength`, `coneShape`).
 */
import type { MapMeasurement, MapMeasurementShape } from '@vtt/contracts';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapDto } from '@/lib/map/store/map-store';

/** Couche du magasin des gabarits épinglés. */
export const MEASUREMENTS = 'measurements';
/** Sorte d'entité d'un gabarit épinglé. */
export const MEASUREMENT_KIND = 'measurement';
/** Outil « Mesurer » (Z). */
export const MEASURE_TOOL_ID = 'measure';

export type MeasureShape = MapMeasurementShape;
export type MeasurementData = MapMeasurement & MapDto;

export const MEASURE_SHAPES: readonly { value: MeasureShape; label: string; key: string }[] = [
  { value: 'line', label: 'Règle', key: '1' },
  { value: 'cone', label: 'Cône', key: '2' },
  { value: 'circle', label: 'Cercle', key: '3' },
  { value: 'cube', label: 'Carré', key: '4' },
];

/** Couleurs proposées (données) ; l'or est celle de l'ancienne app. */
export const MEASURE_COLORS: readonly { value: string; label: string }[] = [
  { value: '#ffd700', label: 'Or' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#10b981', label: 'Vert' },
  { value: '#e7e5e4', label: 'Pierre' },
];
export const DEFAULT_MEASURE_COLOR = MEASURE_COLORS[0]!.value;

// ─── Unités et cases ─────────────────────────────────────────────────────────

/** Arrondi à la demi-unité. */
export const roundHalf = (n: number) => Math.round(n * 2) / 2;

const number = (n: number, digits = 1) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: digits });

/** « 4,5 m » : unités arrondies à la demi-unité. */
export function formatUnits(units: number, unitName: string): string {
  return `${number(roundHalf(units))} ${unitName}`;
}

/** Aire lisible : entière à partir de 10, sinon au dixième. */
export function formatArea(area: number, unitName: string): string {
  return `${number(area, area >= 10 ? 0 : 1)} ${unitName}²`;
}

/**
 * Comptage des cases à parcourir (réglage de chacun, jamais une règle de jeu dans le code) :
 * diagonale comptée pour une case (pas de roi), diagonales alternées (1, 2, 1…), sans
 * diagonale, ou pas de comptage.
 */
export type GridCounting = 'chebyshev' | 'alternating' | 'manhattan' | 'off';

export const GRID_COUNTINGS: readonly { value: GridCounting; label: string; hint: string }[] = [
  { value: 'chebyshev', label: 'Diagonale : 1 case', hint: 'Une diagonale compte une case' },
  {
    value: 'alternating',
    label: 'Diagonales alternées',
    hint: 'Une diagonale sur deux compte double (1, 2, 1…)',
  },
  { value: 'manhattan', label: 'Sans diagonale', hint: 'Seulement en ligne et en colonne' },
  { value: 'off', label: 'Ne pas compter', hint: 'La distance seule' },
];

/** Grille de jeu de la scène (en pixels du monde). */
export interface GridLike {
  size: number;
  offsetX?: number;
  offsetY?: number;
}

/** Cases à parcourir entre la case de `a` et celle de `b` ; null sans comptage. */
export function gridSteps(
  a: Point,
  b: Point,
  grid: GridLike,
  counting: GridCounting,
): number | null {
  if (counting === 'off' || !(grid.size > 0)) return null;
  const ox = grid.offsetX ?? 0;
  const oy = grid.offsetY ?? 0;
  const col = (x: number) => Math.floor((x - ox) / grid.size);
  const row = (y: number) => Math.floor((y - oy) / grid.size);
  const dx = Math.abs(col(b.x) - col(a.x));
  const dy = Math.abs(row(b.y) - row(a.y));
  switch (counting) {
    case 'chebyshev':
      return Math.max(dx, dy);
    case 'manhattan':
      return dx + dy;
    case 'alternating':
      return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
  }
}

const casesLabel = (n: number) => `${n} case${n > 1 ? 's' : ''}`;

/** Ce qu'il faut pour écrire une distance. */
export interface UnitContext {
  pixelsPerUnit: number;
  unitName: string;
  /** Grille de jeu de la scène (null : aucune, pas de cases). */
  grid: GridLike | null;
  counting: GridCounting;
}

/** Distance de `a` à `b` en unités (pixels du monde / case). */
export const unitsBetween = (a: Point, b: Point, pixelsPerUnit: number) =>
  Math.hypot(b.x - a.x, b.y - a.y) / (pixelsPerUnit > 0 ? pixelsPerUnit : 50);

/** « 12 m · 8 cases » (les cases seulement avec une grille de jeu et un comptage). */
export function distanceText(a: Point, b: Point, u: UnitContext): string {
  const text = formatUnits(unitsBetween(a, b, u.pixelsPerUnit), u.unitName);
  const steps = u.grid ? gridSteps(a, b, u.grid, u.counting) : null;
  return steps === null ? text : `${text} · ${casesLabel(steps)}`;
}

// ─── Formes ──────────────────────────────────────────────────────────────────

/** Une mesure : forme, origine, extrémité, options (noms de l'ancienne app). */
export interface MeasureSpec {
  shape: MeasureShape;
  start: Point;
  end: Point;
  options: Readonly<Record<string, unknown>>;
}

export type ConeMode = 'angle' | 'dimensions';

/** Options d'un cône, lues avec les défauts de l'ancienne app. */
export interface ConeOptions {
  /** Angle d'ouverture, degrés (53,13° : largeur = longueur, le « 1:1 »). */
  angle: number;
  mode: ConeMode;
  /** Largeur au bout (unités), mode « Dimensions ». */
  width: number | null;
  /** Longueur fixe (unités), mode « Dimensions » : le pointeur ne donne que la direction. */
  length: number | null;
  /** Bout arrondi (arc) ou plat (triangle). */
  rounded: boolean;
}

export const DEFAULT_CONE_ANGLE = 53.13;
export const CONE_ANGLE_PRESETS: readonly number[] = [45, DEFAULT_CONE_ANGLE, 60, 90];
export const CONE_ANGLE_RANGE = { min: 5, max: 180 } as const;

const positive = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export function coneOptions(options: Readonly<Record<string, unknown>>): ConeOptions {
  const angle = positive(options.coneAngle) ?? DEFAULT_CONE_ANGLE;
  return {
    angle: Math.min(CONE_ANGLE_RANGE.max, Math.max(CONE_ANGLE_RANGE.min, angle)),
    mode: options.coneMode === 'dimensions' ? 'dimensions' : 'angle',
    width: positive(options.coneWidth),
    length: positive(options.fixedLength),
    rounded: options.coneShape !== 'flat',
  };
}

/** Options enregistrées d'un cône (noms de l'ancienne app). */
export function coneRecord(c: ConeOptions): Record<string, unknown> {
  return {
    coneAngle: c.angle,
    coneMode: c.mode,
    coneShape: c.rounded ? 'rounded' : 'flat',
    ...(c.width ? { coneWidth: c.width } : {}),
    ...(c.length ? { fixedLength: c.length } : {}),
  };
}

/** Options d'un gabarit avec ces réglages de cône (une largeur ou une longueur vidée part). */
export function withCone(
  options: Readonly<Record<string, unknown>>,
  c: ConeOptions,
): Record<string, unknown> {
  const { coneWidth: _w, fixedLength: _l, ...rest } = options;
  return { ...rest, ...coneRecord(c) };
}

/** Longueur (pixels du monde) et direction (radians) de l'origine vers l'extrémité. */
export function reach(spec: Pick<MeasureSpec, 'start' | 'end'>): { length: number; angle: number } {
  const dx = spec.end.x - spec.start.x;
  const dy = spec.end.y - spec.start.y;
  return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

/**
 * Demi-angle d'un cône (radians). En « Dimensions » (ou donnée ancienne sans mode) avec une
 * largeur : `atan((largeur / 2) / longueur)` ; sinon l'angle choisi. Un cône plat reste
 * sous 80° de demi-angle (triangle fini).
 */
export function coneHalfAngle(spec: MeasureSpec, pixelsPerUnit: number): number {
  const c = coneOptions(spec.options);
  const lengthUnits = reach(spec).length / (pixelsPerUnit > 0 ? pixelsPerUnit : 50);
  const byWidth = c.width && (c.mode === 'dimensions' || spec.options.coneMode === undefined);
  let half =
    byWidth && lengthUnits > 0 ? Math.atan(c.width! / 2 / lengthUnits) : (c.angle * Math.PI) / 360;
  if (!c.rounded) half = Math.min(half, (80 * Math.PI) / 180);
  return half;
}

/** Longueur d'un cône à « longueur fixe » : l'extrémité est ramenée sur la direction. */
export function constrainConeEnd(
  start: Point,
  end: Point,
  options: Readonly<Record<string, unknown>>,
  pixelsPerUnit: number,
): Point {
  const c = coneOptions(options);
  if (c.mode !== 'dimensions' || !c.length) return end;
  const { angle, length } = reach({ start, end });
  if (!length) return end;
  const r = c.length * pixelsPerUnit;
  return { x: start.x + Math.cos(angle) * r, y: start.y + Math.sin(angle) * r };
}

/** Extrémité alignée par pas d'angle (⇧ : 15°), à la même distance. */
export function snapAngle(start: Point, end: Point, stepDeg = 15): Point {
  const { angle, length } = reach({ start, end });
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(angle / step) * step;
  return { x: start.x + Math.cos(a) * length, y: start.y + Math.sin(a) * length };
}

/** Point du repère de la mesure (x le long de la direction, y à sa gauche) → monde. */
const toWorld = (o: Point, cos: number, sin: number, x: number, y: number): Point => ({
  x: o.x + x * cos - y * sin,
  y: o.y + x * sin + y * cos,
});

/** Nombre de côtés d'un cercle ou d'un arc approché. */
const ARC_STEPS = 48;

/**
 * Contour de la forme (pixels du monde), fermé sauf pour la règle : cercle et arc approchés
 * (48 pas pour un tour). Sert au toucher, aux bornes et à « dans la zone ».
 */
export function outline(spec: MeasureSpec, pixelsPerUnit: number): Point[] {
  const { start: o } = spec;
  const { length: r, angle } = reach(spec);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  switch (spec.shape) {
    case 'line':
      return [o, spec.end];
    case 'circle':
      return Array.from({ length: ARC_STEPS }, (_, i) => {
        const a = (i / ARC_STEPS) * Math.PI * 2;
        return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
      });
    case 'cube':
      return [
        toWorld(o, cos, sin, r, -r),
        toWorld(o, cos, sin, r, r),
        toWorld(o, cos, sin, -r, r),
        toWorld(o, cos, sin, -r, -r),
      ];
    case 'cone': {
      const half = coneHalfAngle(spec, pixelsPerUnit);
      if (!coneOptions(spec.options).rounded) {
        const w = r * Math.tan(half);
        return [o, toWorld(o, cos, sin, r, -w), toWorld(o, cos, sin, r, w)];
      }
      const steps = Math.max(2, Math.ceil(((2 * half) / (Math.PI * 2)) * ARC_STEPS));
      const pts: Point[] = [o];
      for (let i = 0; i <= steps; i++) {
        const a = -half + (2 * half * i) / steps;
        pts.push(toWorld(o, cos, sin, r * Math.cos(a), r * Math.sin(a)));
      }
      return pts;
    }
  }
}

/** Distance d'un point à un segment. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Le point touche le contour (ou le trait de la règle), ou l'origine, à `tolerance` près. */
export function touchesOutline(
  spec: MeasureSpec,
  p: Point,
  tolerance: number,
  pixelsPerUnit: number,
): boolean {
  if (Math.hypot(p.x - spec.start.x, p.y - spec.start.y) <= tolerance * 1.5) return true;
  if (spec.shape === 'circle') {
    const r = reach(spec).length;
    return Math.abs(Math.hypot(p.x - spec.start.x, p.y - spec.start.y) - r) <= tolerance;
  }
  const pts = outline(spec, pixelsPerUnit);
  const closed = spec.shape !== 'line';
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++)
    if (distanceToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!) <= tolerance) return true;
  return false;
}

/** Le point est dans la zone (cercle, carré, cône) ; jamais pour une règle. */
export function zoneContains(spec: MeasureSpec, p: Point, pixelsPerUnit: number): boolean {
  const { length: r, angle } = reach(spec);
  if (!(r > 0)) return false;
  const dx = p.x - spec.start.x;
  const dy = p.y - spec.start.y;
  // Repère de la mesure : x le long de la direction, y en travers
  const x = dx * Math.cos(angle) + dy * Math.sin(angle);
  const y = -dx * Math.sin(angle) + dy * Math.cos(angle);
  switch (spec.shape) {
    case 'line':
      return false;
    case 'circle':
      return Math.hypot(dx, dy) <= r;
    case 'cube':
      return Math.abs(x) <= r && Math.abs(y) <= r;
    case 'cone': {
      const half = coneHalfAngle(spec, pixelsPerUnit);
      if (coneOptions(spec.options).rounded)
        return Math.hypot(dx, dy) <= r && Math.abs(Math.atan2(y, x)) <= half + 1e-9;
      return x >= 0 && x <= r && Math.abs(y) <= x * Math.tan(half) + 1e-9;
    }
  }
}

/** Boîte englobante du contour (pixels du monde). */
export function outlineBounds(spec: MeasureSpec, pixelsPerUnit: number) {
  const pts = outline(spec, pixelsPerUnit);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Étiquette d'une mesure : « 12 m · 8 cases » (règle), « Rayon 4 m · 50 m² », « Côté 6 m ·
 * 36 m² », « 9 m · 53° » (cône ; « 9 × 6 m » en dimensions).
 */
export function measureLabel(spec: MeasureSpec, u: UnitContext): string {
  const ppu = u.pixelsPerUnit > 0 ? u.pixelsPerUnit : 50;
  const units = reach(spec).length / ppu;
  const unit = u.unitName;
  switch (spec.shape) {
    case 'line':
      return distanceText(spec.start, spec.end, u);
    case 'circle':
      return `Rayon ${formatUnits(units, unit)} · ${formatArea(Math.PI * units * units, unit)}`;
    case 'cube': {
      const side = 2 * units;
      return `Côté ${formatUnits(side, unit)} · ${formatArea(side * side, unit)}`;
    }
    case 'cone': {
      const c = coneOptions(spec.options);
      if (c.mode === 'dimensions' && c.width)
        return `${number(roundHalf(units))} × ${number(roundHalf(c.width))} ${unit}`;
      const degrees = (coneHalfAngle(spec, ppu) * 360) / Math.PI;
      return `${formatUnits(units, unit)} · ${Math.round(degrees)}°`;
    }
  }
}

/** Mesure d'un gabarit enregistré. */
export const specOf = (m: Pick<MapMeasurement, 'shape' | 'start' | 'end' | 'options'>) =>
  ({
    shape: m.shape,
    start: m.start,
    end: m.end,
    options: m.options ?? {},
  }) satisfies MeasureSpec;

/** Mesure déplacée et tournée : même longueur, nouvelle origine et direction (degrés). */
export function placedSpec(spec: MeasureSpec, origin: Point, rotationDeg: number): MeasureSpec {
  const { length } = reach(spec);
  const a = (rotationDeg * Math.PI) / 180;
  return {
    ...spec,
    start: origin,
    end: { x: origin.x + Math.cos(a) * length, y: origin.y + Math.sin(a) * length },
  };
}
