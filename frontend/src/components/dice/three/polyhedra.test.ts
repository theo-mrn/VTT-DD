import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DIE_TYPES, dieShape, readTop } from './polyhedra';

const FACES = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 } as const;

describe('formes des dés', () => {
  it.each(DIE_TYPES)('%s : nombre de faces, valeurs, opposées qui somment à n + 1', (type) => {
    const s = dieShape(type);
    expect(s.faces).toHaveLength(FACES[type]);
    if (type === 'd4') {
      expect(s.corners!.map((c) => c.value).sort()).toEqual(['1', '2', '3', '4']);
      // Chaque face porte les chiffres de ses trois coins
      for (const f of s.faces) expect(f.cornerValues).toHaveLength(3);
      return;
    }
    const n = FACES[type];
    const values = s.faces.map((f) => Number(f.value)).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    for (const f of s.faces) {
      const opposite = s.faces.find((g) => g.norm.dot(f.norm) < -0.999)!;
      expect(Number(f.value) + Number(opposite.value)).toBe(n + 1);
    }
  });

  it.each(DIE_TYPES)('%s : triangles tournés vers l’extérieur, normales cohérentes', (type) => {
    const g = dieShape(type).geometry;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const geo = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (geo.lengthSq() < 1e-14) continue;
      const centroid = a.clone().add(b).add(c).divideScalar(3);
      expect(geo.dot(centroid)).toBeGreaterThan(0);
      n.fromBufferAttribute(nor, i);
      expect(n.dot(geo.normalize())).toBeGreaterThan(0.2);
    }
  });

  it.each(DIE_TYPES)('%s : taille et enveloppe de la physique', (type) => {
    const s = dieShape(type);
    expect(s.geometry.boundingSphere!.radius).toBeLessThan(2.1);
    expect(s.geometry.boundingSphere!.radius).toBeGreaterThan(1.3);
    // Enveloppe : chaque sommet du côté intérieur de chaque face triangulée
    const v = s.hull.vertices.map((p) => new THREE.Vector3(...(p as [number, number, number])));
    for (const [i, j, k] of s.hull.faces as [number, number, number][]) {
      const nrm = new THREE.Vector3()
        .subVectors(v[j]!, v[i]!)
        .cross(new THREE.Vector3().subVectors(v[k]!, v[i]!));
      for (const p of v)
        expect(nrm.dot(new THREE.Vector3().subVectors(p, v[i]!))).toBeLessThan(1e-6);
    }
  });

  it('d10 : faces en cerf-volant planes', () => {
    const s = dieShape('d10');
    const v = s.hull.vertices.map((p) => new THREE.Vector3(...(p as [number, number, number])));
    // Deux triangles par face : normales identiques
    for (let f = 0; f < s.hull.faces.length; f += 2) {
      const tri = (t: number[]) =>
        new THREE.Vector3()
          .subVectors(v[t[1]!]!, v[t[0]!]!)
          .cross(new THREE.Vector3().subVectors(v[t[2]!]!, v[t[0]!]!))
          .normalize();
      expect(tri(s.hull.faces[f]!).dot(tri(s.hull.faces[f + 1]!))).toBeGreaterThan(0.99999);
    }
  });

  it.each(DIE_TYPES)('%s : la face (ou le coin) tournée vers le haut est lue', (type) => {
    const s = dieShape(type);
    const up = new THREE.Vector3(0, 1, 0);
    if (s.corners) {
      for (const c of s.corners)
        expect(readTop(s, new THREE.Quaternion().setFromUnitVectors(c.dir, up))).toBe(c.value);
      return;
    }
    for (const f of s.faces)
      expect(readTop(s, new THREE.Quaternion().setFromUnitVectors(f.norm, up))).toBe(f.value);
  });
});
