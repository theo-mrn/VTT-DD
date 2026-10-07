/**
 * Sorte d'entité `drawing` (couche `drawings`, docs/carte.md § 10) : un tracé est une entité
 * comme les autres (sélection, glisser, taille, dupliquer, supprimer, ordre et calque),
 * modifiable par son auteur ou le MJ (`authorOrGm`, miroir du backend).
 *
 * - Géométrie : la boîte des points, épaisseur comprise ; glisser translate les points, les
 *   poignées les mettent à l'échelle.
 * - Toucher précis : distance au tracé ≤ épaisseur / 2 + 6 px d'écran, ou intérieur d'une forme
 *   remplie.
 * - Rendu : un `Graphics` par dessin, en coordonnées du monde, redessiné seulement si ce qui se
 *   voit a changé.
 * - Rangement : annotation (plan `annotations`, au-dessus de l'ombre) si `layerId` est nul,
 *   sinon dans son calque.
 */
import { translate } from '@/i18n/runtime';
import { Layers2 } from 'lucide-react';
import type { Graphics } from 'pixi.js';
import {
  authorOrGm,
  field,
  type EntityKind,
  type MenuItem,
} from '@/lib/map/engine/entities/entity-kind';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { EntityGeometry, Point } from '@/lib/map/engine/geometry';
import { HIT_TOLERANCE_PX, type MapEngine } from '@/lib/map/engine/map-engine';
import { deepEqual } from '@/lib/map/store/commands';
import { moveToAnnotations } from './operations';
import { drawDrawing } from './render';
import type { DrawingsRuntime } from './runtime';
import {
  drawingBounds,
  hitShape,
  isFilled,
  outlineOf,
  transformDrawing,
  translatePoints,
  type DrawingShape,
} from './shapes';
import { DRAWING_KIND, DRAWINGS_COLLECTION, HIT_SLOP_PX, type DrawingData } from './types';

/** Géométrie d'un dessin : boîte des points, épaisseur comprise, sans rotation. */
export function drawingGeometry(d: DrawingData): EntityGeometry {
  const b = drawingBounds(d);
  return {
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
    width: b.width,
    height: b.height,
    rotation: 0,
  };
}

/** Dessin après un glisser (translation) ou les poignées (mise à l'échelle des points). */
export function applyDrawingGeometry(d: DrawingData, next: EntityGeometry): DrawingData {
  const g = drawingGeometry(d);
  if (Math.abs(next.width - g.width) < 1e-6 && Math.abs(next.height - g.height) < 1e-6) {
    const dx = next.x - g.x;
    const dy = next.y - g.y;
    if (!dx && !dy) return d;
    return { ...d, points: translatePoints(d.points, dx, dy) };
  }
  const half = Math.max(0, d.width) / 2;
  return transformDrawing(d, {
    x: next.x - next.width / 2 + half,
    y: next.y - next.height / 2 + half,
    width: Math.max(0, next.width - 2 * half),
    height: Math.max(0, next.height - 2 * half),
  });
}

// Forme touchable d'une donnée (les données sont immuables : un cache par référence)
const shapes = new WeakMap<DrawingData, DrawingShape>();
const shapeFor = (d: DrawingData) => {
  let s = shapes.get(d);
  if (!s) {
    s = outlineOf(d);
    shapes.set(d, s);
  }
  return s;
};

/** Point du monde ramené dans le repère de la donnée (fantôme déplacé ou redimensionné). */
function toDataFrame(e: MapEntity<DrawingData>, p: Point): Point {
  const g = e.geometry;
  const c = e.current;
  if (c === g) return p;
  const sx = c.width > 1e-6 ? g.width / c.width : 1;
  const sy = c.height > 1e-6 ? g.height / c.height : 1;
  return { x: g.x + (p.x - c.x) * sx, y: g.y + (p.y - c.y) * sy };
}

/**
 * Le point touche le dessin. `tolerance` : la tolérance du moteur (4 px d'écran, en pixels du
 * monde), portée à 6 px d'écran.
 */
export function hitDrawing(e: MapEntity<DrawingData>, p: Point, tolerance: number): boolean {
  const d = e.data;
  const reach = Math.max(0, d.width) / 2 + tolerance * (HIT_SLOP_PX / HIT_TOLERANCE_PX);
  return hitShape(shapeFor(d), toDataFrame(e, p), reach, isFilled(d));
}

/** Ce qui se voit d'un dessin a changé (sinon le `Graphics` reste tel quel). */
export const drawingLooksDifferent = (a: DrawingData, b: DrawingData) =>
  a.tool !== b.tool ||
  a.color !== b.color ||
  a.width !== b.width ||
  a.fill !== b.fill ||
  a.closed !== b.closed ||
  a.smooth !== b.smooth ||
  (a.points !== b.points && !deepEqual(a.points, b.points));

/** Entrée « Passer en annotation » pour des éléments rangés dans un calque. */
export function annotationMenuItem(engine: MapEngine, entities: readonly MapEntity[]): MenuItem[] {
  const layered = entities.filter(
    (e) => e.layerId !== null && e.kind.can('order', e, engine.viewer),
  );
  if (!layered.length) return [];
  return [
    {
      id: 'drawings:to-annotation',
      label: translate('map.drawings.toAnnotation'),
      icon: Layers2,
      run: () => void moveToAnnotations(engine, layered),
    },
  ];
}

export function drawingKind(rt: DrawingsRuntime): EntityKind<DrawingData> {
  return {
    id: DRAWING_KIND,
    label: translate('map.drawings.drawing'),
    collection: DRAWINGS_COLLECTION,
    capabilities: ['select', 'move', 'resize', 'duplicate', 'delete', 'inspect', 'order'],
    plane: 'annotations',
    stacking: {
      arrangeKind: 'drawing',
      layerId: field<DrawingData, string | null>('layerId'),
      z: field<DrawingData, number>('z'),
      optional: true,
      defaultRole: 'ground',
    },
    display: 'drawings',
    // Points en coordonnées du monde : le moteur ne décale que l'aperçu d'un geste
    transformDisplay: false,
    minSize: 4,
    geometry: drawingGeometry,
    applyGeometry: applyDrawingGeometry,
    name: () => null,
    can: authorOrGm(),
    hitTest: hitDrawing,
    render(entity, ctx) {
      const g = new ctx.pixi.Graphics({ label: 'drawing' });
      entity.display!.addChild(g);
      entity.renderState.g = g;
      drawDrawing(g, ctx.pixi, entity.data);
    },
    update(entity, ctx, change) {
      if (!change.previous) return;
      const g = entity.renderState.g as Graphics | undefined;
      if (!g || g.destroyed) return;
      if (drawingLooksDifferent(change.previous, entity.data))
        drawDrawing(g, ctx.pixi, entity.data);
    },
    dispose(entity) {
      entity.renderState = {};
    },
    duplicate: (d, offset, ctx) => ({
      ...d,
      points: translatePoints(d.points, offset.x, offset.y),
      createdBy: ctx.viewer.userId,
    }),
    actions: (entities) =>
      annotationMenuItem(rt.engine, entities as unknown as readonly MapEntity[]),
    persistence: rt.drawings,
  };
}
