/**
 * Dessin Pixi des tracés : dessins enregistrés, aperçu de l'outil, tracés en cours des autres.
 * Joints et extrémités arrondis, épaisseur en pixels du monde. Aucun import de valeur de Pixi :
 * le module `pixi.js` est passé par le moteur (un fichier de module reste testable sans WebGL).
 */
import type * as Pixi from 'pixi.js';
import { DEFAULT_DRAWING_COLOR } from './palette';
import { catmullRom, isClosedShape, shapeOf, type DrawingLike, type DrawingShape } from './shapes';

export interface ColorValue {
  color: number;
  alpha: number;
}

const colors = new Map<string, ColorValue>();
const MAX_COLORS = 512;

/** Couleur CSS lue par Pixi (hex, `rgba()`, noms), gardée en cache. */
export function pixiColor(pixi: typeof Pixi, css: string | null | undefined): ColorValue {
  const key = css || DEFAULT_DRAWING_COLOR;
  let c = colors.get(key);
  if (!c) {
    try {
      const parsed = new pixi.Color(key);
      c = { color: parsed.toNumber(), alpha: parsed.alpha };
    } catch {
      const fallback = new pixi.Color(DEFAULT_DRAWING_COLOR);
      c = { color: fallback.toNumber(), alpha: 1 };
    }
    if (colors.size >= MAX_COLORS) colors.delete(colors.keys().next().value!);
    colors.set(key, c);
  }
  return c;
}

export interface StrokeParams {
  width: number;
  color: number;
  alpha: number;
}

const strokeStyle = (s: StrokeParams) => ({
  width: s.width,
  color: s.color,
  alpha: s.alpha,
  cap: 'round' as const,
  join: 'round' as const,
});

/** Tracé réduit à un point (clic sans glisser) : un disque de l'épaisseur du trait. */
function isDot(points: readonly { x: number; y: number }[]): boolean {
  const first = points[0];
  if (!first) return false;
  for (const p of points)
    if (Math.abs(p.x - first.x) > 1e-6 || Math.abs(p.y - first.y) > 1e-6) return false;
  return true;
}

/** Dessine une forme dans `g` (sans le vider). */
export function drawShape(
  g: Pixi.Graphics,
  shape: DrawingShape,
  stroke: StrokeParams,
  fill: ColorValue | null,
) {
  const fillIt = fill && isClosedShape(shape);
  switch (shape.type) {
    case 'line':
      g.moveTo(shape.a.x, shape.a.y).lineTo(shape.b.x, shape.b.y).stroke(strokeStyle(stroke));
      return;
    case 'rect':
      g.rect(shape.x, shape.y, shape.width, shape.height);
      if (fillIt) g.fill({ color: fill.color, alpha: fill.alpha });
      g.stroke(strokeStyle(stroke));
      return;
    case 'ellipse':
      if (shape.rx < 1e-3 || shape.ry < 1e-3) {
        g.moveTo(shape.cx - shape.rx, shape.cy - shape.ry)
          .lineTo(shape.cx + shape.rx, shape.cy + shape.ry)
          .stroke(strokeStyle(stroke));
        return;
      }
      g.ellipse(shape.cx, shape.cy, shape.rx, shape.ry);
      if (fillIt) g.fill({ color: fill.color, alpha: fill.alpha });
      g.stroke(strokeStyle(stroke));
      return;
    case 'path': {
      const pts = shape.points;
      if (!pts.length) return;
      if (isDot(pts)) {
        g.circle(pts[0]!.x, pts[0]!.y, Math.max(0.5, stroke.width / 2)).fill({
          color: stroke.color,
          alpha: stroke.alpha,
        });
        return;
      }
      g.moveTo(pts[0]!.x, pts[0]!.y);
      if (shape.smooth && pts.length >= 3)
        catmullRom(pts, shape.closed, (c1x, c1y, c2x, c2y, x, y) =>
          g.bezierCurveTo(c1x, c1y, c2x, c2y, x, y),
        );
      else for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
      if (shape.closed) g.closePath();
      if (fillIt) g.fill({ color: fill.color, alpha: fill.alpha });
      g.stroke(strokeStyle(stroke));
      return;
    }
  }
}

/** Dessine un dessin enregistré (vide `g` d'abord). */
export function drawDrawing(
  g: Pixi.Graphics,
  pixi: typeof Pixi,
  d: DrawingLike & { color: string },
) {
  g.clear();
  const c = pixiColor(pixi, d.color);
  const fill = typeof d.fill === 'string' && d.fill ? pixiColor(pixi, d.fill) : null;
  drawShape(g, shapeOf(d), { width: Math.max(0.5, d.width), color: c.color, alpha: c.alpha }, fill);
}

/**
 * Polyligne brute à plat (`x0, y0, x1, y1…`) : tracé en cours, sans lissage (le lissage vient
 * au lâcher, sur les points simplifiés).
 */
export function drawFlatPolyline(
  g: Pixi.Graphics,
  flat: readonly number[],
  count: number,
  stroke: StrokeParams,
) {
  if (count < 1) return;
  if (count === 1) {
    g.circle(flat[0]!, flat[1]!, Math.max(0.5, stroke.width / 2)).fill({
      color: stroke.color,
      alpha: stroke.alpha,
    });
    return;
  }
  g.moveTo(flat[0]!, flat[1]!);
  for (let i = 1; i < count; i++) g.lineTo(flat[i * 2]!, flat[i * 2 + 1]!);
  g.stroke(strokeStyle(stroke));
}
