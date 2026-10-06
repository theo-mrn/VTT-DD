/**
 * Aimantation de l'outil obstacles (docs/carte.md § 10), dans l'ordre : sommets existants (murs
 * et pièces, 10 px d'écran), point sur un segment de mur (le mur sera scindé : jonction soudée),
 * grille. Les listes de sommets et de segments sont gardées tant que les couches ne changent
 * pas : un déplacement du pointeur n'alloue rien d'autre que son résultat.
 */
import type { Point } from '@/lib/map/engine/geometry';
import { projectOnSegment } from '@/lib/map/engine/geometry';
import {
  snapToGridLines,
  type GridSpec,
  type SnapKind,
} from '@/lib/map/engine/interaction/snapping';
import { collectionOf, type MapStoreState } from '@/lib/map/store/map-store';
import { pointKey, polylineSegments, roundPoint } from './geometry';
import { OBSTACLES, ROOMS, type ObstacleData, type RoomData } from './model';

/** Tolérance de l'aimantation, en pixels d'écran. */
export const SNAP_PX = 10;

/** Segment de mur (index dans la ligne brisée). */
export interface SegmentHit {
  id: string;
  index: number;
  a: Point;
  b: Point;
}

export interface SnapTarget {
  point: Point;
  kind: SnapKind;
  /** Segment touché (aimantation `segment`). */
  segment?: SegmentHit;
}

export interface SnapQuery {
  /** Tolérance en pixels du monde. */
  tolerance: number;
  grid: GridSpec | null;
  /** Sommets à ignorer (clés de coordonnées : ceux qu'on déplace). */
  skipVertices?: ReadonlySet<string>;
  /** Segments à ignorer (ceux des murs qu'on déplace). */
  skipSegment?(hit: SegmentHit): boolean;
  /** Points en plus (chaîne en cours). */
  extraPoints?: readonly Point[];
}

interface Segment {
  id: string;
  index: number;
  a: Point;
  b: Point;
}

/** Le point est hors de la boîte du segment élargie de `margin`. */
function outsideBox(p: Point, s: SegmentHit, margin: number): boolean {
  return (
    p.x < Math.min(s.a.x, s.b.x) - margin ||
    p.x > Math.max(s.a.x, s.b.x) + margin ||
    p.y < Math.min(s.a.y, s.b.y) - margin ||
    p.y > Math.max(s.a.y, s.b.y) + margin
  );
}

export class ObstacleSnapper {
  private obstacles: ReadonlyMap<string, unknown> | null = null;
  private rooms: ReadonlyMap<string, unknown> | null = null;
  private vertices: Point[] = [];
  /** Nombre de segments par sommet (1 : bout libre, 2 et plus : jonction). */
  degree = new Map<string, number>();
  private segments: Segment[] = [];

  /** Relit les couches si elles ont changé. */
  refresh(state: Pick<MapStoreState, 'collections'>) {
    const obstacles = collectionOf(state, OBSTACLES);
    const rooms = collectionOf(state, ROOMS);
    if (obstacles === this.obstacles && rooms === this.rooms) return;
    this.obstacles = obstacles;
    this.rooms = rooms;
    const vertices = new Map<string, Point>();
    const degree = new Map<string, number>();
    const segments: Segment[] = [];
    for (const raw of obstacles.values()) {
      const o = raw as ObstacleData;
      o.points.forEach((p) => vertices.set(pointKey(p), p));
      polylineSegments(o.points).forEach(([a, b], index) => {
        segments.push({ id: o.id, index, a, b });
        for (const p of [a, b]) degree.set(pointKey(p), (degree.get(pointKey(p)) ?? 0) + 1);
      });
    }
    for (const raw of rooms.values()) {
      const r = raw as RoomData;
      for (const p of r.points) vertices.set(pointKey(p), p);
    }
    this.vertices = [...vertices.values()];
    this.degree = degree;
    this.segments = segments;
  }

  /** Sommets distincts connus (poignées de l'outil). */
  allVertices(): readonly Point[] {
    return this.vertices;
  }

  /** Aimante un point ; le résultat est arrondi au centième (soudure exacte). */
  snap(p: Point, q: SnapQuery): SnapTarget {
    // 1. Sommets, 2. segments de murs
    const target = this.snapToVertex(p, q) ?? this.snapToSegment(p, q);
    if (target) return target;
    // 3. Grille
    if (q.grid && q.grid.size > 0)
      return { point: roundPoint(snapToGridLines(p, q.grid)), kind: 'grid' };
    return { point: roundPoint(p), kind: 'none' };
  }

  /** Sommet le plus proche (connu ou en plus), à la tolérance près. */
  private snapToVertex(p: Point, q: SnapQuery): SnapTarget | null {
    let best: Point | null = null;
    let bestD = q.tolerance;
    const consider = (v: Point) => {
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = v;
      }
    };
    for (const v of this.vertices) {
      if (q.skipVertices?.has(pointKey(v))) continue;
      consider(v);
    }
    for (const v of q.extraPoints ?? []) consider(v);
    if (!best) return null;
    return { point: { x: (best as Point).x, y: (best as Point).y }, kind: 'point' };
  }

  /** Point le plus proche sur un segment de mur, à la tolérance près. */
  private snapToSegment(p: Point, q: SnapQuery): SnapTarget | null {
    let hit: SegmentHit | null = null;
    let hitPoint: Point | null = null;
    let bestD = q.tolerance;
    for (const s of this.segments) {
      // Boîte grossière d'abord
      if (outsideBox(p, s, bestD)) continue;
      if (q.skipSegment?.(s)) continue;
      const proj = projectOnSegment(p, s.a, s.b);
      const d = Math.hypot(proj.point.x - p.x, proj.point.y - p.y);
      if (d <= bestD) {
        bestD = d;
        hit = s;
        hitPoint = proj.point;
      }
    }
    if (hit && hitPoint) return { point: roundPoint(hitPoint), kind: 'segment', segment: hit };
    return null;
  }

  /** Segment de mur le plus proche du point (porte à insérer, double clic), à `tolerance` près. */
  nearestSegment(
    p: Point,
    tolerance: number,
    accept?: (hit: SegmentHit) => boolean,
  ): (SegmentHit & { point: Point; t: number }) | null {
    let best: (SegmentHit & { point: Point; t: number }) | null = null;
    let bestD = tolerance;
    for (const s of this.segments) {
      if (accept && !accept(s)) continue;
      const proj = projectOnSegment(p, s.a, s.b);
      const d = Math.hypot(proj.point.x - p.x, proj.point.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = { ...s, point: proj.point, t: proj.t };
      }
    }
    return best;
  }
}
