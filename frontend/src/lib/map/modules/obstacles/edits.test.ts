import { describe, expect, it } from 'vitest';
import {
  addChain,
  addDoorInWall,
  addRoom,
  deleteSegment,
  deleteVertex,
  EditPlan,
  loopOf,
  moveOneVertex,
  moveVertices,
  rectanglePoints,
  replaceByWall,
  translate,
} from './edits';
import { pointKey } from './geometry';
import { defaultProps, type ObstacleData, type RoomData } from './model';

const P = (x: number, y: number) => ({ x, y });

function wall(id: string, points: { x: number; y: number }[], extra: Partial<ObstacleData> = {}) {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    ...defaultProps('wall'),
    points,
    ...extra,
  } as ObstacleData;
}

function room(id: string, points: { x: number; y: number }[]): RoomData {
  return { id, mapId: 'carte', version: 1, updatedAt: '', name: 'Pièce 1', points };
}

function plan(walls: ObstacleData[] = [], rooms: RoomData[] = []) {
  return new EditPlan(
    new Map(walls.map((w) => [w.id, w])),
    new Map(rooms.map((r) => [r.id, r])),
    'carte',
  );
}

describe('poser une chaîne', () => {
  it('scinde un mur existant là où la chaîne s’y pose (jonction en T soudée)', () => {
    const p = plan([wall('a', [P(0, 0), P(100, 0)])]);
    const created = addChain(p, [P(50, 0), P(50, 80)], defaultProps('wall'));
    expect(created.map((c) => c.points)).toEqual([[P(50, 0), P(50, 80)]]);
    expect(p.obstacle('a')!.points).toEqual([P(0, 0), P(50, 0), P(100, 0)]);
  });

  it('insère dans le mur neuf un sommet existant qui tombe dessus', () => {
    const p = plan([wall('a', [P(50, 0), P(50, -80)])]);
    const [c] = addChain(p, [P(0, 0), P(100, 0)], defaultProps('wall'));
    expect(c!.points).toEqual([P(0, 0), P(50, 0), P(100, 0)]);
    expect(p.obstacle('a')!.points).toEqual([P(50, 0), P(50, -80)]);
  });

  it('fusionne les doublons : un segment qui existe déjà n’est pas recréé', () => {
    const p = plan([wall('a', [P(0, 0), P(100, 0)])]);
    expect(addChain(p, [P(100, 0), P(0, 0)], defaultProps('wall'))).toEqual([]);
    const pieces = addChain(p, [P(-50, 0), P(0, 0), P(100, 0), P(100, 50)], defaultProps('wall'));
    expect(pieces.map((c) => c.points)).toEqual([
      [P(-50, 0), P(0, 0)],
      [P(100, 0), P(100, 50)],
    ]);
  });

  it('un aller-retour sur le même segment ne pose qu’un mur', () => {
    const p = plan();
    const pieces = addChain(p, [P(0, 0), P(100, 0), P(0, 0)], defaultProps('wall'));
    expect(pieces.map((c) => c.points)).toEqual([[P(0, 0), P(100, 0)]]);
  });

  it('rectangle de murs : une ligne fermée de 4 murs soudés', () => {
    const p = plan();
    const [c] = addChain(p, rectanglePoints(P(0, 0), P(100, 50)), defaultProps('wall'));
    expect(c!.points).toEqual([P(0, 0), P(100, 0), P(100, 50), P(0, 50), P(0, 0)]);
  });

  it('pièce avec ses murs : les murs sont soudés aux murs existants', () => {
    const p = plan([wall('a', [P(0, 50), P(-100, 50)])]);
    const r = addRoom(p, [P(0, 0), P(100, 0), P(100, 100), P(0, 100)], 'Pièce 1', true);
    expect(r!.points).toHaveLength(4);
    const created = p.result().obstacles.create;
    expect(created).toHaveLength(1);
    expect(created[0]!.points).toContainEqual(P(0, 50));
  });
});

describe('portes dans un mur', () => {
  it('mur, porte, mur, en une modification et deux créations', () => {
    const p = plan([wall('a', [P(0, 0), P(200, 0)], { color: '#ffffff' })]);
    const door = addDoorInWall(p, 'a', 0, P(100, 0), 50);
    expect(door!.kind).toBe('door');
    expect(door!.points).toEqual([P(75, 0), P(125, 0)]);
    expect(door!.isOpen).toBe(false);
    const r = p.result().obstacles;
    expect(r.update.map((u) => u.after.points)).toEqual([[P(0, 0), P(75, 0)]]);
    expect(r.create.map((c) => [c.kind, c.points, c.color])).toEqual([
      ['wall', [P(125, 0), P(200, 0)], '#ffffff'],
      ['door', [P(75, 0), P(125, 0)], '#ffffff'],
    ]);
  });

  it('un mur d’un seul segment couvert devient la porte', () => {
    const p = plan([wall('a', [P(0, 0), P(40, 0)])]);
    const door = addDoorInWall(p, 'a', 0, P(20, 0), 50);
    expect(door!.id).toBe('a');
    expect(p.result().obstacles.create).toEqual([]);
  });

  it('refuse une porte dans une porte', () => {
    const p = plan([wall('a', [P(0, 0), P(100, 0)], { kind: 'door' })]);
    expect(addDoorInWall(p, 'a', 0, P(50, 0), 50)).toBeNull();
  });
});

