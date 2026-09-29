import { describe, expect, it } from 'vitest';
import {
  MediaUrl,
  CreateMapFogZone,
  CreateMapNpcs,
  CreateMapObject,
  CreateMapScene,
  MAP_LAYERS,
  MapLiveMessage,
  mapLayerBatch,
  MediaUploadRequest,
  UpdateMapObstacle,
} from './map.js';

describe('contrat de la carte', () => {
  it('refuse les clés inconnues et exige les champs obligatoires', () => {
    expect(CreateMapObject.safeParse({ pos: { x: 1, y: 2 } }).success).toBe(true);
    expect(CreateMapObject.safeParse({ name: 'Coffre' }).success).toBe(false);
    expect(CreateMapObject.safeParse({ pos: { x: 1, y: 2 }, inconnu: 1 }).success).toBe(false);
    expect(UpdateMapObstacle.safeParse({ blocksFrom: 'left', version: 2 }).success).toBe(true);
    expect(UpdateMapObstacle.safeParse({ direction: 'north' }).success).toBe(false);
  });

  it('scène : largeur et hauteur ensemble, brouillard complet', () => {
    expect(CreateMapScene.safeParse({ name: 'Taverne', width: 10 }).success).toBe(false);
    expect(CreateMapScene.safeParse({ name: 'Taverne', fogFull: true }).success).toBe(true);
  });

  it('zones de brouillard : champs selon la forme', () => {
    const circle = { shape: 'circle', center: { x: 0, y: 0 }, radius: 10 };
    expect(CreateMapFogZone.parse(circle)).toEqual(circle);
    expect(CreateMapFogZone.safeParse({ ...circle, points: [] }).success).toBe(false);
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(CreateMapFogZone.safeParse({ shape: 'rect', points: square }).success).toBe(true);
    expect(CreateMapFogZone.safeParse({ shape: 'rect', points: square.slice(0, 3) }).success).toBe(
      false,
    );
  });

  it('lot : listes vides par défaut, identifiants en minuscules', () => {
    const { create, update } = MAP_LAYERS.rooms;
    const batch = mapLayerBatch(create, update);
    const id = 'A1B2C3D4-0000-4000-8000-000000000000';
    expect(batch.parse({ delete: [id] })).toEqual({
      create: [],
      update: [],
      delete: [id.toLowerCase()],
    });
  });

  it('PNJ : une source parmi trois, 20 exemplaires au plus', () => {
    const pos = { x: 5, y: 5 };
    const id = crypto.randomUUID();
    expect(CreateMapNpcs.parse({ source: { templateId: id }, pos }).count).toBe(1);
    expect(
      CreateMapNpcs.safeParse({ source: { quick: { name: 'Gobelin', type: 'pnj' } }, pos }).success,
    ).toBe(true);
    expect(CreateMapNpcs.safeParse({ source: { templateId: id }, pos, count: 21 }).success).toBe(
      false,
    );
    expect(CreateMapNpcs.safeParse({ source: {}, pos }).success).toBe(false);
  });

  it('médias : type et taille selon la sorte', () => {
    const mo = 1024 * 1024;
    expect(
      MediaUploadRequest.safeParse({ kind: 'image', contentType: 'image/avif', size: 9 * mo })
        .success,
    ).toBe(true);
    expect(
      MediaUploadRequest.safeParse({ kind: 'image', contentType: 'video/webm', size: 10 }).success,
    ).toBe(false);
    expect(
      MediaUploadRequest.safeParse({ kind: 'video', contentType: 'video/mp4', size: 101 * mo })
        .success,
    ).toBe(false);
  });

  it('map.live : glisser avec ou sans rotation, fin du geste', () => {
    const msg = {
      m: 'carte',
      s: 3,
      drag: [
        ['a', 1, 2],
        ['b', 3, 4, 90],
      ],
      end: true,
    };
    expect(MapLiveMessage.parse(msg)).toEqual(msg);
    expect(MapLiveMessage.safeParse({ m: 'carte', s: 1, drag: [['a', 1]] }).success).toBe(false);
  });

  it('média : https, chemin absolu, ou http sur la boucle locale seulement', () => {
    const ok = (u: string) => MediaUrl.safeParse(u).success;
    expect(ok('https://assets.yner.fr/Cartes/a.webp')).toBe(true);
    expect(ok('/Assets/fond.webm')).toBe(true);
    expect(ok('http://localhost:8333/vtt-dev/campaigns/x/fond.webm')).toBe(true);
    expect(ok('http://127.0.0.1:8333/vtt-dev/a.png')).toBe(true);
    expect(ok('http://[::1]:8333/a.png')).toBe(true);
    expect(ok('http://exemple.fr/a.png')).toBe(false);
    expect(ok('http://localhost.exemple.fr/a.png')).toBe(false);
    expect(ok('//cdn.exemple.fr/a.png')).toBe(false);
    expect(ok('javascript:alert(1)')).toBe(false);
  });
});
