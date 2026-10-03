/**
 * Tests de propriété, à graine fixe : `visibilityPolygon` et `View.contains` comparés à un
 * lancer de rayons naïf sur des milliers de scènes aléatoires (segments réels, grille entière
 * pleine de colinéarités, grandes coordonnées), et absence de toute fuite dans des polygones de
 * murs soudés, même presque soudés.
 */
import { describe, expect, it } from 'vitest';
import {
  lightArea,
  playerView,
  pointInPolygon,
  prepareScene,
  viewerView,
  visibilityPolygon,
  type Light,
  type PrepareOptions,
  type Room,
  type Segment,
  type Vec,
  type VisionScene,
} from './index.js';
import { ambiguous, blocks, distToSegment, naiveVisible, segmentsTouch } from './testing/naive.js';
import { Prng } from './testing/prng.js';
import {
  latticeSegments,
  randomSegments,
  randomStarPolygon,
  rectPoints,
  ringWalls,
} from './testing/scenes.js';

/** Points de croisement francs entre segments (la soudure peut y déplacer la géométrie). */
function crossings(segments: readonly Segment[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i]!;
      const t = segments[j]!;
      if (!segmentsTouch(s.a, s.b, t.a, t.b)) continue;
      const ex = s.b.x - s.a.x;
      const ey = s.b.y - s.a.y;
      const fx = t.b.x - t.a.x;
      const fy = t.b.y - t.a.y;
      const den = ex * fy - ey * fx;
      if (den === 0) continue;
      const u = ((t.a.x - s.a.x) * fy - (t.a.y - s.a.y) * fx) / den;
      out.push({ x: s.a.x + u * ex, y: s.a.y + u * ey });
    }
  }
  return out;
}

/** Observateur aléatoire, loin de tout segment. */
function pickViewer(rng: Prng, segments: readonly Segment[], w: number, h: number, tol: number) {
  for (let k = 0; k < 50; k++) {
    const o = { x: rng.range(tol * 4, w - tol * 4), y: rng.range(tol * 4, h - tol * 4) };
    if (segments.every((s) => distToSegment(o, s.a, s.b) > tol * 4)) return o;
  }
  return null;
}

/** Points de test : uniformes, près des murs, et sur des rayons qui frôlent les extrémités. */
function testPoints(
  rng: Prng,
  segments: readonly Segment[],
  o: Vec,
  w: number,
  h: number,
  n: number,
  tol: number,
) {
  const pts: Vec[] = [];
  for (let k = 0; k < n; k++) pts.push({ x: rng.range(0, w), y: rng.range(0, h) });
  for (let k = 0; k < n / 2 && segments.length > 0; k++) {
    const s = rng.pick(segments);
    const t = rng.next();
    const nx = -(s.b.y - s.a.y);
    const ny = s.b.x - s.a.x;
    const len = Math.hypot(nx, ny) || 1;
    const off = rng.pick([-1, 1]) * tol * rng.range(2, 50);
    pts.push({
      x: s.a.x + t * (s.b.x - s.a.x) + (off * nx) / len,
      y: s.a.y + t * (s.b.y - s.a.y) + (off * ny) / len,
    });
  }
  for (let k = 0; k < n / 2 && segments.length > 0; k++) {
    const s = rng.pick(segments);
    const e = rng.chance(0.5) ? s.a : s.b;
    // Rayon de O vers e, tourné d'un angle qui le fait passer à quelques tolérances de e.
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    const ang = (rng.pick([-1, 1]) * tol * rng.range(2, 20)) / d;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const t = rng.range(1.05, 3);
    pts.push({ x: o.x + t * (dx * c - dy * sn), y: o.y + t * (dx * sn + dy * c) });
  }
  return pts.filter((p) => p.x > 0 && p.y > 0 && p.x < w && p.y < h);
}

interface Mismatch {
  scene: number;
  o: Vec;
  p: Vec;
  expected: boolean;
  contains: boolean;
  polygon: boolean;
}

