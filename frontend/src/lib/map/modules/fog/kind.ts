/**
 * Sorte `fog-zone` (docs/carte.md § 10, Brouillard) : cercle, rectangle ou polygone à main
 * levée, en mode `fog` (ajoute) ou `clear` (retire).
 *
 * - Réservée à l'outil brouillard (`editTool`, G) : sélection, déplacement, poignées de taille,
 *   suppression, comme toute entité, mais seulement avec cet outil.
 * - Dessin MJ (plan `gm`) : contour et voile léger pour `fog`, hachures pour `clear`. Le rendu du
 *   brouillard lui-même (ce que voient les joueurs) est celui du module vision.
 */
import { CloudFog, Eraser } from 'lucide-react';
import type { Graphics } from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import {
  isGm,
  type EntityAction,
  type EntityKind,
  type MapViewer,
} from '../../engine/entities/entity-kind';
import { geometryBounds, type EntityGeometry, type Point } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import { updateCommand, type Persistence } from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import { OverlayRedraw, dashedCircle, dashedPolyline } from '../obstacles/overlay';
import { circlePolygon, hatchPolygon, zoneContains } from './geometry';
import { FOG_TOOL_ID, FOG_ZONE_KIND, FOG_ZONES, invertMode, type FogZoneData } from './model';

const zoneOf = (e: MapEntity) => e.data as FogZoneData;
const round2 = (v: number) => Math.round(v * 100) / 100;

