/**
 * Formes des dés, générées en code (aucun modèle à charger) : vrais polyèdres (d4 tétraèdre,
 * d10 trapézoèdre pentagonal…), arêtes et coins arrondis, chiffres posés dans un atlas.
 *
 * Arrondi : somme de Minkowski du polyèdre rétréci et d'une sphère de rayon `r`. Chaque face
 * est la face rétrécie poussée de `r` sur sa normale (plate), chaque arête un quart de cylindre
 * (normales interpolées entre les deux faces), chaque coin un morceau de sphère. Le résultat est
 * exactement convexe et lisse, sans aucune couture.
 *
 * Deux jeux d'UV :
 * - `uv` : projection plane par triangle, comme avant (skins à texture : un motif par face) ;
 * - `uv1` : la cellule de la face dans l'atlas des chiffres (`label-atlas.ts`), un texel
 *   vierge sur les arrondis. La gravure (carte de normales) et l'encre lisent `uv1`.
 *
 * Lecture du résultat : la face dont la normale monte le plus ; pour le d4, le coin le plus haut
 * (chiffre au sommet, comme un vrai d4).
 */
import * as THREE from 'three';

export const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const;
export type DieType = (typeof DIE_TYPES)[number];

/** Une face du dé : sa normale (repère du dé), son centre, sa valeur. */
export interface DieFace {
  norm: THREE.Vector3;
  pos: THREE.Vector3;
  value: string;
  /** d4 : valeurs des coins de la face, dans l'ordre du polygone. */
  cornerValues?: string[];
}

/** Placement d'une face dans l'atlas : polygone en coordonnées de cellule (0 à 1). */
export interface AtlasFace {
  /** Index de la cellule dans la grille de l'atlas (la cellule 0 reste vierge). */
  cell: number;
  /** Sommets du polygone de la face dans la cellule, haut du chiffre vers +y. */
  polygon: [number, number][];
  value: string;
  /** d4 : un chiffre par coin, chacun tourné vers son coin. */
  cornerValues?: string[];
}

export interface DieShape {
  type: DieType;
  geometry: THREE.BufferGeometry;
  /** Enveloppe convexe pour la physique (polyèdre non arrondi, triangulé). */
  hull: { vertices: number[][]; faces: number[][] };
  faces: DieFace[];
  /** d4 : direction de chaque coin et son chiffre (lecture au sommet). */
  corners?: { dir: THREE.Vector3; value: string }[];
  atlas: { grid: number; faces: AtlasFace[]; faceSize: number };
}

// ─── Polyèdres de base ───────────────────────────────────────────────────────

type V3 = [number, number, number];
const PHI = (1 + Math.sqrt(5)) / 2;

const tetra = (): { v: V3[]; f: number[][] } => ({
  v: [
    [1, 1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, -1, -1],
  ],
  f: [
    [0, 1, 2],
    [0, 3, 1],
    [0, 2, 3],
    [1, 3, 2],
  ],
});

const cube = (): { v: V3[]; f: number[][] } => {
  const v: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  const idx = (x: number, y: number, z: number) =>
    ((x + 1) / 2) * 4 + ((y + 1) / 2) * 2 + (z + 1) / 2;
  return {
    v,
    f: [
      [idx(1, -1, -1), idx(1, 1, -1), idx(1, 1, 1), idx(1, -1, 1)],
      [idx(-1, -1, 1), idx(-1, 1, 1), idx(-1, 1, -1), idx(-1, -1, -1)],
      [idx(-1, 1, -1), idx(-1, 1, 1), idx(1, 1, 1), idx(1, 1, -1)],
      [idx(-1, -1, 1), idx(-1, -1, -1), idx(1, -1, -1), idx(1, -1, 1)],
      [idx(-1, -1, 1), idx(1, -1, 1), idx(1, 1, 1), idx(-1, 1, 1)],
      [idx(1, -1, -1), idx(-1, -1, -1), idx(-1, 1, -1), idx(1, 1, -1)],
    ],
  };
};

