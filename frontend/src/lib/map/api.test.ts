/**
 * Client REST de la carte : chemins, méthodes, corps réduits aux champs des schémas du contrat,
 * découpage en lots de 500, versions attendues, tokens déplacés en une fois.
 */
import { MAP_BATCH_MAX } from '@vtt/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as { url: string; method: string; body: unknown }[]);
const replies = vi.hoisted(() => ({ next: [] as unknown[] }));

vi.mock('@/lib/api', () => ({
  api: vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return replies.next.length ? replies.next.shift() : {};
  }),
}));
const upload = vi.hoisted(() => ({
  prepare: vi.fn(async (f: File) => f),
  send: vi.fn(async () => 'https://cdn.test/objet.webp'),
}));
vi.mock('@/lib/uploads/prepare', () => ({ prepareUpload: upload.prepare }));
vi.mock('@/lib/uploads/uploader', () => ({ uploadFile: upload.send }));

import { createMapApi, layerPersistence, mapKeys, mapsApi, tokenPersistence } from './api';
import type { MapDto } from './store/map-store';

const BASE = '/v1/campaigns/camp/maps/carte';
const dto = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, version: 1, ...extra }) as MapDto;

beforeEach(() => {
  calls.length = 0;
  replies.next = [];
});

describe('persistance d’une couche (/batch)', () => {
  it('création : champs du schéma seulement, par lots de 500', async () => {
    const p = layerPersistence(BASE, 'lights');
    const drafts = Array.from({ length: MAP_BATCH_MAX + 1 }, (_, i) =>
      dto(`l${i}`, { name: 'L', pos: { x: 1, y: 2 }, radius: 3, inconnu: true, color: undefined }),
    );
    replies.next = [
      { created: [dto('a')], updated: [] },
      { created: [dto('b')], updated: [] },
    ];
    const out = await p.create(drafts);
    expect(out.map((d) => d.id)).toEqual(['a', 'b']);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(`${BASE}/lights/batch`);
    const first = (calls[0]!.body as { create: Record<string, unknown>[] }).create;
    expect(first).toHaveLength(MAP_BATCH_MAX);
    expect(first[0]).toEqual({ name: 'L', pos: { x: 1, y: 2 }, radius: 3 });
  });

  it('modification : changements permis, identifiant et version ; réponse ou donnée locale', async () => {
    const p = layerPersistence(BASE, 'lights');
    replies.next = [{ created: [], updated: [dto('a', { version: 3 })] }];
    const out = await p.update([
      { after: dto('a'), version: 2, changes: { radius: 5, inconnu: 1 } },
      { after: dto('b'), version: 1, changes: { visible: false } },
    ] as never);
    expect(calls[0]!.body).toEqual({
      update: [
        { radius: 5, id: 'a', version: 2 },
        { visible: false, id: 'b', version: 1 },
      ],
    });
    expect(out.map((d) => d.version)).toEqual([3, 1]);
  });

  it('suppression et envoi groupé en une transaction', async () => {
    const p = layerPersistence(BASE, 'obstacles');
    await p.remove([dto('a'), dto('b')]);
    expect(calls[0]!.body).toEqual({ delete: ['a', 'b'] });
    replies.next = [{ created: [dto('n')], updated: [dto('u', { version: 9 })] }];
    const r = await p.batch!({
      create: [dto('brouillon', { kind: 'wall', points: [] })],
      update: [{ after: dto('u'), version: 1, changes: { isOpen: true } }] as never,
      remove: [dto('x')],
    });
    expect(calls[1]!.body).toEqual({
      create: [{ kind: 'wall', points: [] }],
      update: [{ isOpen: true, id: 'u', version: 1 }],
      delete: ['x'],
    });
    expect(r.created[0]!.id).toBe('n');
    expect(r.updated[0]!.version).toBe(9);
  });
});