/**
 * Compare une scène à la référence naïve depuis quelques observateurs. `tol` : distance
 * d'exclusion des cas ambigus (points près d'un mur, rayons rasant une extrémité ou un
 * croisement, où la soudure peut déplacer la géométrie).
 */
function compareScene(
  rng: Prng,
  index: number,
  scene: VisionScene,
  options: PrepareOptions,
  tol: number,
  mismatches: Mismatch[],
): number {
  const { width: w, height: h } = scene.bounds;
  const prep = prepareScene(scene, options);
  const cross = crossings(scene.segments);
  let checked = 0;
  for (let v = 0; v < 2; v++) {
    const o = pickViewer(rng, scene.segments, w, h, tol);
    if (!o) continue;
    const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
    const poly = visibilityPolygon(prep, o);
    for (const p of testPoints(rng, scene.segments, o, w, h, 30, tol)) {
      if (ambiguous(scene.segments, o, p, tol)) continue;
      if (cross.some((c) => distToSegment(c, o, p) < tol)) continue;
      const expected = naiveVisible(scene.segments, o, p);
      const contains = view.contains(p);
      const polygon = pointInPolygon(p, poly);
      checked++;
      if (contains !== expected || polygon !== expected) {
        mismatches.push({ scene: index, o, p, expected, contains, polygon });
      }
    }
  }
  return checked;
}

function report(mismatches: Mismatch[]) {
  return mismatches
    .slice(0, 5)
    .map(
      (m) =>
        `scène ${m.scene} O=(${m.o.x}, ${m.o.y}) P=(${m.p.x}, ${m.p.y}) attendu ${m.expected}, contains ${m.contains}, polygone ${m.polygon}`,
    )
    .join('\n');
}

