/**
 * Budgets du § 9 (docs/carte.md), sur un donjon réaliste de 2 000 segments (salles, portes,
 * piliers, pièces, 20 zones de brouillard, 20 lumières) :
 * - prepareScene < 5 ms ;
 * - visibilityPolygon < 1,5 ms ;
 * - 10 000 `contains` < 5 ms (vue d'un joueur à 3 observateurs, brouillard, lumières, pièces).
 * Plus, à titre indicatif, 2 000 segments courts jetés au hasard (fouillis sans structure, qui se
 * croisent) sur une carte de 4 000 px.
 */
import { bench, describe } from 'vitest';
import { playerView, prepareScene, visibilityPolygon, type VisionScene } from './index.js';
import { Prng } from './testing/prng.js';
import { dungeon } from './testing/scenes.js';

const rng = new Prng(42);
const scene = dungeon(rng, 2000);
const prep = prepareScene(scene);
const size = scene.bounds.width;

const origins: { x: number; y: number }[] = [];
for (let k = 0; k < 64; k++) origins.push({ x: rng.range(1, size - 1), y: rng.range(1, size - 1) });
let next = 0;

const view = playerView(
  prep,
  [0, 1, 2].map((k) => ({
    id: `o${k}`,
    pos: { x: size / 2 + (k - 1) * 150 + 17, y: size / 2 + 23 },
    visionRadius: 200,
  })),
);
const points = new Float64Array(20_000);
for (let k = 0; k < points.length; k++) points[k] = rng.range(0, size);

const chaosRng = new Prng(7);
const chaos: VisionScene = {
  bounds: { width: 4000, height: 4000 },
  segments: Array.from({ length: 2000 }, (_, i) => {
    const a = { x: chaosRng.range(0, 4000), y: chaosRng.range(0, 4000) };
    const len = chaosRng.range(20, 200);
    const t = chaosRng.range(0, 2 * Math.PI);
    const b = { x: a.x + len * Math.cos(t), y: a.y + len * Math.sin(t) };
    return { id: `c${i}`, a, b, kind: 'wall' as const };
  }),
};
const chaosPrep = prepareScene(chaos);

console.log(
  `donjon : ${scene.segments.length} segments (${prep.segmentCount} après découpe), ` +
    `${scene.rooms?.length} pièces ; fouillis : ${chaos.segments.length} segments ` +
    `(${chaosPrep.segmentCount} après découpe)`,
);

describe('prepareScene', () => {
  bench('donjon, 2 000 segments (budget 5 ms)', () => {
    prepareScene(scene);
  });
  bench('fouillis, 2 000 segments courts (indicatif)', () => {
    prepareScene(chaos);
  });
});

describe('visibilityPolygon', () => {
  bench('donjon, 2 000 segments (budget 1,5 ms)', () => {
    visibilityPolygon(prep, origins[next++ & 63]!);
  });
  bench('fouillis, 2 000 segments courts (indicatif)', () => {
    visibilityPolygon(chaosPrep, origins[next++ & 63]!);
  });
  bench('lumière de rayon 300 (maxRadius)', () => {
    visibilityPolygon(prep, origins[next++ & 63]!, { maxRadius: 300 });
  });
});

describe('contains', () => {
  bench('10 000 requêtes, joueur à 3 observateurs (budget 5 ms)', () => {
    let seen = 0;
    for (let k = 0; k < 20_000; k += 2) if (view.containsXY(points[k]!, points[k + 1]!)) seen++;
    if (seen < 0) throw new Error();
  });
});
