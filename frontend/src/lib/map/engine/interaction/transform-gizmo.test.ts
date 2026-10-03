import { describe, expect, it } from 'vitest';
import { geometryCorners, type EntityGeometry } from '../geometry';
import { constrainAngle, snapGeometryToGrid, snapPoint } from './snapping';
import { hitHandle, resizeGeometry, rotateGeometry } from './transform-gizmo';

const g: EntityGeometry = { x: 100, y: 100, width: 40, height: 20, rotation: 0 };

describe('poignées', () => {
  it('pivote autour du centre, par pas de 15° avec ⇧', () => {
    const r = rotateGeometry(g, { x: 150, y: 100 }, { x: 100, y: 150 }, false);
    expect(r.rotation).toBeCloseTo(90);
    const step = rotateGeometry(g, { x: 150, y: 100 }, { x: 150, y: 108 }, true);
    expect(step.rotation % 15).toBeCloseTo(0);
  });

  it('redimensionne par un coin : le coin opposé ne bouge pas', () => {
    const turned = { ...g, rotation: 30 };
    const [, , , sw] = geometryCorners(turned);
    const next = resizeGeometry(turned, 'ne', { x: 200, y: 20 }, false);
    const [, , , sw2] = geometryCorners(next);
    expect(sw2.x).toBeCloseTo(sw.x);
    expect(sw2.y).toBeCloseTo(sw.y);
    expect(next.rotation).toBe(30);
  });

  it('garde les proportions avec ⇧ et respecte la taille minimale', () => {
    const kept = resizeGeometry(g, 'se', { x: 200, y: 120 }, true);
    expect(kept.width / kept.height).toBeCloseTo(2);
    const tiny = resizeGeometry(g, 'se', { x: 0, y: 0 }, false, 8);
    expect(tiny.width).toBe(8);
    expect(tiny.height).toBe(8);
  });

  it('trouve la poignée sous le pointeur, à taille constante à l’écran', () => {
    const opts = { rotate: true, resize: true };
    expect(hitHandle(g, { x: 120, y: 110 }, 1, opts)).toBe('se');
    expect(hitHandle(g, { x: 100, y: 90 - 26 }, 1, opts)).toBe('rotate');
    expect(hitHandle(g, { x: 100, y: 100 }, 1, opts)).toBeNull();
    // Plus zoomé : la même distance à l'écran est plus courte dans le monde
    expect(hitHandle(g, { x: 124, y: 110 }, 4, opts)).toBeNull();
  });
});

describe('aimantation', () => {
  it('extrémité d’abord, puis point sur un segment, puis grille', () => {
    const opts = {
      points: [{ x: 100, y: 100 }],
      segments: [
        [
          { x: 0, y: 200 },
          { x: 400, y: 200 },
        ],
      ] as const,
      grid: { size: 50 },
      tolerance: 10,
    };
    expect(snapPoint({ x: 104, y: 97 }, opts)).toMatchObject({
      kind: 'point',
      point: { x: 100, y: 100 },
    });
    const onSeg = snapPoint({ x: 133, y: 206 }, opts);
    expect(onSeg).toMatchObject({ kind: 'segment', point: { x: 133, y: 200 } });
    expect(onSeg.segment?.t).toBeCloseTo(133 / 400);
    expect(snapPoint({ x: 262, y: 318 }, opts)).toMatchObject({
      kind: 'grid',
      point: { x: 250, y: 300 },
    });
  });

  it('contraint un angle à 15°', () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 7 });
    expect(p.y).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(Math.hypot(100, 7));
  });

  it('pose une grande boîte sur les lignes, une petite au centre de sa case', () => {
    expect(
      snapGeometryToGrid({ x: 118, y: 131, width: 100, height: 100, rotation: 0 }, { size: 50 }),
    ).toEqual({
      x: 100,
      y: 150,
    });
    expect(
      snapGeometryToGrid({ x: 118, y: 131, width: 20, height: 20, rotation: 0 }, { size: 50 }),
    ).toEqual({
      x: 125,
      y: 125,
    });
  });
});
