import { describe, expect, it } from 'vitest';
import {
  charactersReach,
  distanceToRotatedRect,
  objectGeometry,
  preferredSearcher,
  type ObjectShape,
} from './reach';

/**
 * Référence : ce que calcule le serveur, pas à pas.
 * `ST_Rotate(ST_MakeEnvelope(x, y, x + w, y + h), radians(r), cx, cy)` est
 * `ST_Affine(cos, −sin, sin, cos, cx − cx·cos + cy·sin, cy − cx·sin − cy·cos)`, puis
 * `ST_Distance(point, polygone)` : nulle dedans, sinon la distance au bord le plus proche.
 */
function serverDistance(p: { x: number; y: number }, o: ObjectShape): number {
  const r = (o.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const cx = o.pos.x + o.width / 2;
  const cy = o.pos.y + o.height / 2;
  const xoff = cx - cx * cos + cy * sin;
  const yoff = cy - cx * sin - cy * cos;
  const ring = [
    [o.pos.x, o.pos.y],
    [o.pos.x + o.width, o.pos.y],
    [o.pos.x + o.width, o.pos.y + o.height],
    [o.pos.x, o.pos.y + o.height],
  ].map(([x, y]) => ({ x: cos * x! - sin * y! + xoff, y: sin * x! + cos * y! + yoff }));
  // Point dans le polygone (pair-impair)
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  if (inside) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % 4]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

const chest = (extra: Partial<ObjectShape> = {}): ObjectShape => ({
  pos: { x: 100, y: 100 },
  width: 100,
  height: 50,
  rotation: 0,
  ...extra,
});

describe('portée de la fouille', () => {
  it('distance au rectangle droit : nulle dedans, au bord ou au coin dehors', () => {
    const g = objectGeometry(chest());
    expect(g).toEqual({ x: 150, y: 125, width: 100, height: 50, rotation: 0 });
    expect(distanceToRotatedRect({ x: 150, y: 125 }, g)).toBe(0);
    expect(distanceToRotatedRect({ x: 100, y: 100 }, g)).toBe(0);
    expect(distanceToRotatedRect({ x: 250, y: 125 }, g)).toBeCloseTo(50);
    expect(distanceToRotatedRect({ x: 230, y: 190 }, g)).toBeCloseTo(50);
  });

  it('tourné de 90° autour de son centre, comme ST_Rotate', () => {
    // 100 × 50 debout : il occupe x ∈ [125, 175], y ∈ [75, 175]
    const g = objectGeometry(chest({ rotation: 90 }));
    expect(distanceToRotatedRect({ x: 150, y: 80 }, g)).toBe(0);
    expect(distanceToRotatedRect({ x: 110, y: 125 }, g)).toBeCloseTo(15);
    expect(distanceToRotatedRect({ x: 150, y: 60 }, g)).toBeCloseTo(15);
  });

  it('identique au calcul du serveur, rotations quelconques (sens de l’écran)', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 500; i++) {
      const o = chest({
        pos: { x: rand() * 800, y: rand() * 800 },
        width: 10 + rand() * 300,
        height: 10 + rand() * 300,
        rotation: rand() * 720 - 360,
      });
      const p = { x: rand() * 1200 - 100, y: rand() * 1200 - 100 };
      expect(distanceToRotatedRect(p, objectGeometry(o))).toBeCloseTo(serverDistance(p, o), 6);
    }
  });

  it('le sens de rotation est celui de l’écran (y vers le bas), pas l’inverse', () => {
    // Barre de 200 × 10 tournée de 45° : son bout « droit » descend vers la droite
    const o = chest({ pos: { x: 0, y: 95 }, width: 200, height: 10, rotation: 45 });
    const g = objectGeometry(o);
    const tip = { x: 100 + 100 * Math.SQRT1_2, y: 100 + 100 * Math.SQRT1_2 };
    expect(distanceToRotatedRect(tip, g)).toBeLessThan(1);
    const mirror = { x: 100 + 100 * Math.SQRT1_2, y: 100 - 100 * Math.SQRT1_2 };
    expect(distanceToRotatedRect(mirror, g)).toBeGreaterThan(50);
    expect(serverDistance(tip, o)).toBeLessThan(1);
  });

  it('personnages à portée : les miens, présents, triés, portée × pixelsPerUnit', () => {
    const o = { ...chest(), searchRadius: 1.5 }; // 75 px pour 50 px par case
    const tokens = [
      { characterId: 'aldric', pos: { x: 150, y: 215 } }, // 65 px sous le bord : à portée
      { characterId: 'bree', pos: { x: 400, y: 125 } }, // 200 px : trop loin
      { characterId: 'pnj', pos: { x: 150, y: 125 } }, // pas à moi
      { characterId: 'caia', pos: null }, // sans position
    ];
    const reach = charactersReach(o, tokens, ['bree', 'aldric', 'caia'], 50);
    expect(reach.map((r) => [r.characterId, r.inRange])).toEqual([
      ['aldric', true],
      ['bree', false],
    ]);
    expect(reach[0]!.distance).toBeCloseTo(65);
    // Portée exacte : à la limite, c'est encore à portée (le serveur refuse au-delà)
    const limit = charactersReach(o, [{ characterId: 'a', pos: { x: 275, y: 125 } }], ['a'], 50);
    expect(limit[0]!.inRange).toBe(true);
  });

  it('personnage proposé : celui que j’incarne s’il est à portée, sinon le plus proche', () => {
    const reach = [
      { characterId: 'b', distance: 10, inRange: true },
      { characterId: 'a', distance: 40, inRange: true },
      { characterId: 'c', distance: 400, inRange: false },
    ];
    expect(preferredSearcher(reach, ['a', 'b'])).toBe('a');
    expect(preferredSearcher(reach, ['c', 'a'])).toBe('b');
    expect(preferredSearcher([reach[2]!], ['c'])).toBeNull();
  });
});
