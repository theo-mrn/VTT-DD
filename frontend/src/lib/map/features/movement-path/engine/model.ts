/**
 * Trajet des déplacements (docs/carte.md § 10, Trajet des déplacements) : cases traversées,
 * distance, déplacement du personnage, audience du direct. Données pures, sans Pixi ni DOM,
 * testées à blanc.
 *
 * - Un trajet est une suite de sommets : le départ du token, ses points de passage, puis sa
 *   position courante.
 * - Avec une grille de jeu, chaque segment va de case en case (pas de roi, ou sans diagonale
 *   avec le comptage « Sans diagonale ») ; la distance est le nombre de cases selon le comptage
 *   des Mesures (une case vaut une unité, § 4), les diagonales alternées comptées sur tout le
 *   trajet. Sans grille, ou sans comptage : la somme des segments en unités.
 */
import { MAP_PATH_MAX_POINTS } from '@vtt/contracts';
import type { LiveAudience } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import {
  roundHalf,
  type GridCounting,
  type GridLike,
  type UnitContext,
} from '@/lib/map/features/measurements/engine/model';

/** Sorte d'entité dont le glisser trace un trajet. */
export const TOKEN_KIND = 'token';
/** Sommets envoyés au plus (départ et points de passage), comme le contrat du direct. */
export const MAX_POINTS = MAP_PATH_MAX_POINTS;
/** Un arrêt aussi long pendant le glisser pose un point de passage. */
export const DWELL_MS = 500;
/** Écart minimal d'un point de passage au sommet précédent, en unités (cases). */
export const MIN_WAYPOINT_UNITS = 0.5;
/** Effacement du trajet après le lâcher. */
export const FADE_MS = 800;

/** Case de la grille de jeu (colonne, ligne). */
export interface Cell {
  col: number;
  row: number;
}

/** Case du trajet et le nombre de cases parcourues pour l'atteindre (0 : le départ). */
export interface PathCell extends Cell {
  cost: number;
}

/** Case qui contient ce point. */
export function cellOf(p: Point, grid: GridLike): Cell {
  return {
    col: Math.floor((p.x - (grid.offsetX ?? 0)) / grid.size),
    row: Math.floor((p.y - (grid.offsetY ?? 0)) / grid.size),
  };
}

/** Centre d'une case, en pixels du monde. */
export function cellCenter(c: Cell, grid: GridLike): Point {
  return {
    x: (grid.offsetX ?? 0) + (c.col + 0.5) * grid.size,
    y: (grid.offsetY ?? 0) + (c.row + 0.5) * grid.size,
  };
}

/**
 * Cases d'un segment de case à case, sans la première, ajoutées à `out` : en pas de roi
 * (`diagonal`, une case voisine à chaque pas, diagonales comprises), sinon par côtés seulement
 * (l'axe le plus en retard avance d'abord).
 */
export function segmentCells(a: Cell, b: Cell, diagonal: boolean, out: Cell[]): void {
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  if (diagonal) {
    const n = Math.max(Math.abs(dc), Math.abs(dr));
    for (let i = 1; i <= n; i++)
      out.push({ col: a.col + Math.round((dc * i) / n), row: a.row + Math.round((dr * i) / n) });
    return;
  }
  const nc = Math.abs(dc);
  const nr = Math.abs(dr);
  const sc = Math.sign(dc);
  const sr = Math.sign(dr);
  let col = a.col;
  let row = a.row;
  let ic = 0;
  let ir = 0;
  while (ic < nc || ir < nr) {
    if (ir >= nr || (ic < nc && (ic + 0.5) / nc < (ir + 0.5) / nr)) {
      col += sc;
      ic += 1;
    } else {
      row += sr;
      ir += 1;
    }
    out.push({ col, row });
  }
}

/**
 * Cases traversées par le trajet (le départ compris, une case revisitée l'est deux fois) et le
 * nombre de cases parcourues selon le comptage : une diagonale vaut une case, ou une sur deux en
 * vaut deux (« Diagonales alternées », sur tout le trajet) ; « Sans diagonale » : par côtés.
 */