const octa = (): { v: V3[]; f: number[][] } => ({
  v: [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ],
  f: [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [2, 0, 5],
    [1, 2, 5],
    [3, 1, 5],
    [0, 3, 5],
  ],
});

/** Faces d'un polyèdre convexe dont on ne connaît que les sommets (enveloppe, petits cas). */
function hullFaces(v: V3[]): number[][] {
  const P = v.map((p) => new THREE.Vector3(...p));
  const planes: { n: THREE.Vector3; d: number; ids: number[] }[] = [];
  const eps = 1e-6;
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++)
      for (let k = j + 1; k < P.length; k++) {
        const n = new THREE.Vector3()
          .subVectors(P[j]!, P[i]!)
          .cross(new THREE.Vector3().subVectors(P[k]!, P[i]!));
        if (n.lengthSq() < eps) continue;
        n.normalize();
        let d = n.dot(P[i]!);
        if (d < 0) {
          n.negate();
          d = -d;
        }
        if (P.some((p) => n.dot(p) > d + 1e-5)) continue;
        if (planes.some((pl) => pl.n.dot(n) > 1 - 1e-6)) continue;
        const ids = P.map((p, idx) => (Math.abs(n.dot(p) - d) < 1e-5 ? idx : -1)).filter(
          (x) => x >= 0,
        );
        planes.push({ n, d, ids });
      }
  // Sommets de chaque face rangés dans le sens direct vu de l'extérieur
  return planes.map(({ n, ids }) => {
    const c = ids.reduce((s, i) => s.add(P[i]!), new THREE.Vector3()).divideScalar(ids.length);
    const t = new THREE.Vector3().subVectors(P[ids[0]!]!, c).normalize();
    const b = new THREE.Vector3().crossVectors(n, t);
    return [...ids].sort((a, bb) => {
      const pa = new THREE.Vector3().subVectors(P[a]!, c);
      const pb = new THREE.Vector3().subVectors(P[bb]!, c);
      return Math.atan2(pa.dot(b), pa.dot(t)) - Math.atan2(pb.dot(b), pb.dot(t));
    });
  });
}

const dodeca = () => {
  const v: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  for (const a of [-1, 1])
    for (const b of [-1, 1]) {
      v.push([0, a / PHI, b * PHI]);
      v.push([a / PHI, b * PHI, 0]);
      v.push([a * PHI, 0, b / PHI]);
    }
  return { v, f: hullFaces(v) };
};

const icosa = () => {
  const v: V3[] = [];
  for (const a of [-1, 1])
    for (const b of [-1, 1]) {
      v.push([0, a, b * PHI]);
      v.push([a, b * PHI, 0]);
      v.push([a * PHI, 0, b]);
    }
  return { v, f: hullFaces(v) };
};

/**
 * d10 : trapézoèdre pentagonal. Deux pôles, deux couronnes de 5 sommets décalées de 36° ; la
 * hauteur des couronnes est cherchée pour que chaque face (cerf-volant) soit plane.
 */
const trapezo = () => {
  const apex = 1.05;
  const ring = (y: number, offset: number): V3[] =>
    Array.from({ length: 5 }, (_, k) => {
      const a = ((k * 72 + offset) * Math.PI) / 180;
      return [Math.cos(a), y, Math.sin(a)] as V3;
    });
  const planarity = (h: number) => {
    const T = new THREE.Vector3(0, apex, 0);
    const [u0, u1] = ring(h, 0);
    const [l0] = ring(-h, 36);
    const U0 = new THREE.Vector3(...u0!);
    const U1 = new THREE.Vector3(...u1!);
    const L0 = new THREE.Vector3(...l0!);
    const n = new THREE.Vector3().subVectors(U0, T).cross(new THREE.Vector3().subVectors(U1, T));
    return n.dot(new THREE.Vector3().subVectors(L0, T));
  };
  let lo = 0.001;
  let hi = apex - 0.001;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(planarity(mid)) === Math.sign(planarity(lo))) lo = mid;
    else hi = mid;
  }
  const h = (lo + hi) / 2;
  const v: V3[] = [[0, apex, 0], [0, -apex, 0], ...ring(h, 0), ...ring(-h, 36)];
  const U = (k: number) => 2 + (k % 5);
  const L = (k: number) => 7 + (k % 5);
  const f: number[][] = [];
  for (let k = 0; k < 5; k++) {
    f.push([0, U(k + 1), L(k), U(k)]);
    f.push([1, L(k), U(k + 1), L(k + 1)]);
  }
  return { v, f };
};