describe('persistance des tokens', () => {
  it('pose un token par POST (champs permis)', async () => {
    replies.next = [dto('t1')];
    await tokenPersistence(BASE).create([
      dto('brouillon', { characterId: 'c', pos: { x: 1, y: 1 }, inconnu: 1 }),
    ]);
    expect(calls[0]).toMatchObject({ url: `${BASE}/tokens`, method: 'POST' });
    expect(calls[0]!.body).toEqual({ characterId: 'c', pos: { x: 1, y: 1 } });
  });

  it('un glisser (position seule) part en un envoi /tokens/move', async () => {
    replies.next = [{ items: [{ id: 'a', version: 5, pos: { x: 9, y: 9 } }] }];
    const out = await tokenPersistence(BASE).update([
      { after: dto('a', { pos: { x: 9, y: 9 } }), version: 4, changes: { pos: { x: 9, y: 9 } } },
      { after: dto('b', { pos: { x: 1, y: 1 } }), version: 2, changes: { pos: { x: 1, y: 1 } } },
    ] as never);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BASE}/tokens/move`);
    expect(calls[0]!.body).toEqual({
      moves: [
        { tokenId: 'a', pos: { x: 9, y: 9 }, version: 4 },
        { tokenId: 'b', pos: { x: 1, y: 1 }, version: 2 },
      ],
    });
    expect(out.map((t) => t.version)).toEqual([5, 1]);
  });

  it('autre changement : un PATCH par token ; suppression : un DELETE par token', async () => {
    const p = tokenPersistence(BASE);
    await p.update([{ after: dto('a b'), version: 3, changes: { scale: 2 } }] as never);
    expect(calls[0]).toMatchObject({ url: `${BASE}/tokens/a%20b`, method: 'PATCH' });
    expect(calls[0]!.body).toEqual({ scale: 2, version: 3 });
    await p.remove([dto('a'), dto('b')]);
    expect(calls.slice(1).map((c) => `${c.method} ${c.url}`)).toEqual([
      `DELETE ${BASE}/tokens/a`,
      `DELETE ${BASE}/tokens/b`,
    ]);
  });
});

describe('carte ouverte', () => {
  it('chargement, couches, persistance gardée par couche, couche inconnue refusée', async () => {
    const m = createMapApi('camp', 'carte');
    expect(m.campaignId).toBe('camp');
    await m.snapshot();
    expect(calls[0]).toMatchObject({ url: BASE, method: 'GET' });
    replies.next = [{ items: [dto('l')] }];
    expect(await m.list('lights')).toEqual([dto('l')]);
    expect(calls[1]!.url).toBe(`${BASE}/lights`);
    expect(await m.list('inconnue')).toEqual([]);
    expect(m.collection('lights')).toBe(m.collection('lights'));
    expect(m.collection('tokens')).not.toBe(m.collection('lights'));
    expect(() => m.collection('inconnue')).toThrow(/Couche inconnue/);
    await m.settings();
    expect(calls.at(-1)!.url).toBe('/v1/campaigns/camp/map-settings');
  });

  it('ordre, calque supprimé (avec ou sans repli), scène, mise à l’échelle', async () => {
    const m = createMapApi('camp', 'carte');
    await m.arrange([{ kind: 'object', id: 'o', layerId: 'l', z: 1 }] as never);
    await m.deleteLayer('l1', 'l2');
    await m.deleteLayer('l1');
    await m.updateScene({ name: 'Crypte', inconnu: 1 } as never, 4);
    await m.updateScene({ fogFull: true });
    await m.rescale(2, 0.5);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/arrange`,
      `DELETE ${BASE}/layers/l1?moveTo=l2`,
      `DELETE ${BASE}/layers/l1`,
      `PATCH ${BASE}`,
      `PATCH ${BASE}`,
      `POST ${BASE}/rescale`,
    ]);
    expect(calls[3]!.body).toEqual({ name: 'Crypte', version: 4 });
    expect(calls[4]!.body).toEqual({ fogFull: true });
    expect(calls[5]!.body).toEqual({ sx: 2, sy: 0.5 });
  });
});

