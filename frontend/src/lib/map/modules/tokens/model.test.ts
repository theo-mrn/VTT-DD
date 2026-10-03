import { describe, expect, it } from 'vitest';
import { GM } from '../../engine/test-kit';
import type { KindContext } from '../../engine/entities/entity-kind';
import {
  applyTokenGeometry,
  gridAround,
  isNpc,
  tokenCan,
  tokenContains,
  tokenGeometry,
  tokenSize,
  withVisibility,
} from './model';
import { ALICE, SPECTATOR, token } from './test-kit';

const ctx = (extra: Partial<KindContext> = {}): KindContext => ({
  viewer: GM,
  scene: null,
  settings: null,
  pixelsPerUnit: 50,
  unitName: 'm',
  tokenScale: 1,
  ...extra,
});

describe('géométrie d’un token', () => {
  it('taille = pixelsPerUnit × scale × tokenScale, centrée sur pos', () => {
    expect(tokenSize({ scale: 2 }, { pixelsPerUnit: 50, tokenScale: 1.5 })).toBe(150);
    expect(tokenSize({ scale: 0 }, { pixelsPerUnit: 50, tokenScale: 1 })).toBe(50);
    expect(tokenGeometry(token('t', 'c', { pos: { x: 10, y: 20 }, scale: 2 }), ctx())).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      rotation: 0,
    });
  });

  it('un déplacement ne change que pos ; une nouvelle taille change scale', () => {
    const t = token('t', 'c', { scale: 1.3 });
    const g = tokenGeometry(t, ctx());
    const moved = applyTokenGeometry(t, { ...g, x: 123.456, y: 7 }, ctx());
    expect(moved.pos).toEqual({ x: 123.46, y: 7 });
    expect(moved.scale).toBe(1.3);
    const resized = applyTokenGeometry(t, { ...g, width: 100, height: 100 }, ctx());
    expect(resized.scale).toBe(2);
    // Bornes du contrat
    expect(applyTokenGeometry(t, { ...g, width: 1, height: 1 }, ctx()).scale).toBe(0.1);
  });

  it('toucher : disque pour un token rond, carré sinon', () => {
    const g = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
    expect(tokenContains('circle', g, { x: 45, y: 45 }, 0)).toBe(false);
    expect(tokenContains('square', g, { x: 45, y: 45 }, 0)).toBe(true);
    expect(tokenContains('circle', g, { x: 52, y: 0 }, 3)).toBe(true);
  });
});

describe('pose de N exemplaires', () => {
  it('grille serrée centrée, même calcul que le service', () => {
    expect(gridAround({ x: 500, y: 500 }, 4, 50)).toEqual([
      { x: 475, y: 475 },
      { x: 525, y: 475 },
      { x: 475, y: 525 },
      { x: 525, y: 525 },
    ]);
    expect(gridAround({ x: 0, y: 0 }, 1, 50)).toEqual([{ x: 0, y: 0 }]);
    const five = gridAround({ x: 0, y: 0 }, 5, 10);
    expect(five).toHaveLength(5);
    expect(five[0]).toEqual({ x: -10, y: -5 });
    expect(gridAround({ x: 0, y: 0 }, 0, 10)).toEqual([]);
  });
});

describe('droits (miroir du service)', () => {
  const npc = token('t', 'gobelin');
  const hero = token('h', 'hero');
  const npcInfo = { kind: 'npc' as const, side: 'enemies' as const };
  const pcInfo = { kind: 'pc' as const, side: 'players' as const };

  it('MJ : tout, dupliquer seulement un PNJ', () => {
    for (const a of ['move', 'resize', 'delete', 'order', 'inspect'] as const)
      expect(tokenCan(a, npc, GM, npcInfo)).toBe(true);
    expect(tokenCan('duplicate', npc, GM, npcInfo)).toBe(true);
    expect(tokenCan('duplicate', hero, GM, pcInfo)).toBe(false);
    expect(tokenCan('duplicate', npc, GM, undefined)).toBe(false);
  });

  it('joueur : déplace et inspecte ses personnages, rien d’autre', () => {
    expect(tokenCan('select', npc, ALICE, npcInfo)).toBe(true);
    expect(tokenCan('move', hero, ALICE, pcInfo)).toBe(true);
    expect(tokenCan('inspect', hero, ALICE, pcInfo)).toBe(true);
    expect(tokenCan('move', npc, ALICE, npcInfo)).toBe(false);
    expect(tokenCan('inspect', npc, ALICE, npcInfo)).toBe(false);
    for (const a of ['resize', 'delete', 'duplicate', 'order'] as const)
      expect(tokenCan(a, hero, ALICE, pcInfo)).toBe(false);
  });

  it('spectateur : regarde seulement', () => {
    expect(tokenCan('view', hero, SPECTATOR, pcInfo)).toBe(true);
    expect(tokenCan('move', hero, { ...SPECTATOR, characterIds: ['hero'] }, pcInfo)).toBe(false);
  });

  it('PNJ : nature de character, sinon le camp', () => {
    expect(isNpc({ kind: 'npc', side: 'players' })).toBe(true);
    expect(isNpc({ kind: 'pc', side: 'enemies' })).toBe(false);
    expect(isNpc({ kind: null, side: 'allies' })).toBe(true);
    expect(isNpc({ kind: null, side: 'players' })).toBe(false);
    expect(isNpc(undefined)).toBe(false);
  });
});

describe('visibilité', () => {
  it('« pour certains joueurs » garde la liste, les autres la vident', () => {
    const t = token('t', 'c');
    expect(withVisibility(t, 'custom', ['a', 'b'])).toMatchObject({
      visibility: 'custom',
      visibleTo: ['a', 'b'],
    });
    expect(withVisibility({ ...t, visibleTo: ['a'] }, 'hidden')).toMatchObject({
      visibility: 'hidden',
      visibleTo: [],
    });
  });
});
