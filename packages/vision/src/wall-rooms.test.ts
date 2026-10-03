import { describe, expect, it } from 'vitest';
import type { Segment, Vec } from './types.js';
import { detectWallRooms } from './wall-rooms.js';

let n = 0;
const P = (x: number, y: number): Vec => ({ x, y });
const seg = (a: Vec, b: Vec, extra: Partial<Segment> = {}): Segment => ({
  id: `s${n++}`,
  a,
  b,
  kind: 'wall',
  ...extra,
});
/** Contour fermé, un segment par côté. */
const loop = (pts: Vec[], extra: (i: number) => Partial<Segment> = () => ({})) =>
  pts.map((p, i) => seg(p, pts[(i + 1) % pts.length]!, extra(i)));
const square = (x: number, y: number, s: number) => [
  P(x, y),
  P(x + s, y),
  P(x + s, y + s),
  P(x, y + s),
];
const areaOf = (pts: readonly Vec[]) =>
  Math.abs(
    pts.reduce(
      (a, p, i) => a + p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y,
      0,
    ),
  ) / 2;

describe('salles détectées des murs', () => {
  it('une boucle de murs : une salle fermée ; ouverte par une porte ouverte ou une fenêtre', () => {
    const rooms = detectWallRooms(loop(square(0, 0, 100)));
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.closed).toBe(true);
    expect(areaOf(rooms[0]!.points)).toBe(10_000);
    expect(
      detectWallRooms(
        loop(square(0, 0, 100), (i) => (i === 0 ? { kind: 'door', open: true } : {})),
      )[0]!.closed,
    ).toBe(false);
    expect(
      detectWallRooms(
        loop(square(0, 0, 100), (i) => (i === 0 ? { kind: 'door', open: false } : {})),
      )[0]!.closed,
    ).toBe(true);
    expect(
      detectWallRooms(loop(square(0, 0, 100), (i) => (i === 2 ? { kind: 'window' } : {})))[0]!
        .closed,
    ).toBe(false);
  });

  it('trois côtés seulement, ou un mur seul : aucune salle', () => {
    const s = square(0, 0, 100);
    expect(detectWallRooms([seg(s[0]!, s[1]!), seg(s[1]!, s[2]!), seg(s[2]!, s[3]!)])).toEqual([]);
    expect(detectWallRooms([seg(P(0, 0), P(50, 0))])).toEqual([]);
  });

  it('deux salles côte à côte (mur commun), une cloison en T, un mur pendant ignoré', () => {
    const two = [...loop(square(0, 0, 100)), ...loop(square(100, 0, 100))];
    expect(
      detectWallRooms(two)
        .map((r) => areaOf(r.points))
        .sort(),
    ).toEqual([10_000, 10_000]);
    // Cloison du milieu du haut au milieu du bas (jonctions en T sur les murs)
    const t = [...loop(square(0, 0, 100)), seg(P(50, 0), P(50, 100))];
    expect(
      detectWallRooms(t)
        .map((r) => areaOf(r.points))
        .sort(),
    ).toEqual([5_000, 5_000]);
    // Bout de mur qui pend dans la salle : une seule salle
    const dangling = [...loop(square(0, 0, 100)), seg(P(0, 50), P(40, 50))];
    expect(detectWallRooms(dangling)).toHaveLength(1);
  });

  it('salle dans une salle, sommets à une fraction de pixel près soudés', () => {
    const nested = [...loop(square(0, 0, 300)), ...loop(square(100, 100, 50))];
    expect(
      detectWallRooms(nested)
        .map((r) => areaOf(r.points))
        .sort((a, b) => a - b),
    ).toEqual([2_500, 90_000]);
    const sloppy = [
      seg(P(0, 0), P(100, 0)),
      seg(P(100.2, 0.1), P(100, 100)),
      seg(P(100, 100), P(0, 100)),
      seg(P(0, 100), P(0.3, 0)),
    ];
    expect(detectWallRooms(sloppy)).toHaveLength(1);
  });
});