describe('scènes de la campagne', () => {
  it('liste, création, modification, suppression, tokens, voyage', async () => {
    replies.next = [{ items: [{ id: 's' }] }];
    expect(await mapsApi.list('camp')).toEqual([{ id: 's' }]);
    await mapsApi.create('camp', { name: 'Forêt' });
    await mapsApi.update('camp', 'm 1', { name: 'Bois' });
    await mapsApi.remove('camp', 'm1');
    replies.next = [{ items: [{ id: 't' }] }, { items: [{ id: 't2' }] }];
    expect(await mapsApi.tokens('camp', 'm1')).toEqual([{ id: 't' }]);
    expect(await mapsApi.travel('camp', 'm1', { characterIds: ['c'] })).toEqual([{ id: 't2' }]);
    await mapsApi.travel('camp', 'm1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /v1/campaigns/camp/maps',
      'POST /v1/campaigns/camp/maps',
      'PATCH /v1/campaigns/camp/maps/m%201',
      'DELETE /v1/campaigns/camp/maps/m1',
      'GET /v1/campaigns/camp/maps/m1/tokens',
      'POST /v1/campaigns/camp/maps/m1/travel',
      'POST /v1/campaigns/camp/maps/m1/travel',
    ]);
    expect(calls[6]!.body).toEqual({});
  });

  it('dossiers, réglages, calques', async () => {
    replies.next = [{ items: [{ id: 'g' }] }];
    expect(await mapsApi.groups('camp')).toEqual([{ id: 'g' }]);
    await mapsApi.createGroup('camp', { name: 'Donjons' });
    await mapsApi.updateGroup('camp', 'g', { name: 'Cryptes' });
    await mapsApi.removeGroup('camp', 'g');
    await mapsApi.settings('camp');
    await mapsApi.updateSettings('camp', { pixelsPerUnit: 70 });
    await mapsApi.createLayer('camp', 'm1', { name: 'Toits' });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /v1/campaigns/camp/map-groups',
      'POST /v1/campaigns/camp/map-groups',
      'PATCH /v1/campaigns/camp/map-groups/g',
      'DELETE /v1/campaigns/camp/map-groups/g',
      'GET /v1/campaigns/camp/map-settings',
      'PATCH /v1/campaigns/camp/map-settings',
      'POST /v1/campaigns/camp/maps/m1/layers',
    ]);
  });

  it('envoi d’un média : préparé, puis envoyé sur la campagne avec sa progression', async () => {
    const file = new File(['x'], 'coffre.png', { type: 'image/png' });
    const onProgress = vi.fn();
    expect(await mapsApi.upload('camp', file, 'map-background', onProgress)).toBe(
      'https://cdn.test/objet.webp',
    );
    expect(upload.prepare).toHaveBeenCalledWith(file, 'map-background');
    expect(upload.send).toHaveBeenCalledWith(
      { kind: 'campaign', id: 'camp' },
      'map-background',
      file,
      { onProgress },
    );
    await mapsApi.upload('camp', file);
    expect(upload.send).toHaveBeenLastCalledWith(
      { kind: 'campaign', id: 'camp' },
      'map-object',
      file,
      {},
    );
  });

  it('clés de cache sous la campagne', () => {
    expect(mapKeys.scope('c')).toEqual(['campaign', 'c', 'map']);
    expect(mapKeys.list('c')).toEqual(['campaign', 'c', 'map', 'list']);
    expect(mapKeys.groups('c')).toEqual(['campaign', 'c', 'map', 'groups']);
    expect(mapKeys.settings('c')).toEqual(['campaign', 'c', 'map', 'settings']);
    expect(mapKeys.whereAmI('c', ['a', 'b'])).toEqual(['campaign', 'c', 'map', 'where', 'a', 'b']);
  });
});
