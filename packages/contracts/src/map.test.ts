import { describe, expect, it } from 'vitest';
import {
  MapGrids,
  scenePixelsPerUnit,
  MediaUrl,
  CreateMapFogZone,
  CreateMapNpcs,
  CreateMapObject,
  CreateMapScene,
  MAP_LAYERS,
  MapLiveMessage,
  MapWeather,
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

  it('map.live : tracé d’une forme remplie (le remplissage part avec elle)', () => {
    const msg = {
      m: 'carte',
      s: 4,
      stroke: {
        id: 't',
        tool: 'rectangle',
        color: '#ff0000ff',
        width: 3,
        fill: '#ff000059',
        points: [0, 0, 10, 10],
      },
    };
    expect(MapLiveMessage.parse(msg)).toEqual(msg);
    // Sans remplissage : champ absent ou nul
    const { fill: _fill, ...plain } = msg.stroke;
    expect(MapLiveMessage.safeParse({ ...msg, stroke: plain }).success).toBe(true);
    expect(MapLiveMessage.safeParse({ ...msg, stroke: { ...plain, fill: 3 } }).success).toBe(false);
  });

  it('map.live : mesure en cours, effacée (null) ou épinglée', () => {
    const measure = {
      id: 'm1',
      shape: 'cone',
      from: [10, 20],
      to: [110, 20],
      color: '#ffd700',
      skin: 'Cone/cone1.webm',
      options: { coneAngle: 60, coneShape: 'flat' },
    };
    expect(MapLiveMessage.parse({ m: 'carte', s: 5, measure })).toMatchObject({ measure });
    expect(MapLiveMessage.safeParse({ m: 'carte', s: 6, measure: null, end: true }).success).toBe(
      true,
    );
    expect(
      MapLiveMessage.safeParse({ m: 'carte', s: 7, measure: { ...measure, pinned: true } }).success,
    ).toBe(true);
    expect(
      MapLiveMessage.safeParse({ m: 'carte', s: 8, measure: { ...measure, shape: 'star' } })
        .success,
    ).toBe(false);
    expect(
      MapLiveMessage.safeParse({ m: 'carte', s: 9, measure: { ...measure, options: { a: {} } } })
        .success,
    ).toBe(false);
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

  it('quadrillages : une seule grille de jeu, qui donne la case de la scène', () => {
    const grid = (id: string, primary: boolean, size = 70) => ({
      id,
      name: id,
      size,
      offsetX: 12,
      offsetY: 5,
      color: '#000000',
      opacity: 0.4,
      thickness: 1,
      visibleToPlayers: true,
      primary,
    });
    expect(MapGrids.safeParse([grid('a', true), grid('b', false, 350)]).success).toBe(true);
    expect(MapGrids.safeParse([grid('a', true), grid('b', true)]).success).toBe(false);
    expect(MapGrids.safeParse([grid('a', false), grid('a', false)]).success).toBe(false);
    expect(MapGrids.safeParse([1, 2, 3, 4, 5].map((i) => grid(`g${i}`, false))).success).toBe(
      false,
    );
    expect(scenePixelsPerUnit({ grids: [grid('a', false), grid('b', true, 88)] }, null)).toBe(88);
    expect(scenePixelsPerUnit({ grids: [grid('a', false)] }, { pixelsPerUnit: 64 })).toBe(64);
    expect(scenePixelsPerUnit(null, null)).toBe(50);
    // Sans grille de jeu : une part de la largeur du fond, quelle que soit sa résolution
    expect(scenePixelsPerUnit({ grids: [], width: 3840 }, { pixelsPerUnit: 64 })).toBe(153.6);
    expect(scenePixelsPerUnit({ grids: [], width: 1920 }, null)).toBe(76.8);
    expect(scenePixelsPerUnit({ grids: [grid('b', true, 88)], width: 3840 }, null)).toBe(88);
  });

  it('météo : vent facultatif (données anciennes), borné, sans clé inconnue', () => {
    expect(MapWeather.safeParse({ type: 'rain', intensity: 2 }).success).toBe(true);
    expect(
      MapWeather.safeParse({ type: 'snow', intensity: 0.5, wind: { direction: 90, strength: 1 } })
        .success,
    ).toBe(true);
    const bad = [
      { type: 'rain', intensity: 0.5, wind: { direction: 400, strength: 0.5 } },
      { type: 'rain', intensity: 0.5, wind: { direction: 0, strength: 2 } },
      { type: 'rain', intensity: 0.5, wind: { direction: 0 } },
      { type: 'rain', intensity: 0.5, lightning: true },
      { type: '', intensity: 0.5 },
    ];
    for (const w of bad) expect(MapWeather.safeParse(w).success).toBe(false);
    expect(CreateMapScene.safeParse({ name: 'Plaine', weather: null }).success).toBe(true);
  });
});
