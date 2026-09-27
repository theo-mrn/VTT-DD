import { describe, expect, it } from 'vitest';
import type { FirestoreDoc } from '../legacy.js';
import { legacyUuid, transformRoom, type RoomMappings, type RtdbRoom } from './transform.js';

const R = 'ABC123';
const doc = (path: string, data: Record<string, unknown>): FirestoreDoc => ({
  path,
  id: path.split('/').pop()!,
  data,
});

const HERO = 'aaaaaaaa-0000-4000-8000-000000000001';
const ORC = 'aaaaaaaa-0000-4000-8000-000000000002';
const GHOST = 'aaaaaaaa-0000-4000-8000-000000000003';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const mappings: RoomMappings = {
  campaignId: 'cccccccc-0000-4000-8000-000000000001',
  ownerId: OWNER,
  characters: new Map([
    [`cartes/${R}/characters/hero`, { id: HERO, engaged: true }],
    [`cartes/${R}/characters/orc`, { id: ORC, engaged: true }],
    [`cartes/${R}/characters/ghost`, { id: GHOST, engaged: false }],
  ]),
  accounts: new Map([['uid-1', 'dddddddd-0000-4000-8000-000000000001']]),
};

const docs = [
  doc(`cartes/${R}/groups/g1`, { name: 'Donjon', order: 1700000000000 }),
  doc(`cartes/${R}/cities/c1`, {
    name: 'Taverne',
    groupId: 'g1',
    backgroundUrl: 'https://assets.example/taverne.webp',
    visibleToPlayers: false,
    spawnX: 10,
    spawnY: '20',
    weather: { type: 'rain', intensity: 2 },
  }),
  doc(`cartes/${R}/cities/c2`, { name: 'Route', groupId: 'disparu' }),
  doc(`cartes/${R}/settings/general`, {
    globalTokenScale: 1.5,
    pixelsPerUnit: 70,
    donjon: true,
    currentCityId: 'c2',
  }),
  doc(`cartes/${R}/settings/layers_c1`, {
    layers: [
      { id: 'fog', isVisible: false, label: 'Brouillard', order: 6 },
      { id: 'inconnu', isVisible: true },
    ],
  }),
  doc(`cartes/${R}/fog/fog_c1`, {
    grid: { '1,2 ': true, '3,4': false, 'x,y': true },
    fullMapFog: false,
  }),
  doc(`cartes/${R}/fog/fogData`, { fullMapFog: true }),
  doc(`cartes/${R}/characters/hero`, {
    type: 'joueurs',
    x: 1,
    y: 2,
    positions: { c1: { x: 5, y: 6 }, supprimee: { x: 0, y: 0 } },
    imageURL: 'https://img/avatar.png',
    imageURL2: 'https://img/avatar.png',
    visibilityRadius: '5000',
    visionBoostActive: true,
  }),
  doc(`cartes/${R}/characters/orc`, {
    type: 'pnj',
    x: 300,
    y: 400,
    visibility: 'custom',
    visibleToPlayerIds: ['hero', 'inconnu'],
    imageURL2: 'https://img/token.png',
    shape: 'square',
    audio: { url: 'https://s/grogne.mp3', radius: 80, volume: 2 },
  }),
  doc(`cartes/${R}/characters/ghost`, { type: 'pnj', cityId: 'c1' }),
  doc(`cartes/${R}/characters/stranger`, { type: 'pnj' }),
  doc(`cartes/${R}/characters/hero/customCompetences/v1-1`, { competenceName: 'x' }),
  doc(`cartes/${R}/objects/o1`, {
    cityId: 'c1',
    x: 1,
    y: 2,
    type: 'decors',
    visibility: 'custom',
    visibleToPlayerIds: ['hero'],
    width: 0,
  }),
  doc(`cartes/${R}/objects/o2`, { cityId: 'zz', x: 1, y: 2 }),
  doc(`cartes/${R}/lights/l1`, { cityId: 'c1', x: 5, y: 5, radius: 3 }),
  doc(`cartes/${R}/musicZones/z1`, { cityId: 'c1', x: 5, y: 5, url: 'E8Ced6hW45', volume: 0.3 }),
  doc(`cartes/${R}/portals/p1`, {
    cityId: 'c1',
    x: 1,
    y: 1,
    portalType: 'same-map',
    targetX: 50,
    targetY: 60,
    iconType: 'stairs',
  }),
  doc(`cartes/${R}/text/t1`, { cityId: 'c1', x: 1, y: 1, content: 'ancien texte' }),
  doc(`cartes/${R}/text/t2`, { cityId: 'c1', x: 2, y: 2, content: 'effacé depuis' }),
  doc(`cartes/${R}/cities/c1/combat/state`, { activePlayer: 'hero' }),
];

