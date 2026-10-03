/**
 * Quadrillages d'une scène (docs/carte.md § 4) : données et calculs purs, sans rendu.
 *
 * Un quadrillage est défini en pixels du monde (du fond) : sa case (`size`) et son origine
 * (`offsetX`, `offsetY`, par où passent une ligne verticale et une horizontale). Il tombe donc
 * au même endroit de l'image pour tous, quels que soient l'écran et le zoom. La grille de jeu
 * (`primary`) donne la case de la scène (`scenePixelsPerUnit`, @vtt/contracts).
 */
import { MAP_GRIDS_MAX, type MapGrid } from '@vtt/contracts';
import type { Point } from '../../engine/geometry';

export const GRID_CALIBRATE_TOOL_ID = 'grid-calibrate';

/** Couleurs proposées (données : un quadrillage sur fond sombre ou clair). */
export const GRID_COLORS = [
  { value: '#000000', label: 'Noir' },
  { value: '#ffffff', label: 'Blanc' },
  { value: '#9ca3af', label: 'Gris' },
  { value: '#f5c542', label: 'Or' },
  { value: '#38bdf8', label: 'Bleu' },
  { value: '#ef4444', label: 'Rouge' },
] as const;

/** Nombre de cases couvertes par le glisser du calibrage. */
export const CALIBRATE_CELLS = [1, 2, 3, 4, 5, 10] as const;

/** En dessous de cette taille de case à l'écran, le quadrillage n'est plus dessiné (trop dense). */
export const MIN_CELL_PX = 6;
/** Entre `MIN_CELL_PX` et celle-ci, il s'estompe. */
export const FADE_CELL_PX = 14;

const round2 = (v: number) => Math.round(v * 100) / 100;
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** Origine ramenée dans [0, size[ (même quadrillage, valeurs lisibles). */
export function normalizeOffset(v: number, size: number): number {
  return size > 0 ? round2(mod(v, size)) : 0;
}

/** Nouveau quadrillage : la grille de jeu s'il n'y en a pas encore, à la case de la scène. */
export function newGrid(existing: readonly MapGrid[], cell: number): MapGrid | null {
  if (existing.length >= MAP_GRIDS_MAX) return null;
  let n = existing.length + 1;
  while (existing.some((g) => g.id === `grille-${n}`)) n++;
  const primary = !existing.some((g) => g.primary);
  return {
    id: `grille-${n}`,
    name: primary ? 'Grille de jeu' : `Quadrillage ${n}`,
    size: round2(cell > 0 ? cell : 50),
    offsetX: 0,
    offsetY: 0,
    color: '#000000',
    opacity: 0.35,
    thickness: 1,
    visibleToPlayers: true,
    primary,
  };
}

/** Modifie un quadrillage ; `primary` n'en laisse qu'une (la grille de jeu). */
export function withGrid(
  grids: readonly MapGrid[],
  id: string,
  patch: Partial<Omit<MapGrid, 'id'>>,
): MapGrid[] {
  return grids.map((g) => {
    if (g.id === id) {
      const next = { ...g, ...patch };
      return {
        ...next,
        offsetX: normalizeOffset(next.offsetX, next.size),
        offsetY: normalizeOffset(next.offsetY, next.size),
      };
    }
    return patch.primary ? { ...g, primary: false } : g;
  });
}

/**
 * Positions des lignes d'un quadrillage entre `from` et `to` (pixels du monde) : origine
 * `offset`, pas `size`. Null au-delà de `max` lignes (zoom trop éloigné : on ne dessine pas).
 */
export function linePositions(
  offset: number,
  size: number,
  from: number,
  to: number,
  max = 1500,
): number[] | null {
  if (!(size > 0) || to < from) return [];
  const first = offset + Math.ceil((from - offset) / size) * size;
  const count = Math.floor((to - first) / size) + 1;
  if (count > max) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(first + i * size);
  return out;
}

/**
 * Calibrage sur l'image : le glisser couvre `cells` × `cells` cases dessinées dans le fond.
 * La case est la moyenne des deux côtés ; l'origine est le coin de départ. Null si le
 * rectangle est trop petit.
 */
export function calibrate(
  a: Point,
  b: Point,
  cells: number,
): { size: number; offsetX: number; offsetY: number } | null {
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w < 4 || h < 4 || cells < 1) return null;
  const size = round2((w + h) / (2 * cells));
  if (size < 4) return null;
  return {
    size,
    offsetX: normalizeOffset(Math.min(a.x, b.x), size),
    offsetY: normalizeOffset(Math.min(a.y, b.y), size),
  };
}

/** Opacité appliquée selon la taille d'une case à l'écran (0 : pas dessiné). */
export function densityFade(cellPx: number): number {
  if (cellPx < MIN_CELL_PX) return 0;
  if (cellPx >= FADE_CELL_PX) return 1;
  return (cellPx - MIN_CELL_PX) / (FADE_CELL_PX - MIN_CELL_PX);
}

/** Quadrillages que ce viewer voit : tous pour le MJ, ceux montrés aux joueurs sinon. */
export function visibleGrids(grids: readonly MapGrid[] | undefined, gm: boolean): MapGrid[] {
  return (grids ?? []).filter((g) => gm || g.visibleToPlayers);
}