// Milliers de scènes par test : quelques secondes seul, bien plus sur un runner de CI
// partagé avec la couverture v8
describe('comparaison au lancer de rayons naïf', { timeout: 60_000 }, () => {
  it('1 500 scènes de segments réels (sans soudure)', () => {
    const rng = new Prng(1);
    const mismatches: Mismatch[] = [];
    let checked = 0;
    for (let i = 0; i < 1500; i++) {
      const segments = randomSegments(rng, rng.int(1, 40), 1000);
      checked += compareScene(
        rng,
        i,
        { bounds: { width: 1000, height: 1000 }, segments },
        { snap: 0 },
        1e-3,
        mismatches,
      );
    }
    expect(report(mismatches)).toBe('');
    expect(checked).toBeGreaterThan(100_000);
  });

  it('1 500 scènes sur grille entière (colinéarités, T, doublons, segments nuls)', () => {
    const rng = new Prng(2);
    const mismatches: Mismatch[] = [];
    let checked = 0;
    for (let i = 0; i < 1500; i++) {
      const segments = latticeSegments(rng, rng.int(1, 40), 20, 10);
      checked += compareScene(
        rng,
        i,
        { bounds: { width: 200, height: 200 }, segments },
        { snap: 0 },
        1e-4,
        mismatches,
      );
    }
    expect(report(mismatches)).toBe('');
    expect(checked).toBeGreaterThan(100_000);
  });

  it('500 + 500 scènes avec la soudure par défaut (0,5 px)', () => {
    const rng = new Prng(3);
    const mismatches: Mismatch[] = [];
    let checked = 0;
    for (let i = 0; i < 500; i++) {
      const segments = randomSegments(rng, rng.int(1, 40), 1000);
      checked += compareScene(
        rng,
        i,
        { bounds: { width: 1000, height: 1000 }, segments },
        {},
        1.6,
        mismatches,
      );
    }
    for (let i = 0; i < 500; i++) {
      const segments = latticeSegments(rng, rng.int(1, 40), 20, 10);
      checked += compareScene(
        rng,
        500 + i,
        { bounds: { width: 200, height: 200 }, segments },
        {},
        1.6,
        mismatches,
      );
    }
    expect(report(mismatches)).toBe('');
    expect(checked).toBeGreaterThan(50_000);
  });

  it('300 scènes à grandes coordonnées (carte de 1 000 000 px)', () => {
    const rng = new Prng(4);
    const mismatches: Mismatch[] = [];
    let checked = 0;
    const big = 1_000_000;
    for (let i = 0; i < 300; i++) {
      // Géométrie dans une fenêtre de 2 000 px près du coin opposé, plus quelques longs murs.
      const x0 = big - 2500;
      const local = randomSegments(rng, rng.int(1, 30), 2000).map((s) => ({
        ...s,
        a: { x: s.a.x + x0, y: s.a.y + x0 },
        b: { x: s.b.x + x0, y: s.b.y + x0 },
      }));
      const long = randomSegments(rng, rng.int(0, 3), big);
      const segments = [...local, ...long];
      const scene = { bounds: { width: big, height: big }, segments };
      const prep = prepareScene(scene, { snap: 0 });
      const cross = crossings(segments);
      const tol = 0.01;
      for (let v = 0; v < 2; v++) {
        const o = { x: x0 + rng.range(0, 2000), y: x0 + rng.range(0, 2000) };
        if (segments.some((s) => distToSegment(o, s.a, s.b) < tol * 4)) continue;
        const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
        const poly = visibilityPolygon(prep, o);
        const pts = testPoints(rng, local, o, big, big, 30, tol).map((p) => p);
        for (let k = 0; k < 20; k++)
          pts.push({ x: x0 + rng.range(-500, 2500), y: x0 + rng.range(-500, 2500) });
        for (const p of pts) {
          if (p.x <= 0 || p.y <= 0 || p.x >= big || p.y >= big) continue;
          if (ambiguous(segments, o, p, tol)) continue;
          if (cross.some((c) => distToSegment(c, o, p) < tol)) continue;
          const expected = naiveVisible(segments, o, p);
          const contains = view.contains(p);
          const polygon = pointInPolygon(p, poly);
          checked++;
          if (contains !== expected || polygon !== expected) {
            mismatches.push({ scene: i, o, p, expected, contains, polygon });
          }
        }
      }
    }
    expect(report(mismatches)).toBe('');
    expect(checked).toBeGreaterThan(10_000);
  });
});

/** Scène de polygones de murs soudés (murs et portes fermées), avec des segments parasites. */
function ringScene(rng: Prng, size: number, jitter: number) {
  const rings: Vec[][] = [];
  const segments: Segment[] = [];
  const count = rng.int(1, 4);
  for (let r = 0; r < count; r++) {
    const kind = rng.int(0, 2);
    let pts: Vec[];
    if (kind === 0) {
      pts = rectPoints(
        rng.range(0, size - 300),
        rng.range(0, size - 300),
        rng.range(20, 300),
        rng.range(20, 300),
      );
    } else if (kind === 1) {
      // Sommets sur une grille grossière : alignements avec l'observateur fréquents.
      const cx = Math.round(rng.range(200, size - 200) / 10) * 10;
      const cy = Math.round(rng.range(200, size - 200) / 10) * 10;
      pts = randomStarPolygon(rng, cx, cy, 30, 180, rng.int(3, 16)).map((p) => ({
        x: Math.round(p.x / 10) * 10,
        y: Math.round(p.y / 10) * 10,
      }));
    } else {
      pts = randomStarPolygon(
        rng,
        rng.range(200, size - 200),
        rng.range(200, size - 200),
        20,
        190,
        rng.int(3, 40),
      );
    }
    // Retire les sommets consécutifs confondus (arrondi à la grille).
    pts = pts.filter((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      return p.x !== q.x || p.y !== q.y;
    });
    if (pts.length < 3) continue;
    rings.push(pts);
    const walls = ringWalls(`r${r}`, pts, 'wall').map((s, i) => {
      // Presque soudés : l'extrémité b décalée de moins de `jitter` (sous la tolérance).
      const b =
        jitter > 0
          ? { x: s.b.x + rng.range(-jitter, jitter), y: s.b.y + rng.range(-jitter, jitter) }
          : s.b;
      return rng.chance(0.15)
        ? { ...s, b, kind: 'door' as const, open: false, id: `${s.id}-${i}` }
        : { ...s, b };
    });
    segments.push(...walls);
  }
  // Segments parasites (croisent éventuellement les anneaux).
  segments.push(...randomSegments(rng, rng.int(0, 10), size));
  return { rings, segments };
}