describe('déplacer', () => {
  it('les sommets soudés bougent ensemble (murs et pièces)', () => {
    const p = plan(
      [wall('a', [P(0, 0), P(100, 0)]), wall('b', [P(100, 0), P(100, 100)])],
      [room('r', [P(0, 0), P(100, 0), P(100, 100)])],
    );
    moveVertices(p, new Map([[pointKey(P(100, 0)), P(120, 10)]]));
    expect(p.obstacle('a')!.points[1]).toEqual(P(120, 10));
    expect(p.obstacle('b')!.points[0]).toEqual(P(120, 10));
    expect(p.room('r')!.points[1]).toEqual(P(120, 10));
  });

  it('Alt : un seul sommet se détache', () => {
    const p = plan([wall('a', [P(0, 0), P(100, 0)]), wall('b', [P(100, 0), P(100, 100)])]);
    moveOneVertex(p, { collection: 'obstacles', id: 'a', index: 1 }, P(120, 10));
    expect(p.obstacle('a')!.points[1]).toEqual(P(120, 10));
    expect(p.obstacle('b')!.points[0]).toEqual(P(100, 0));
  });

  it('un sommet posé sur son voisin fond le segment ; un mur dégénéré disparaît', () => {
    const p = plan([wall('a', [P(0, 0), P(100, 0), P(200, 0)]), wall('b', [P(0, 50), P(10, 50)])]);
    moveVertices(p, new Map([[pointKey(P(100, 0)), P(200, 0)]]));
    expect(p.obstacle('a')!.points).toEqual([P(0, 0), P(200, 0)]);
    moveVertices(p, new Map([[pointKey(P(10, 50)), P(0, 50)]]));
    expect(p.obstacle('b')).toBeUndefined();
    expect(p.result().obstacles.remove.map((o) => o.id)).toEqual(['b']);
  });

  it('déplacer un mur étire ses voisins soudés (Alt : il s’en détache)', () => {
    const base = [wall('a', [P(0, 0), P(100, 0)]), wall('b', [P(100, 0), P(100, 100)])];
    const stretched = plan(base);
    translate(stretched, { obstacles: new Set(['a']), rooms: new Set() }, P(0, 10), true);
    expect(stretched.obstacle('a')!.points).toEqual([P(0, 10), P(100, 10)]);
    expect(stretched.obstacle('b')!.points).toEqual([P(100, 10), P(100, 100)]);
    const detached = plan(base);
    translate(detached, { obstacles: new Set(['a']), rooms: new Set() }, P(0, 10), false);
    expect(detached.obstacle('b')!.points).toEqual([P(100, 0), P(100, 100)]);
  });
});

describe('supprimer', () => {
  it('un sommet, puis un segment', () => {
    const p = plan([wall('a', [P(0, 0), P(50, 0), P(100, 0), P(100, 50)])]);
    deleteVertex(p, { collection: 'obstacles', id: 'a', index: 1 });
    expect(p.obstacle('a')!.points).toEqual([P(0, 0), P(100, 0), P(100, 50)]);
    deleteSegment(p, 'a', 0);
    expect(p.obstacle('a')!.points).toEqual([P(100, 0), P(100, 50)]);
    deleteSegment(p, 'a', 0);
    expect(p.obstacle('a')).toBeUndefined();
  });

  it('un segment au milieu scinde le mur', () => {
    const p = plan([wall('a', [P(0, 0), P(50, 0), P(100, 0), P(150, 0)])]);
    deleteSegment(p, 'a', 1);
    expect(p.obstacle('a')!.points).toEqual([P(0, 0), P(50, 0)]);
    expect(p.result().obstacles.create.map((c) => c.points)).toEqual([[P(100, 0), P(150, 0)]]);
  });
});

describe('remplacer par un mur', () => {
  it('la porte redevient un mur, fondu avec les murs qu’elle prolonge', () => {
    const p = plan([
      wall('a', [P(0, 0), P(75, 0)]),
      wall('d', [P(75, 0), P(125, 0)], { kind: 'door' }),
      wall('b', [P(125, 0), P(200, 0)]),
    ]);
    const kept = replaceByWall(p, 'd');
    const walls = [...p.obstacles()];
    expect(walls).toHaveLength(1);
    expect(walls[0]!.id).toBe(kept);
    expect(walls[0]!.kind).toBe('wall');
    expect(walls[0]!.points.map((q) => q.x).sort((x, y) => x - y)).toEqual([0, 75, 125, 200]);
  });
});

describe('pièce depuis une boucle', () => {
  it('trouve le contour formé par plusieurs murs', () => {
    const loop = loopOf([
      wall('a', [P(0, 0), P(100, 0), P(100, 100)]),
      wall('d', [P(100, 100), P(50, 100)], { kind: 'door' }),
      wall('b', [P(50, 100), P(0, 100), P(0, 0)]),
    ]);
    expect(loop).toHaveLength(5);
  });
});