const rtdb: RtdbRoom = {
  positions: {
    _migrated: true,
    hero: { positions: { c2: { x: 70, y: 80 } } },
    orc: { x: 33, y: 44 },
  },
  obstacles: {
    w1: {
      type: 'wall',
      cityId: 'c1',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    },
    p1: {
      type: 'polygon',
      cityId: 'c1',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      edges: [
        { type: 'door', isOpen: true },
        { type: 'one-way-wall', direction: 'north' },
      ],
    },
    r1: {
      type: 'rectangle',
      cityId: null,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 2 },
      ],
    },
    bad: { type: 'wall', cityId: 'c1', points: [{ x: 0, y: 0 }] },
  },
  drawings: {
    d1: { cityId: 'c1', type: 'line', paths: [{ x: 1, y: 1 }], color: '#f00', width: 3 },
  },
  notes: { t1: { cityId: 'c1', x: 9, y: 9, content: 'nouveau texte', fontSize: 20 } },
  measurements: {
    m1: {
      type: 'cone',
      permanent: true,
      cityId: 'c1',
      start: { x: 0, y: 0 },
      end: { x: 5, y: 5 },
      ownerId: 'uid-1',
      coneAngle: 60,
    },
    m2: {
      type: 'line',
      permanent: false,
      cityId: 'c1',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    m3: { end: { x: 1, y: 1 } },
  },
  music: { videoId: 'abc', isPlaying: true, updatedBy: 'uid-1' },
};

