/**
 * Poignées communes de rotation et de taille (docs/carte.md § 6) : les mêmes pour objets,
 * tokens et textes. Du calcul pur : où sont les poignées (taille constante à l'écran), laquelle
 * est sous le pointeur, et la géométrie qui résulte d'un glisser de poignée.
 *
 * - Rotation : poignée au-dessus du bord haut ; ⇧ par pas de 15°.
 * - Taille : par les 4 coins, le coin opposé reste fixe ; ⇧ (ou une sorte à proportions fixes)
 *   garde les proportions.
 */
import {
  distance,
  normalizeDegrees,
  snapStep,
  toLocal,
  toWorld,
  type EntityGeometry,
  type Point,
} from '../geometry';

export type HandleId = 'rotate' | 'nw' | 'ne' | 'se' | 'sw';

export const CORNERS = ['nw', 'ne', 'se', 'sw'] as const;

/** Rayon de prise d'une poignée, en pixels d'écran. */
export const HANDLE_RADIUS = 7;
/** Distance entre le bord haut et la poignée de rotation, en pixels d'écran. */
export const ROTATE_OFFSET = 26;

const SIGN: Record<(typeof CORNERS)[number], [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

export interface GizmoOptions {
  rotate: boolean;
  resize: boolean;
}

/** Position des poignées dans le monde, pour ce zoom. */
export function handlePositions(
  g: EntityGeometry,
  zoom: number,
  opts: GizmoOptions,
): Partial<Record<HandleId, Point>> {
  const out: Partial<Record<HandleId, Point>> = {};
  const hw = g.width / 2;
  const hh = g.height / 2;
  if (opts.resize)
    for (const c of CORNERS) out[c] = toWorld(g, { x: SIGN[c][0] * hw, y: SIGN[c][1] * hh });
  if (opts.rotate) out.rotate = toWorld(g, { x: 0, y: -hh - ROTATE_OFFSET / zoom });
  return out;
}

/** Poignée sous le point (monde), la rotation d'abord. */
export function hitHandle(
  g: EntityGeometry,
  world: Point,
  zoom: number,
  opts: GizmoOptions,
): HandleId | null {
  const pos = handlePositions(g, zoom, opts);
  const radius = (HANDLE_RADIUS + 2) / zoom;
  for (const id of ['rotate', ...CORNERS] as const) {
    const p = pos[id];
    if (p && distance(p, world) <= radius) return id;
  }
  return null;
}

/** Curseur CSS d'une poignée, selon la rotation de l'entité. */
export function handleCursor(handle: HandleId, rotation: number): string {
  if (handle === 'rotate') return 'grab';
  const base = handle === 'nw' || handle === 'se' ? 45 : 135;
  const a = normalizeDegrees(base + rotation) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

/** Rotation : l'angle du pointeur autour du centre, depuis l'angle au départ du geste. */
export function rotateGeometry(
  g: EntityGeometry,
  start: Point,
  pointer: Point,
  step: boolean,
): EntityGeometry {
  const a0 = Math.atan2(start.y - g.y, start.x - g.x);
  const a1 = Math.atan2(pointer.y - g.y, pointer.x - g.x);
  let rotation = g.rotation + ((a1 - a0) * 180) / Math.PI;
  if (step) rotation = snapStep(rotation, 15);
  return { ...g, rotation: normalizeDegrees(rotation) };
}

/**
 * Taille par un coin : le coin opposé reste en place. `keepRatio` garde les proportions de
 * départ ; `minSize` borne la taille (pixels du monde).
 */
export function resizeGeometry(
  g: EntityGeometry,
  handle: (typeof CORNERS)[number],
  pointer: Point,
  keepRatio: boolean,
  minSize = 8,
): EntityGeometry {
  const [sx, sy] = SIGN[handle];
  const hw = g.width / 2;
  const hh = g.height / 2;
  const opposite = { x: -sx * hw, y: -sy * hh };
  const p = toLocal(g, pointer);
  // Le coin ne passe pas de l'autre côté du coin opposé
  let w = Math.max(minSize, (p.x - opposite.x) * sx);
  let h = Math.max(minSize, (p.y - opposite.y) * sy);
  if (keepRatio && g.width > 0 && g.height > 0) {
    const k = Math.max(w / g.width, h / g.height);
    w = Math.max(minSize, g.width * k);
    h = Math.max(minSize, g.height * k);
  }
  const corner = { x: opposite.x + sx * w, y: opposite.y + sy * h };
  const center = toWorld(g, { x: (opposite.x + corner.x) / 2, y: (opposite.y + corner.y) / 2 });
  return { x: center.x, y: center.y, width: w, height: h, rotation: g.rotation };
}
