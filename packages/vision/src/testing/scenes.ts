/** Générateurs de scènes pour les tests et les mesures. */
import type { FogZone, Light, Room, Segment, Vec, VisionScene } from '../types.js';
import type { Prng } from './prng.js';

/** Quatre murs soudés autour du rectangle (sens horaire à l'écran). */
export function boxWalls(id: string, x: number, y: number, w: number, h: number): Segment[] {
  const p = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  return p.map((a, i) => ({ id: `${id}-${i}`, a, b: p[(i + 1) % 4]!, kind: 'wall' as const }));
}

export function rectPoints(x: number, y: number, w: number, h: number): Vec[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** Polygone étoilé aléatoire (sommets en ordre angulaire autour du centre). */
export function randomStarPolygon(
  rng: Prng,
  cx: number,
  cy: number,
  rMin: number,
  rMax: number,
  n: number,
): Vec[] {
  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push(rng.range(0, 2 * Math.PI));
  angles.sort((a, b) => a - b);
  return angles.map((a) => {
    const r = rng.range(rMin, rMax);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

/** Segments soudés le long d'un polygone fermé. */
export function ringWalls(
  id: string,
  pts: readonly Vec[],
  kind: Segment['kind'] = 'wall',
): Segment[] {
  return pts.map((a, i) => ({ id: `${id}-${i}`, a, b: pts[(i + 1) % pts.length]!, kind }));
}

/** Segments aléatoires de toutes sortes, coordonnées réelles. */
export function randomSegments(rng: Prng, n: number, size: number): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const a = { x: rng.range(0, size), y: rng.range(0, size) };
    const len = rng.chance(0.3) ? rng.range(size * 0.3, size) : rng.range(size * 0.02, size * 0.25);
    const ang = rng.range(0, 2 * Math.PI);
    const b = { x: a.x + len * Math.cos(ang), y: a.y + len * Math.sin(ang) };
    out.push(randomKind(rng, `s${i}`, a, b));
  }
  return out;
}

/**
 * Segments sur une grille entière grossière : colinéarités, sommets pile sur un rayon, jonctions
 * en T, recouvrements, doublons et segments nuls en quantité.
 */
export function latticeSegments(rng: Prng, n: number, cells: number, step: number): Segment[] {
  const out: Segment[] = [];
  const pt = () => ({ x: rng.int(0, cells) * step, y: rng.int(0, cells) * step });
  for (let i = 0; i < n; i++) {
    const a = pt();
    let b: Vec;
    const mode = rng.int(0, 4);
    if (mode === 0) b = { x: a.x, y: rng.int(0, cells) * step };
    else if (mode === 1) b = { x: rng.int(0, cells) * step, y: a.y };
    else if (mode === 2) {
      const k = rng.int(-4, 4) * step;
      b = { x: a.x + k, y: a.y + k };
    } else if (mode === 3 && out.length > 0) {
      // Doublon, éventuellement inversé.
      const s = rng.pick(out);
      out.push(rng.chance(0.5) ? { ...s, id: `d${i}` } : { ...s, id: `d${i}`, a: s.b, b: s.a });
      continue;
    } else b = pt();
    out.push(randomKind(rng, `l${i}`, a, b));
  }
  return out;
}

function randomKind(rng: Prng, id: string, a: Vec, b: Vec): Segment {
  const r = rng.next();
  if (r < 0.6) return { id, a, b, kind: 'wall' };
  if (r < 0.7) return { id, a, b, kind: 'door', open: rng.chance(0.5) };
  if (r < 0.75) return { id, a, b, kind: 'window' };
  if (r < 0.9) return { id, a, b, kind: 'one_way', blocksFrom: rng.chance(0.5) ? 'left' : 'right' };
  return { id, a, b, kind: 'wall', opacity: 0.5 };
}

/**
 * Donjon réaliste : grille de salles murées, portes (ouvertes ou fermées) au milieu des murs,
 * piliers, pièces, brouillard et lumières. Exactement `target` segments (piliers ajoutés au
 * besoin).
 */
export function dungeon(rng: Prng, target = 2000): VisionScene {
  // Chaque salle apporte ~7,4 segments (murs coupés par des portes, piliers).
  const side = Math.max(2, Math.floor(Math.sqrt(target / 7.4)));
  const cell = 300;
  const size = side * cell;
  const segments: Segment[] = [];
  const rooms: Room[] = [];
  let n = 0;
  const wall = (a: Vec, b: Vec) => segments.push({ id: `w${n++}`, a, b, kind: 'wall' });
  // Murs horizontaux et verticaux de la grille, la plupart coupés par une porte.
  for (let i = 0; i <= side; i++) {
    for (let j = 0; j < side; j++) {
      for (const horizontal of [true, false]) {
        const p = (t: number): Vec =>
          horizontal ? { x: j * cell + t, y: i * cell } : { x: i * cell, y: j * cell + t };
        if (i === 0 || i === side || rng.chance(0.25)) {
          wall(p(0), p(cell));
        } else {
          const d0 = rng.range(80, 180);
          const d1 = d0 + rng.range(30, 60);
          wall(p(0), p(d0));
          segments.push({ id: `d${n++}`, a: p(d0), b: p(d1), kind: 'door', open: rng.chance(0.5) });
          wall(p(d1), p(cell));
        }
      }
    }
  }
  const pillar = (i: number, j: number) => {
    const px = i * cell + rng.range(30, 240);
    const py = j * cell + rng.range(30, 240);
    const w = rng.range(15, 40);
    for (const s of boxWalls(`p${n++}`, px, py, w, w)) segments.push(s);
  };
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      if (rng.chance(0.6)) pillar(i, j);
      if (rng.chance(0.3))
        rooms.push({ id: `r${i}-${j}`, points: rectPoints(i * cell, j * cell, cell, cell) });
    }
  }
  while (segments.length < target) pillar(rng.int(0, side - 1), rng.int(0, side - 1));
  segments.length = target;
  const fogZones: FogZone[] = [];
  for (let k = 0; k < 20; k++) {
    fogZones.push(
      rng.chance(0.5)
        ? {
            id: `f${k}`,
            mode: 'clear',
            shape: 'circle',
            center: { x: rng.range(0, size), y: rng.range(0, size) },
            radius: rng.range(100, 400),
          }
        : {
            id: `f${k}`,
            mode: rng.chance(0.5) ? 'clear' : 'fog',
            shape: 'polygon',
            points: randomStarPolygon(rng, rng.range(0, size), rng.range(0, size), 100, 300, 40),
          },
    );
  }
  const lights: Light[] = [];
  for (let k = 0; k < 20; k++) {
    lights.push({
      id: `L${k}`,
      pos: { x: rng.range(20, size - 20), y: rng.range(20, size - 20) },
      radius: rng.range(100, 400),
      on: rng.chance(0.8),
    });
  }
  return {
    bounds: { width: size, height: size },
    segments,
    rooms,
    fogFull: true,
    fogZones,
    lights,
  };
}