describe('transformRoom', () => {
  const m = transformRoom(R, docs, rtdb, mappings);
  const c1 = legacyUuid(`cartes/${R}/cities/c1`);
  const c2 = legacyUuid(`cartes/${R}/cities/c2`);
  const fond = legacyUuid(`cartes/${R}/fond/fond1`);

  it('identifiants stables (UUID version 5)', () => {
    expect(legacyUuid('x')).toBe(legacyUuid('x'));
    expect(legacyUuid('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(transformRoom(R, docs, rtdb, mappings)).toEqual(m);
  });

  it('scènes, dossiers, fond global et réglages', () => {
    expect(m.groups).toEqual([
      {
        id: legacyUuid(`cartes/${R}/groups/g1`),
        campaignId: mappings.campaignId,
        name: 'Donjon',
        sortOrder: 1700000000000,
      },
    ]);
    const taverne = m.maps.find((x) => x.id === c1)!;
    expect(taverne).toMatchObject({
      name: 'Taverne',
      groupId: m.groups[0]!.id,
      visibleToPlayers: false,
      spawn: { x: 10, y: 20 },
      weather: { type: 'rain', intensity: 2 },
      layers: { fog: false },
    });
    expect(m.maps.find((x) => x.id === c2)!.groupId).toBeNull();
    // Le fond global existe : l'orque et un rectangle n'ont pas de scène
    expect(m.maps.find((x) => x.id === fond)).toMatchObject({
      isDefault: true,
      name: 'Carte principale',
    });
    expect(m.settings).toMatchObject({
      partyMapId: c2,
      tokenScale: 1.5,
      pixelsPerUnit: 70,
      dungeonMode: true,
      music: { videoId: 'abc', isPlaying: true },
    });
    expect(m.settings!.music).not.toHaveProperty('updatedBy');
    expect(m.fog).toEqual([
      { mapId: c1, campaignId: mappings.campaignId, fullMap: false, cells: ['1,2'] },
      { mapId: fond, campaignId: mappings.campaignId, fullMap: true, cells: [] },
    ]);
  });

  it('tokens : scène courante du joueur, positions mémorisées, PNJ du fond global', () => {
    const hero = m.tokens.filter((t) => t.characterId === HERO);
    // Scène du groupe (c2) : position RTDB ; c1 : position Firestore mémorisée
    expect(hero.map((t) => [t.mapId, t.present, t.pos])).toEqual([
      [c2, true, { x: 70, y: 80 }],
      [c1, false, { x: 5, y: 6 }],
    ]);
    expect(hero[0]).toMatchObject({
      imageUrl: null,
      visionRadius: 2000,
      visionBoost: true,
      visibility: 'visible',
    });
    const orc = m.tokens.find((t) => t.characterId === ORC)!;
    expect(orc).toMatchObject({
      mapId: fond,
      pos: { x: 33, y: 44 },
      visibility: 'custom',
      visibleTo: [HERO],
      shape: 'square',
      imageUrl: 'https://img/token.png',
      audio: { url: 'https://s/grogne.mp3', radius: 80, volume: 0.5 },
    });
    expect(m.tokens.some((t) => t.characterId === GHOST)).toBe(false);
    expect(m.warnings).toEqual(
      expect.arrayContaining([
        `Token cartes/${R}/characters/ghost : personnage non engagé dans la campagne`,
        `Token cartes/${R}/characters/stranger : personnage non importé`,
        `Token cartes/${R}/characters/orc : personnage visé inconnu non importé`,
        '1 position(s) mémorisée(s) sur des scènes supprimées : ignorée(s)',
        '1 document(s) cities/combat non migré(s) (hors carte)',
      ]),
    );
  });

  it('couches : objets, obstacles éclatés, dessins, textes, gabarits permanents', () => {
    expect(m.objects).toHaveLength(1);
    expect(m.objects[0]).toMatchObject({
      kind: 'decor',
      visibility: 'custom',
      visibleTo: [HERO],
      width: 100,
    });
    expect(m.warnings).toContain(
      `Objet cartes/${R}/objects/o2 : scène zz supprimée, élément ignoré`,
    );
    expect(m.lights[0]).toMatchObject({ mapId: c1, radius: 3, visible: true });
    expect(m.musicZones[0]).toMatchObject({ url: 'E8Ced6hW45', volume: 0.3, radius: 100 });
    expect(m.portals[0]).toMatchObject({
      kind: 'same_map',
      target: { x: 50, y: 60 },
      icon: 'stairs',
      targetMapId: null,
    });

    const kinds = m.obstacles.map((o) => [o.kind, o.mapId, (o.geom as unknown[]).length]);
    expect(kinds).toEqual([
      ['wall', c1, 2],
      ['door', c1, 2],
      ['one_way_wall', c1, 2],
      ['wall', c1, 2],
      ['wall', fond, 2],
      ['wall', fond, 2],
      ['wall', fond, 2],
      ['wall', fond, 2],
    ]);
    expect(m.obstacles[1]).toMatchObject({ isOpen: true });
    expect(m.obstacles[2]).toMatchObject({ direction: 'north' });

    expect(m.drawings[0]).toMatchObject({
      tool: 'line',
      geom: [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      createdBy: OWNER,
      width: 3,
    });
    // Le texte RTDB remplace sa copie Firestore (même id)
    expect(m.notes.map((n) => n.text)).toEqual(['nouveau texte', 'effacé depuis']);
    expect(m.notes[0]).toMatchObject({ fontSize: 20, pos: { x: 9, y: 9 } });
    // Salle déjà basculée sur la RTDB : les copies Firestore sont périmées
    const copied = transformRoom(
      R,
      docs,
      { ...rtdb, _migrations: { drawings_obstacles_notes: true } },
      mappings,
    );
    expect(copied.notes.map((n) => n.text)).toEqual(['nouveau texte']);
    expect(m.measurements).toHaveLength(1);
    expect(m.measurements[0]).toMatchObject({
      shape: 'cone',
      createdBy: 'dddddddd-0000-4000-8000-000000000001',
      options: { coneAngle: 60 },
    });
    expect(m.warnings).toContain('2 mesure(s) éphémère(s) ou incomplète(s) non migrée(s)');
  });
});