export function zoneGeometry(z: FogZoneData): EntityGeometry {
  if (z.shape === 'circle') {
    const r = z.radius ?? 0;
    const c = z.center ?? { x: 0, y: 0 };
    return { x: c.x, y: c.y, width: 2 * r, height: 2 * r, rotation: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of z.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!z.points.length) return { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    rotation: 0,
  };
}

/** La zone après un glisser ou une poignée de taille (translation et mise à l'échelle). */
export function applyZoneGeometry(z: FogZoneData, g: EntityGeometry): FogZoneData {
  const before = zoneGeometry(z);
  if (z.shape === 'circle') {
    const radius = round2(Math.max(1, (g.width + g.height) / 4));
    return { ...z, center: { x: round2(g.x), y: round2(g.y) }, radius };
  }
  const sx = before.width ? g.width / before.width : 1;
  const sy = before.height ? g.height / before.height : 1;
  return {
    ...z,
    points: z.points.map((p) => ({
      x: round2(g.x + (p.x - before.x) * sx),
      y: round2(g.y + (p.y - before.y) * sy),
    })),
  };
}

const gmOnlyStrict = (action: EntityAction, _e: MapEntity, viewer: MapViewer) =>
  action === 'view' || isGm(viewer);

export interface FogContext {
  engine: MapEngine;
  persistence: Persistence<MapDto>;
}

/** Bascule le mode de zones (ajouter ↔ retirer) : une commande. */
export function toggleZoneMode(ctx: FogContext, entities: readonly MapEntity[]) {
  const changes = entities.map((e) => {
    const before = zoneOf(e);
    return {
      before: before as MapDto,
      after: { ...before, mode: invertMode(before.mode) } as MapDto,
    };
  });
  if (!changes.length) return null;
  return ctx.engine.execute(
    updateCommand({
      label: 'Changer le mode',
      collection: FOG_ZONES,
      persistence: ctx.persistence,
      changes,
    }),
  );
}

/** Dessin des zones (MJ), redessiné par paliers de zoom. */
export class FogView {
  private readonly redraw: OverlayRedraw;

  constructor(private readonly engine: MapEngine) {
    this.redraw = new OverlayRedraw(engine, (e) => this.draw(e));
  }

  dispose() {
    this.redraw.dispose();
  }

  mount(e: MapEntity) {
    const pixi = this.engine.pixi;
    if (!pixi || !e.display) return;
    const g = new pixi.Graphics({ label: 'fog-zone' });
    e.display.addChild(g);
    e.renderState.fog = g;
    this.redraw.track(e);
    this.draw(e);
  }

  unmount(e: MapEntity) {
    // Son dessin est un enfant de `e.display` : le moteur le libère avec lui (`destroyDisplay`)
    this.redraw.untrack(e);
    e.renderState = {};
  }

  draw(e: MapEntity) {
    const g = e.renderState.fog as Graphics | undefined;
    const theme = this.engine.theme;
    if (!g || !theme) return;
    g.clear();
    if (!isGm(this.engine.viewer)) return;
    const z = zoneOf(e);
    const u = this.redraw.unit;
    const clear = z.mode === 'clear';
    const accent = clear ? theme.primary : theme.foreground;
    let strong = 0.7;
    if (e.state.selected) strong = 1;
    else if (e.state.hovered) strong = 0.9;
    const outline: Point[] =
      z.shape === 'circle' ? circlePolygon(z.center ?? { x: 0, y: 0 }, z.radius ?? 0) : z.points;

    if (clear) {
      for (const [a, b] of hatchPolygon(outline, 10 * u)) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      g.stroke({ width: 1.5 * u, color: theme.primary, alpha: 0.45 * strong });
    } else if (z.shape === 'circle') {
      g.circle(z.center?.x ?? 0, z.center?.y ?? 0, z.radius ?? 0).fill({
        color: theme.background,
        alpha: 0.22,
      });
    } else if (z.points.length >= 3) {
      g.poly(
        z.points.flatMap((p) => [p.x, p.y]),
        true,
      ).fill({ color: theme.background, alpha: 0.22 });
    }

    const width = (e.state.selected ? 2.5 : 1.75) * u;
    if (z.shape === 'circle') {
      if (clear) dashedCircle(g, z.center?.x ?? 0, z.center?.y ?? 0, z.radius ?? 0, 8 * u, 5 * u);
      else g.circle(z.center?.x ?? 0, z.center?.y ?? 0, z.radius ?? 0);
    } else if (clear) dashedPolyline(g, z.points, 8 * u, 5 * u, true);
    else if (z.points.length >= 2)
      g.poly(
        z.points.flatMap((p) => [p.x, p.y]),
        true,
      );
    g.stroke({ width, color: accent, alpha: strong, cap: 'butt' });
  }
}

export function fogZoneKind(ctx: FogContext, view: FogView): EntityKind<MapDto> {
  const { engine } = ctx;
  return {
    id: FOG_ZONE_KIND,
    label: 'Zone de brouillard',
    collection: FOG_ZONES,
    capabilities: ['select', 'move', 'resize', 'delete', 'inspect', 'duplicate'],
    plane: 'gm',
    display: 'fog',
    editTool: FOG_TOOL_ID,
    selfOutline: true,
    transformDisplay: false,
    geometry: (z) => zoneGeometry(z as FogZoneData),
    applyGeometry: (z, g) => applyZoneGeometry(z as FogZoneData, g),
    name: (z) => ((z as FogZoneData).mode === 'clear' ? 'Zone découverte' : 'Brouillard'),
    can: gmOnlyStrict,
    hitTest(e, p, tol) {
      const z = zoneOf(e);
      // Pendant un geste (aperçu), la forme suit la géométrie affichée
      const g = e.current;
      const base = e.geometry;
      const moved =
        g.x !== base.x || g.y !== base.y || g.width !== base.width || g.height !== base.height
          ? applyZoneGeometry(z, g)
          : z;
      return zoneContains(moved, p, tol);
    },
    bounds: (e) => {
      const b = geometryBounds(e.current);
      return { x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4 };
    },
    render: (e) => view.mount(e),
    update: (e) => view.draw(e),
    dispose: (e) => view.unmount(e),
    actions: (entities) => {
      if (!isGm(engine.viewer)) return [];
      const modes = new Set(entities.map((e) => zoneOf(e).mode));
      if (modes.size !== 1) return [];
      const next = invertMode([...modes][0]!);
      return [
        {
          id: 'fog:mode',
          label: next === 'fog' ? 'En faire du brouillard' : 'En faire une zone découverte',
          icon: next === 'fog' ? CloudFog : Eraser,
          run: () => void toggleZoneMode(ctx, entities),
        },
      ];
    },
    duplicate: (z, offset) => {
      const d = z as FogZoneData;
      return d.shape === 'circle'
        ? { ...d, center: { x: (d.center?.x ?? 0) + offset.x, y: (d.center?.y ?? 0) + offset.y } }
        : { ...d, points: d.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })) };
    },
    liveAudience: () => 'gm',
    persistence: ctx.persistence as never,
  };
}
