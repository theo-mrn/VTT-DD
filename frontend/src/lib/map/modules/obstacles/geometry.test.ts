import { describe, expect, it } from 'vitest';
import {
  cleanPolyline,
  findLoop,
  insertDoor,
  insertVerticesOnSegments,
  isClosed,
  oneWayArrow,
  removeSegment,
  removeVertex,
  segmentKey,
  splitPolyline,
} from './geometry';

const P = (x: number, y: number) => ({ x, y });

describe('lignes brisées', () => {
  it('reconnaît une ligne fermée (dernier point = premier, 3 sommets distincts)', () => {
    expect(isClosed([P(0, 0), P(10, 0), P(10, 10), P(0, 0)])).toBe(true);
    expect(isClosed([P(0, 0), P(10, 0), P(0, 0)])).toBe(false);
    expect(isClosed([P(0, 0), P(10, 0), P(10, 10)])).toBe(false);
  });

  it('refuse les segments de moins de 2 px ; le dernier point (soudure) l’emporte', () => {
    expect(cleanPolyline([P(0, 0), P(1, 0), P(50, 0), P(51, 0)])).toEqual([P(0, 0), P(51, 0)]);
    expect(cleanPolyline([P(0, 0), P(1, 1)])).toBeNull();
  });

  it('garde une boucle fermée, ou l’ouvre si elle dégénère', () => {
    expect(cleanPolyline([P(0, 0), P(50, 0), P(50, 50), P(0, 0)])).toEqual([
      P(0, 0),
      P(50, 0),
      P(50, 50),
      P(0, 0),
    ]);
    expect(cleanPolyline([P(0, 0), P(50, 0), P(50, 1), P(0, 0)])).toEqual([P(0, 0), P(50, 0)]);
  });

  it('segmentKey ne dépend pas du sens', () => {
    expect(segmentKey(P(0, 0), P(5, 5))).toBe(segmentKey(P(5, 5), P(0, 0)));
  });
});

describe('soudures', () => {
  it('insère un point posé sur un segment (jonction en T), dans l’ordre du tracé', () => {
    const wall = [P(0, 0), P(100, 0)];
    expect(insertVerticesOnSegments(wall, [P(70, 0), P(30, 0), P(50, 20)])).toEqual([
      P(0, 0),
      P(30, 0),
      P(70, 0),
      P(100, 0),
    ]);
  });

  it('n’insère ni une extrémité ni un point à côté du segment', () => {
    expect(insertVerticesOnSegments([P(0, 0), P(100, 0)], [P(0, 0), P(50, 0.2)])).toBeNull();
  });
});

describe('découpes', () => {
  it('retire un segment d’une ligne ouverte : deux morceaux', () => {
    const pts = [P(0, 0), P(10, 0), P(20, 0), P(30, 0)];
    expect(removeSegment(pts, 1)).toEqual([
      [P(0, 0), P(10, 0)],
      [P(20, 0), P(30, 0)],
    ]);
    expect(removeSegment(pts, 0)).toEqual([[P(10, 0), P(20, 0), P(30, 0)]]);
  });

  it('retire un segment d’une ligne fermée : elle s’ouvre en faisant le tour', () => {
    const ring = [P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(0, 0)];
    expect(removeSegment(ring, 1)).toEqual([[P(10, 10), P(0, 10), P(0, 0), P(10, 0)]]);
  });

  it('splitPolyline garde tout si rien n’est retiré', () => {
    const pts = [P(0, 0), P(10, 0)];
    expect(splitPolyline(pts, () => true)).toEqual([pts]);
  });

  it('retire un sommet : ses deux segments n’en font plus qu’un', () => {
    expect(removeVertex([P(0, 0), P(10, 0), P(20, 0)], 1)).toEqual([P(0, 0), P(20, 0)]);
    expect(removeVertex([P(0, 0), P(10, 0)], 1)).toBeNull();
    // Fermée : le premier sommet est aussi le dernier
    expect(removeVertex([P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(0, 0)], 0)).toEqual([
      P(10, 0),
      P(10, 10),
      P(0, 10),
      P(10, 0),
    ]);
  });
});

describe('portes', () => {
  it('scinde le mur en mur, porte, mur, centrée sur le clic', () => {
    const r = insertDoor([P(0, 0), P(200, 0)], 0, P(100, 3), 50);
    expect(r.door).toEqual([P(75, 0), P(125, 0)]);
    expect(r.rest).toEqual([
      [P(0, 0), P(75, 0)],
      [P(125, 0), P(200, 0)],
    ]);
  });

  it('reste dans le segment ; un bout de mur trop court n’est pas gardé', () => {
    const r = insertDoor([P(0, 0), P(200, 0), P(200, 100)], 0, P(10, 0), 50);
    expect(r.door).toEqual([P(0, 0), P(50, 0)]);
    expect(r.rest).toEqual([[P(50, 0), P(200, 0), P(200, 100)]]);
    const edge = insertDoor([P(0, 0), P(200, 0)], 0, P(174, 0), 50);
    expect(edge.door).toEqual([P(149, 0), P(200, 0)]);
  });

  it('un segment plus court que la porte devient la porte', () => {
    const r = insertDoor([P(0, 0), P(40, 0)], 0, P(20, 0), 50);
    expect(r.door).toEqual([P(0, 0), P(40, 0)]);
    expect(r.rest).toEqual([]);
  });

  it('ouvre une ligne fermée : il reste une ligne qui en fait le tour', () => {
    const ring = [P(0, 0), P(200, 0), P(200, 200), P(0, 200), P(0, 0)];
    const r = insertDoor(ring, 0, P(100, 0), 50);
    expect(r.door).toEqual([P(75, 0), P(125, 0)]);
    expect(r.rest).toEqual([[P(125, 0), P(200, 0), P(200, 200), P(0, 200), P(0, 0), P(75, 0)]]);
  });
});

describe('boucles', () => {
  it('trouve le contour fermé de murs, sans les bouts pendants', () => {
    const loop = findLoop([
      [P(0, 0), P(100, 0)],
      [P(100, 0), P(100, 100)],
      [P(100, 100), P(0, 100)],
      [P(0, 100), P(0, 0)],
      [P(100, 100), P(150, 150)],
    ]);
    expect(loop).toHaveLength(4);
    expect(loop).toEqual(expect.arrayContaining([P(0, 0), P(100, 0), P(100, 100), P(0, 100)]));
  });

  it('refuse une ligne ouverte ou deux boucles', () => {
    expect(
      findLoop([
        [P(0, 0), P(100, 0)],
        [P(100, 0), P(100, 100)],
      ]),
    ).toBeNull();
    expect(
      findLoop([
        [P(0, 0), P(10, 0)],
        [P(10, 0), P(10, 10)],
        [P(10, 10), P(0, 0)],
        [P(0, 0), P(-10, 0)],
        [P(-10, 0), P(-10, -10)],
        [P(-10, -10), P(0, 0)],
      ]),
    ).toBeNull();
  });
});

describe('sens unique', () => {
  it('la flèche pointe vers la gauche du tracé pour blocksFrom = left (y vers le bas)', () => {
    // Tracé vers la droite : la gauche est en haut de l'écran
    expect(oneWayArrow(P(0, 0), P(10, 0), 'left')).toEqual({ x: 0, y: -1 });
    expect(oneWayArrow(P(0, 0), P(10, 0), 'right')).toEqual({ x: -0, y: 1 });
    // Tracé vers le bas : la gauche est à l'est (README de @vtt/vision)
    expect(oneWayArrow(P(0, 0), P(0, 10), 'left').x).toBeGreaterThan(0);
  });
});