// ─── Construction ────────────────────────────────────────────────────────────

interface Spec {
  base: () => { v: V3[]; f: number[][] };
  /** Rayon de la sphère circonscrite du dé fini (unités de la scène). */
  size: number;
  /** Rayon de l'arrondi, en part de `size`. */
  round: number;
}

const SPECS: Record<DieType, Spec> = {
  d4: { base: tetra, size: 2.05, round: 0.1 },
  d6: { base: cube, size: 1.9, round: 0.11 },
  d8: { base: octa, size: 1.85, round: 0.09 },
  d10: { base: trapezo, size: 1.85, round: 0.08 },
  d12: { base: dodeca, size: 1.85, round: 0.07 },
  d20: { base: icosa, size: 1.85, round: 0.06 },
};

/** Segments d'un arrondi d'arête (et rangées d'un coin). */
const SEGMENTS = 4;

const slerp = (a: THREE.Vector3, b: THREE.Vector3, t: number) => {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const theta = Math.acos(dot) * t;
  const rel = new THREE.Vector3().copy(b).addScaledVector(a, -dot);
  if (rel.lengthSq() < 1e-12) return a.clone();
  rel.normalize();
  return a
    .clone()
    .multiplyScalar(Math.cos(theta))
    .addScaledVector(rel, Math.sin(theta))
    .normalize();
};

/**
 * Valeurs des faces : opposées sommant à n + 1 (d6 : 7, d20 : 21…), réparties de façon stable.
 * d10 : 1 à 10, opposées sommant à 11.
 */
function faceValues(normals: THREE.Vector3[]): string[] {
  const n = normals.length;
  const values = new Array<string>(n).fill('');
  const used = new Set<number>();
  // Ordre stable : du plus haut au plus bas, puis par angle autour de l'axe vertical
  const order = normals
    .map((nv, i) => ({ i, y: nv.y, a: Math.atan2(nv.z, nv.x) }))
    .sort((p, q) => q.y - p.y || p.a - q.a)
    .map((x) => x.i);
  let next = 1;
  for (const i of order) {
    if (used.has(i)) continue;
    const opposite = normals.findIndex(
      (m, j) => j !== i && !used.has(j) && m.dot(normals[i]!) < -0.999,
    );
    values[i] = String(n + 1 - next);
    used.add(i);
    if (opposite >= 0) {
      values[opposite] = String(next);
      used.add(opposite);
    }
    next += 1;
  }
  return values;
}