export function gridPath(
  vertices: readonly Point[],
  grid: GridLike,
  counting: GridCounting,
): { cells: PathCell[]; steps: number } {
  const cells: PathCell[] = [];
  if (!vertices.length || !(grid.size > 0)) return { cells, steps: 0 };
  const diagonal = counting !== 'manhattan';
  let prev = cellOf(vertices[0]!, grid);
  cells.push({ ...prev, cost: 0 });
  let cost = 0;
  let diagonals = 0;
  const segment: Cell[] = [];
  for (let i = 1; i < vertices.length; i++) {
    const next = cellOf(vertices[i]!, grid);
    segment.length = 0;
    segmentCells(prev, next, diagonal, segment);
    let from = prev;
    for (const c of segment) {
      if (c.col !== from.col && c.row !== from.row) {
        diagonals += 1;
        cost += counting === 'alternating' && diagonals % 2 === 0 ? 2 : 1;
      } else cost += 1;
      cells.push({ ...c, cost });
      from = c;
    }
    prev = next;
  }
  return { cells, steps: cost };
}

/** Longueur du trajet en pixels du monde (somme des segments). */
export function pathLength(vertices: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++)
    total += Math.hypot(vertices[i]!.x - vertices[i - 1]!.x, vertices[i]!.y - vertices[i - 1]!.y);
  return total;
}

/**
 * Point du trajet à `length` pixels du départ, et l'indice du segment qui le porte ; null si
 * le trajet est plus court.
 */
export function pointAlong(
  vertices: readonly Point[],
  length: number,
): { segment: number; point: Point } | null {
  let left = length;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!;
    const b = vertices[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 0 && left <= d) {
      const k = left / d;
      return { segment: i, point: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } };
    }
    left -= d;
  }
  return null;
}

/** Mesure d'un trajet. */
export interface PathMeasure {
  /** Distance en unités : cases avec une grille de jeu et un comptage, sinon euclidienne. */
  units: number;
  /** Cases traversées (grille de jeu seulement), sinon null. */
  cells: PathCell[] | null;
  /** La distance compte les cases (sinon : la longueur). */
  counted: boolean;
}

export function measurePath(vertices: readonly Point[], u: UnitContext): PathMeasure {
  const ppu = u.pixelsPerUnit > 0 ? u.pixelsPerUnit : 50;
  if (!u.grid) return { units: pathLength(vertices) / ppu, cells: null, counted: false };
  const { cells, steps } = gridPath(vertices, u.grid, u.counting);
  const counted = u.counting !== 'off';
  return { units: counted ? steps : pathLength(vertices) / ppu, cells, counted };
}

const number = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Étiquette : « 8 m », ou « 8 / 6 m » face au déplacement du personnage. */
export function pathLabel(units: number, unitName: string, speed: number | null): string {
  const done = number(roundHalf(units));
  return speed === null
    ? `${done} ${unitName}`
    : `${done} / ${number(roundHalf(speed))} ${unitName}`;
}

/** Le trajet dépasse le déplacement (à l'arrondi de l'étiquette près). */
export const exceeds = (units: number, speed: number | null) =>
  speed !== null && roundHalf(units) > roundHalf(speed);

/**
 * Audience commune à deux audiences (§ 8) : un trajet ne va qu'à ceux qui voyaient le token à
 * chacun de ses points. Aucun joueur en commun : le MJ seul.
 */
export function intersectAudience(a: LiveAudience, b: LiveAudience): LiveAudience {
  if (a === 'gm' || b === 'gm') return 'gm';
  if (a === 'public') return b;
  if (b === 'public') return a;
  const other = new Set(b.users);
  const users = a.users.filter((u) => other.has(u));
  return users.length ? { users } : 'gm';
}

/** Sommets à plat (`x0, y0, x1, y1…`), comme le direct. */
export function flatten(points: readonly Point[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

/** Sommets d'une liste à plat (une liste impaire perd son dernier nombre). */
export function unflatten(flat: readonly number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
  return out;
}