/** Distance d'un point au contour d'un polygone. */
function ringDist(p: Vec, pts: readonly Vec[]) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++)
    best = Math.min(best, distToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!));
  return best;
}

/** Points à tester autour d'un anneau : dans sa boîte, et sur les rayons par ses sommets. */
function ringProbes(rng: Prng, o: Vec, pts: readonly Vec[], n: number): Vec[] {
  const out: Vec[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (let k = 0; k < n; k++) out.push({ x: rng.range(minX, maxX), y: rng.range(minY, maxY) });
  for (const v of pts) {
    for (const t of [1 + 1e-9, 1 + 1e-6, 1.001, 1.05, 1.3, 2]) {
      out.push({ x: o.x + t * (v.x - o.x), y: o.y + t * (v.y - o.y) });
    }
  }
  return out;
}

describe('aucune fuite entre murs soudés', { timeout: 60_000 }, () => {
  for (const [label, jitter, seed] of [
    ['soudés exactement', 0, 5],
    ['presque soudés (écarts < 0,2 px)', 0.2, 6],
  ] as const) {
    it(`1 000 scènes de polygones fermés, ${label}`, () => {
      const rng = new Prng(seed);
      const size = 1000;
      const leaks: string[] = [];
      let checked = 0;
      for (let i = 0; i < 1000; i++) {
        const { rings, segments } = ringScene(rng, size, jitter);
        const prep = prepareScene({ bounds: { width: size, height: size }, segments });
        const margin = jitter > 0 ? 1 : 1e-6;
        for (let v = 0; v < 2; v++) {
          // Observateur dehors (de tous les anneaux) ou dedans (d'un seul).
          const o = { x: rng.range(1, size - 1), y: rng.range(1, size - 1) };
          const containing = rings.filter((r) => pointInPolygon(o, r));
          if (rings.some((r) => ringDist(o, r) < 1)) continue;
          const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
          for (const ring of rings) {
            const oInside = containing.includes(ring);
            for (const p of ringProbes(rng, o, ring, 40)) {
              if (p.x <= 0 || p.y <= 0 || p.x >= size || p.y >= size) continue;
              if (ringDist(p, ring) <= margin) continue;
              // O et P de part et d'autre du contour fermé : jamais vu.
              if (pointInPolygon(p, ring) === oInside) continue;
              checked++;
              if (view.contains(p)) leaks.push(`scène ${i} O=(${o.x}, ${o.y}) P=(${p.x}, ${p.y})`);
            }
          }
        }
      }
      expect(leaks.slice(0, 5).join('\n')).toBe('');
      expect(checked).toBeGreaterThan(20_000);
    });
  }

  it('grille de salles adjacentes (murs partagés, jonctions en T non découpées)', () => {
    const rng = new Prng(7);
    const leaks: string[] = [];
    for (let i = 0; i < 200; i++) {
      const n = rng.int(2, 6);
      const cell = 600 / n;
      const segments: Segment[] = [];
      // Longs murs de bout en bout : les croisements ne sont pas découpés dans les données.
      for (let k = 0; k <= n; k++) {
        segments.push({
          id: `h${k}`,
          a: { x: 100, y: 100 + k * cell },
          b: { x: 700, y: 100 + k * cell },
          kind: 'wall',
        });
        segments.push({
          id: `v${k}`,
          a: { x: 100 + k * cell, y: 100 },
          b: { x: 100 + k * cell, y: 700 },
          kind: 'wall',
        });
      }
      const prep = prepareScene({ bounds: { width: 800, height: 800 }, segments });
      const cx = rng.int(0, n - 1);
      const cy = rng.int(0, n - 1);
      const o = {
        x: 100 + (cx + rng.range(0.05, 0.95)) * cell,
        y: 100 + (cy + rng.range(0.05, 0.95)) * cell,
      };
      const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
      const corners: Vec[] = [];
      for (let a = 0; a <= n; a++)
        for (let b = 0; b <= n; b++) corners.push({ x: 100 + a * cell, y: 100 + b * cell });
      const probes = [
        ...corners.flatMap((c) =>
          [1.0001, 1.01, 1.5].map((t) => ({ x: o.x + t * (c.x - o.x), y: o.y + t * (c.y - o.y) })),
        ),
      ];
      for (let k = 0; k < 100; k++) probes.push({ x: rng.range(1, 799), y: rng.range(1, 799) });
      for (const p of probes) {
        if (p.x <= 0 || p.y <= 0 || p.x >= 800 || p.y >= 800) continue;
        const px = (p.x - 100) / cell;
        const py = (p.y - 100) / cell;
        // Hors de la cellule de l'observateur (et pas sur une ligne de la grille).
        const sameCell = Math.floor(px) === cx && Math.floor(py) === cy && px >= 0 && py >= 0;
        const onLine = Math.abs(px - Math.round(px)) < 1e-6 || Math.abs(py - Math.round(py)) < 1e-6;
        if (sameCell || onLine) continue;
        if (view.contains(p)) leaks.push(`scène ${i} O=(${o.x}, ${o.y}) P=(${p.x}, ${p.y})`);
      }
    }
    expect(leaks.slice(0, 5).join('\n')).toBe('');
  });
});

describe('portée et pièces composées', { timeout: 60_000 }, () => {
  it('300 scènes : brouillard, lumières, rayon de vision et pièces', () => {
    const rng = new Prng(8);
    const size = 600;
    const errors: string[] = [];
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const segments = randomSegments(rng, rng.int(0, 20), size);
      const lights: Light[] = [];
      for (let k = rng.int(0, 4); k > 0; k--) {
        lights.push({
          id: `L${k}`,
          pos: { x: rng.range(10, size - 10), y: rng.range(10, size - 10) },
          radius: rng.range(30, 200),
          on: rng.chance(0.8),
        });
      }
      const rooms: Room[] = [];
      for (let k = rng.int(0, 3); k > 0; k--) {
        rooms.push({
          id: `R${k}`,
          points: rectPoints(
            rng.range(0, size - 200),
            rng.range(0, size - 200),
            rng.range(40, 200),
            rng.range(40, 200),
          ),
        });
      }
      const scene: VisionScene = {
        bounds: { width: size, height: size },
        segments,
        lights,
        rooms,
        fogFull: rng.chance(0.7),
      };
      const prep = prepareScene(scene, { snap: 0 });
      const closed = prep.rooms.filter((r) => r.closed).map((r) => r.room);
      const viewers = [0, 1].map((k) => ({
        id: `o${k}`,
        pos: { x: rng.range(5, size - 5), y: rng.range(5, size - 5) },
        visionRadius: rng.range(0, 120),
      }));
      const view = playerView(prep, viewers);
      const tol = 1e-3;
      const innermost = (p: Vec) => {
        let best: Room | null = null;
        let area = Infinity;
        for (const r of closed) {
          if (!pointInPolygon(p, r.points)) continue;
          const [a, , c] = r.points;
          const ar = Math.abs((c!.x - a!.x) * (c!.y - a!.y));
          if (ar < area) {
            area = ar;
            best = r;
          }
        }
        return best;
      };
      for (let k = 0; k < 60; k++) {
        const p = { x: rng.range(0, size), y: rng.range(0, size) };
        const sources = [...viewers.map((v) => v.pos), ...lights.map((l) => l.pos)];
        if (sources.some((s) => ambiguous(segments, s, p, tol))) continue;
        if (
          rooms.some(
            (r) =>
              ringDist(p, r.points) < tol || viewers.some((v) => ringDist(v.pos, r.points) < tol),
          )
        )
          continue;
        if (
          viewers.some(
            (v) => Math.abs(Math.hypot(p.x - v.pos.x, p.y - v.pos.y) - v.visionRadius) < tol,
          )
        )
          continue;
        if (lights.some((l) => Math.abs(Math.hypot(p.x - l.pos.x, p.y - l.pos.y) - l.radius) < tol))
          continue;
        const lit = lights.some(
          (l) =>
            l.on &&
            Math.hypot(p.x - l.pos.x, p.y - l.pos.y) <= l.radius &&
            naiveVisible(segments, l.pos, p),
        );
        const expected = viewers.some((v) => {
          const inRange =
            !scene.fogFull || Math.hypot(p.x - v.pos.x, p.y - v.pos.y) <= v.visionRadius || lit;
          const r = innermost(v.pos);
          const roomOk =
            (r === null || pointInPolygon(p, r.points)) &&
            closed.every((c) => !pointInPolygon(p, c.points) || pointInPolygon(v.pos, c.points));
          return inRange && roomOk && naiveVisible(segments, v.pos, p);
        });
        checked++;
        if (view.contains(p) !== expected)
          errors.push(`scène ${i} P=(${p.x}, ${p.y}) attendu ${expected}`);
      }
    }
    expect(errors.slice(0, 5).join('\n')).toBe('');
    expect(checked).toBeGreaterThan(10_000);
  });

  it('300 aires de lumière (polygone coupé au disque) contre la référence', () => {
    const rng = new Prng(9);
    const size = 600;
    const errors: string[] = [];
    for (let i = 0; i < 300; i++) {
      const segments = randomSegments(rng, rng.int(0, 25), size);
      const light: Light = {
        id: 'L',
        pos: { x: rng.range(5, size - 5), y: rng.range(5, size - 5) },
        radius: rng.range(20, 250),
        on: true,
      };
      if (segments.some((s) => distToSegment(light.pos, s.a, s.b) < 0.01)) continue;
      const prep = prepareScene(
        { bounds: { width: size, height: size }, segments, lights: [light] },
        { snap: 0 },
      );
      const area = lightArea(prep, light);
      for (let k = 0; k < 60; k++) {
        const p = {
          x: light.pos.x + rng.range(-light.radius, light.radius),
          y: light.pos.y + rng.range(-light.radius, light.radius),
        };
        if (p.x <= 0 || p.y <= 0 || p.x >= size || p.y >= size) continue;
        const d = Math.hypot(p.x - light.pos.x, p.y - light.pos.y);
        // Arcs discrétisés à 0,25 px près.
        if (Math.abs(d - light.radius) < 0.5 || ambiguous(segments, light.pos, p, 0.01)) continue;
        const expected = d < light.radius && naiveVisible(segments, light.pos, p);
        if (pointInPolygon(p, area.polygon) !== expected)
          errors.push(`lumière ${i} P=(${p.x}, ${p.y}) attendu ${expected}`);
      }
    }
    expect(errors.slice(0, 5).join('\n')).toBe('');
  });
});

describe('sens unique : référence cohérente', () => {
  it('la référence naïve applique la même convention', () => {
    const s: Segment = {
      id: 's',
      a: { x: 0, y: 0 },
      b: { x: 0, y: 10 },
      kind: 'one_way',
      blocksFrom: 'left',
    };
    expect(blocks(s, { x: 5, y: 5 })).toBe(true);
    expect(blocks(s, { x: -5, y: 5 })).toBe(false);
  });
});