function build(type: DieType): DieShape {
  const spec = SPECS[type];
  const { v, f } = spec.base();
  const raw = v.map((p) => new THREE.Vector3(...p));
  // Mise à l'échelle : sphère circonscrite du dé fini = `size`
  const circum = Math.max(...raw.map((p) => p.length()));
  const scale = spec.size / circum;
  const P = raw.map((p) => p.multiplyScalar(scale));

  // Faces orientées vers l'extérieur
  const faces = f.map((ids) => {
    const c = ids.reduce((s, i) => s.add(P[i]!), new THREE.Vector3()).divideScalar(ids.length);
    const n = new THREE.Vector3()
      .subVectors(P[ids[1]!]!, P[ids[0]!]!)
      .cross(new THREE.Vector3().subVectors(P[ids[2]!]!, P[ids[0]!]!))
      .normalize();
    if (n.dot(c) < 0) {
      ids = [...ids].reverse();
      n.negate();
    }
    return { ids, n, c, d: n.dot(P[ids[0]!]!) };
  });
  const inradius = Math.min(...faces.map((fc) => fc.d));
  const r = spec.size * spec.round;
  // Polyèdre rétréci de r (faces toutes à la même distance du centre : homothétie)
  const k = (inradius - r) / inradius;
  const Q = P.map((p) => p.clone().multiplyScalar(k));

  const positions: number[] = [];
  const normals: number[] = [];
  const uv1: number[] = [];
  const BLANK: [number, number] = [0.5 / 64, 0.5 / 64];

  // Atlas : une cellule par face (la cellule 0 reste vierge), grille carrée
  const grid = Math.ceil(Math.sqrt(faces.length + 1));
  const cellUv = (cell: number, x: number, y: number): [number, number] => {
    const cx = cell % grid;
    const cy = Math.floor(cell / grid);
    return [(cx + x) / grid, 1 - (cy + 1 - y) / grid];
  };

  const push = (p: THREE.Vector3, n: THREE.Vector3, uv: [number, number]) => {
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
    uv1.push(uv[0], uv[1]);
  };

  // ── Faces plates ──
  const values = type === 'd4' ? [] : faceValues(faces.map((fc) => fc.n));
  // Taille commune des faces dans leur cellule (faces congruentes)
  let faceExtent = 0;
  const frames = faces.map((fc) => {
    const pts = fc.ids.map((i) => Q[i]!.clone().addScaledVector(fc.n, r));
    const center = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
    // « Haut » du chiffre : vers un sommet (d10 : le pôle, sommet le plus loin du centre)
    const far = pts.reduce(
      (best, p) => (p.distanceTo(center) > best.distanceTo(center) + 1e-6 ? p : best),
      pts[0]!,
    );
    const up = new THREE.Vector3().subVectors(far, center).normalize();
    const right = new THREE.Vector3().crossVectors(up, fc.n).normalize();
    for (const p of pts) {
      const d = new THREE.Vector3().subVectors(p, center);
      faceExtent = Math.max(faceExtent, Math.abs(d.dot(right)), Math.abs(d.dot(up)));
    }
    return { pts, center, up, right };
  });

  const atlasFaces: AtlasFace[] = [];
  const dieFaces: DieFace[] = [];
  // d4 : chiffre de chaque coin (1 à 4), lu au sommet
  const cornerValue = (vertex: number) => String(vertex + 1);

  faces.forEach((fc, fi) => {
    const { pts, center, up, right } = frames[fi]!;
    const cell = fi + 1;
    const toCell = (p: THREE.Vector3): [number, number] => {
      const d = new THREE.Vector3().subVectors(p, center);
      return [0.5 + (d.dot(right) / faceExtent) * 0.46, 0.5 + (d.dot(up) / faceExtent) * 0.46];
    };
    const centerUv = cellUv(cell, 0.5, 0.5);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const ca = toCell(a);
      const cb = toCell(b);
      push(center, fc.n, centerUv);
      push(a, fc.n, cellUv(cell, ca[0], ca[1]));
      push(b, fc.n, cellUv(cell, cb[0], cb[1]));
    }
    const value = type === 'd4' ? '' : values[fi]!;
    const cornerValues = type === 'd4' ? fc.ids.map(cornerValue) : undefined;
    atlasFaces.push({
      cell,
      polygon: pts.map(toCell),
      value,
      ...(cornerValues ? { cornerValues } : {}),
    });
    dieFaces.push({
      norm: fc.n.clone(),
      pos: center.clone(),
      value,
      ...(cornerValues ? { cornerValues } : {}),
    });
  });

  // ── Arêtes : quart de cylindre entre les normales des deux faces ──
  const edgeFaces = new Map<string, { a: number; b: number; faces: number[] }>();
  faces.forEach((fc, fi) =>
    fc.ids.forEach((a, i) => {
      const b = fc.ids[(i + 1) % fc.ids.length]!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const e = edgeFaces.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), faces: [] };
      e.faces.push(fi);
      edgeFaces.set(key, e);
    }),
  );
  for (const e of edgeFaces.values()) {
    const [f1, f2] = e.faces as [number, number];
    // Sens : l'arête parcourue a → b dans la face f1 (sens direct)
    const ids1 = faces[f1]!.ids;
    const ia = ids1.indexOf(e.a);
    const forward = ids1[(ia + 1) % ids1.length] === e.b;
    const [a, b] = forward ? [e.a, e.b] : [e.b, e.a];
    const n1 = faces[f1]!.n;
    const n2 = faces[f2]!.n;
    for (let s = 0; s < SEGMENTS; s++) {
      const m0 = slerp(n1, n2, s / SEGMENTS);
      const m1 = slerp(n1, n2, (s + 1) / SEGMENTS);
      const A0 = Q[a]!.clone().addScaledVector(m0, r);
      const B0 = Q[b]!.clone().addScaledVector(m0, r);
      const A1 = Q[a]!.clone().addScaledVector(m1, r);
      const B1 = Q[b]!.clone().addScaledVector(m1, r);
      // Quad (B0, A0, A1, B1) vu de l'extérieur
      push(B0, m0, BLANK);
      push(A0, m0, BLANK);
      push(A1, m1, BLANK);
      push(B0, m0, BLANK);
      push(A1, m1, BLANK);
      push(B1, m1, BLANK);
    }
  }

  // ── Coins : morceau de sphère entre les normales des faces qui s'y touchent ──
  const corners: { dir: THREE.Vector3; value: string }[] = [];
  P.forEach((_, vi) => {
    // Faces autour du sommet, dans l'ordre (par leurs arêtes communes)
    const around = faces.map((fc, fi) => ({ fc, fi })).filter(({ fc }) => fc.ids.includes(vi));
    if (!around.length) return;
    const ordered = [around[0]!];
    while (ordered.length < around.length) {
      const last = ordered[ordered.length - 1]!.fc.ids;
      // Face suivante : celle qui partage l'arête (vi, sommet précédent dans `last`)
      const i = last.indexOf(vi);
      const prev = last[(i - 1 + last.length) % last.length]!;
      const nextFace = around.find(
        ({ fc }) => !ordered.some((o) => o.fc === fc) && fc.ids.includes(prev),
      );
      if (!nextFace) break;
      ordered.push(nextFace);
    }
    const ns = ordered.map((o) => o.fc.n);
    const c = ns.reduce((s, n) => s.add(n), new THREE.Vector3()).normalize();
    const origin = Q[vi]!;
    for (let i = 0; i < ns.length; i++) {
      const na = ns[i]!;
      const nb = ns[(i + 1) % ns.length]!;
      for (let s = 0; s < SEGMENTS; s++) {
        const e0 = slerp(na, nb, s / SEGMENTS);
        const e1 = slerp(na, nb, (s + 1) / SEGMENTS);
        for (let ring = 0; ring < SEGMENTS; ring++) {
          const t0 = ring / SEGMENTS;
          const t1 = (ring + 1) / SEGMENTS;
          const p00 = slerp(c, e0, t1);
          const p01 = slerp(c, e1, t1);
          const p10 = slerp(c, e0, t0);
          const p11 = slerp(c, e1, t0);
          const tri = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) => {
            for (const m of [x, y, z]) push(origin.clone().addScaledVector(m, r), m, BLANK);
          };
          if (ring === 0) tri(c, p00, p01);
          else {
            tri(p10, p00, p01);
            tri(p10, p01, p11);
          }
        }
      }
    }
    if (type === 'd4') corners.push({ dir: P[vi]!.clone().normalize(), value: cornerValue(vi) });
  });

  // Triangles des coins et arêtes : orientation vérifiée (normale géométrique vers l'extérieur)
  for (let i = 0; i < positions.length; i += 9) {
    const a = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const b = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    const c = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
    const g = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const n = new THREE.Vector3(normals[i], normals[i + 1], normals[i + 2]);
    if (g.dot(n) < 0) {
      // Échange b et c (positions, normales, uv1)
      for (const [arr, w] of [
        [positions, 3],
        [normals, 3],
      ] as const)
        for (let j = 0; j < w; j++) {
          const bi = i + w + j;
          const ci = i + 2 * w + j;
          [arr[bi], arr[ci]] = [arr[ci]!, arr[bi]!];
        }
      const t = (i / 9) * 6;
      for (let j = 0; j < 2; j++)
        [uv1[t + 2 + j], uv1[t + 4 + j]] = [uv1[t + 4 + j]!, uv1[t + 2 + j]!];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
  geometry.setAttribute('uv', planarUv(positions));
  geometry.computeBoundingSphere();

  // Physique : polyèdre non arrondi, triangulé
  const hullFacesOut: number[][] = [];
  for (const fc of faces)
    for (let i = 1; i < fc.ids.length - 1; i++)
      hullFacesOut.push([fc.ids[0]!, fc.ids[i]!, fc.ids[i + 1]!]);

  return {
    type,
    geometry,
    hull: { vertices: P.map((p) => [p.x, p.y, p.z]), faces: hullFacesOut },
    faces: dieFaces,
    ...(type === 'd4' ? { corners } : {}),
    atlas: { grid, faces: atlasFaces, faceSize: faceExtent },
  };
}

/** UV planes par triangle (skins à texture : un motif par face, comme avant). */
function planarUv(positions: number[]): THREE.BufferAttribute {
  const uv = new Float32Array((positions.length / 3) * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const bt = new THREE.Vector3();
  const up = new THREE.Vector3();
  const d = new THREE.Vector3();
  const s = 1 / 2.2;
  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i);
    b.fromArray(positions, i + 3);
    c.fromArray(positions, i + 6);
    n.subVectors(b, a).cross(d.subVectors(c, a)).normalize();
    up.set(0, 1, 0);
    if (Math.abs(n.dot(up)) > 0.95) up.set(1, 0, 0);
    t.crossVectors(up, n).normalize();
    bt.crossVectors(n, t).normalize();
    for (let k = 0; k < 3; k++) {
      d.fromArray(positions, i + k * 3);
      const j = (i / 3 + k) * 2;
      uv[j] = 0.5 + d.dot(t) * s;
      uv[j + 1] = 0.5 + d.dot(bt) * s;
    }
  }
  return new THREE.BufferAttribute(uv, 2);
}

const cache = new Map<string, DieShape>();

/** Forme d'un dé (construite une fois par type). Type inconnu : d6. */
export function dieShape(type: string): DieShape {
  const t = (DIE_TYPES as readonly string[]).includes(type) ? (type as DieType) : 'd6';
  let s = cache.get(t);
  if (!s) {
    s = build(t);
    cache.set(t, s);
  }
  return s;
}

const _n = new THREE.Vector3();

/** Valeur lue sur un dé posé, d'orientation `q` : face du dessus, ou coin du sommet (d4). */
export function readTop(shape: DieShape, q: THREE.Quaternion): string {
  let best = '';
  let max = -Infinity;
  if (shape.corners) {
    for (const c of shape.corners) {
      const y = _n.copy(c.dir).applyQuaternion(q).y;
      if (y > max) {
        max = y;
        best = c.value;
      }
    }
    return best;
  }
  for (const f of shape.faces) {
    const y = _n.copy(f.norm).applyQuaternion(q).y;
    if (y > max) {
      max = y;
      best = f.value;
    }
  }
  return best;
}
