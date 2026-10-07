import { MAP_BATCH_MAX, PackContent, type MapSnapshot } from '@vtt/contracts';
import { describe, expect, it, vi } from 'vitest';
import { catalogQuery, DEFAULT_FILTERS } from './api';
import { countsLabel, creatorShare, parsePrice, priceInput, priceLabel } from './format';
import {
  campaignInstallClient,
  planInstall,
  runInstall,
  stepKey,
  type InstallClient,
} from './installer';
import { buildPack, stackedObjects, withoutUrls } from './pack-builder';

vi.mock('../api', () => ({ api: vi.fn(async () => ({ id: 'cree' })) }));

const BG = 'https://assets.test/campaigns/0192a0e0-0000-7000-8000-000000000001/fond.webp';
const IMG = 'https://assets.test/campaigns/0192a0e0-0000-7000-8000-000000000001/coffre.webp';

const element = (id: string) => ({ id, mapId: 'm', version: 1, updatedAt: '' });

function snapshot(): MapSnapshot {
  return {
    map: {
      id: 'm',
      name: 'Crypte',
      description: 'Humide',
      groupId: 'dossier',
      backgroundUrl: BG,
      isDefault: true,
      visibleToPlayers: true,
      spawn: { x: 1, y: 2 },
      width: 2000,
      height: 1000,
      weather: null,
      display: { fog: true },
      fogFull: true,
      exploration: 'off',
      grids: [],
      version: 3,
      updatedAt: '',
    },
    layers: [
      {
        ...element('haut'),
        name: 'Objets',
        sortOrder: 2,
        visibleToPlayers: true,
        locked: false,
        opacity: 1,
        role: 'objects',
      },
      {
        ...element('sol'),
        name: 'Sol',
        sortOrder: 1,
        visibleToPlayers: true,
        locked: false,
        opacity: 1,
        role: 'ground',
      },
    ],
    tokens: [],
    objects: [
      {
        ...element('coffre'),
        name: 'Coffre',
        kind: 'item',
        imageUrl: IMG,
        pos: { x: 0, y: 0 },
        width: 10,
        height: 10,
        rotation: 0,
        layerId: 'haut',
        z: 0,
        isLocked: false,
        visibility: 'custom',
        visibleTo: ['perso'],
        notes: null,
        items: [],
        linkedId: 'x',
        groupEntityId: null,
        searchable: true,
        searchRadius: 2,
      },
      {
        ...element('tapis'),
        name: 'Tapis',
        kind: 'decor',
        imageUrl: IMG,
        pos: { x: 0, y: 0 },
        width: 10,
        height: 10,
        rotation: 0,
        layerId: 'sol',
        z: 5,
        isLocked: true,
        visibility: 'visible',
        visibleTo: [],
        notes: null,
        items: [],
        linkedId: null,
        groupEntityId: null,
        searchable: false,
        searchRadius: 0,
      },
    ],
    lights: [
      {
        ...element('l1'),
        name: 'Torche',
        pos: { x: 1, y: 1 },
        radius: 4,
        visible: true,
        color: '#ffaa00',
        intensity: 1,
        falloff: 0.5,
        attachedTokenId: null,
      },
      {
        ...element('l2'),
        name: 'Lanterne',
        pos: { x: 1, y: 1 },
        radius: 4,
        visible: true,
        color: '#ffaa00',
        intensity: 1,
        falloff: 0.5,
        attachedTokenId: 'token',
      },
    ],
    obstacles: [
      {
        ...element('o1'),
        kind: 'wall',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        blocksFrom: null,
        isOpen: false,
        isLocked: false,
        color: null,
        opacity: 1,
        roomMode: null,
      },
    ],
    rooms: [],
    fogZones: [],
    drawings: [],
    notes: [],
    musicZones: [],
    portals: [],
    measurements: [],
  } as MapSnapshot;
}

describe('composeur de pack', () => {
  it('garde la scène, retire ce qui est propre à la campagne', () => {
    const pack = PackContent.parse(
      buildPack({
        systemId: 'dnd5e',
        scenes: [snapshot()],
        npcTemplates: [
          {
            id: 'n',
            name: 'Goule',
            imageUrl: IMG,
            tokenUrl: '/local.png',
            actions: [],
            etat: { systeme: 'dnd5e' },
          },
          { id: 'x', name: 'Illisible', imageUrl: null, tokenUrl: null, actions: [], etat: null },
        ],
        objectTemplates: [{ id: 'o', name: 'Tonneau', imageUrl: IMG, category: 'custom' }],
      }),
    );
    const scene = pack.scenes[0]!;
    expect(scene.scene).not.toHaveProperty('groupId');
    expect(scene.scene).not.toHaveProperty('isDefault');
    expect(scene.lights.map((l) => l.name)).toEqual(['Torche']);
    // Empilement : le tapis du sol sous le coffre, réservé devenu caché, sans lien
    expect(scene.objects.map((o) => [o.name, o.z, o.visibility])).toEqual([
      ['Tapis', 0, 'visible'],
      ['Coffre', 1, 'hidden'],
    ]);
    expect(scene.objects[1]).not.toHaveProperty('linkedId');
    expect(pack.npcTemplates.map((t) => [t.name, t.tokenUrl])).toEqual([['Goule', null]]);
    expect(pack.systemId).toBe('dnd5e');
  });

  it('sans PNJ, pas de système', () => {
    const pack = buildPack({
      systemId: 'dnd5e',
      scenes: [snapshot()],
      npcTemplates: [],
      objectTemplates: [],
    });
    expect(pack.systemId).toBeNull();
  });

  it('retire les adresses refusées', () => {
    const pack = withoutUrls(
      buildPack({
        systemId: null,
        scenes: [snapshot()],
        npcTemplates: [],
        objectTemplates: [{ id: 'o', name: 'Tonneau', imageUrl: IMG, category: null }],
      }),
      [BG, IMG],
    );
    expect(pack.scenes![0]!.scene.backgroundUrl).toBeNull();
    expect(pack.scenes![0]!.objects!.every((o) => o.imageUrl === '')).toBe(true);
    expect(pack.objectTemplates![0]!.imageUrl).toBeNull();
    expect(PackContent.safeParse(pack).success).toBe(true);
  });

  it('ordonne les objets par calque puis par z', () => {
    expect(stackedObjects(snapshot()).map((o) => o.id)).toEqual(['tapis', 'coffre']);
  });
});

describe('installation', () => {
  const content = () =>
    PackContent.parse({
      ...buildPack({
        systemId: 'dnd5e',
        scenes: [snapshot()],
        npcTemplates: [
          { id: 'n', name: 'Goule', imageUrl: null, tokenUrl: null, actions: [], etat: {} },
        ],
        objectTemplates: [{ id: 'o', name: 'Tonneau', imageUrl: IMG, category: null }],
      }),
    });

  it('écarte les PNJ d’un autre système, découpe les lots', () => {
    const big = content();
    big.scenes[0]!.obstacles = Array.from(
      { length: MAP_BATCH_MAX + 1 },
      () => big.scenes[0]!.obstacles[0]!,
    );
    const plan = planInstall(big, { campaignSystemId: 'swrpg', title: 'Crypte' });
    expect(plan.skipped).toBe(1);
    expect(plan.counts).toEqual({ scenes: 1, npcTemplates: 0, objectTemplates: 1 });
    expect(plan.steps.map((s) => s.kind)).toEqual([
      'object-template',
      'scene',
      'layer',
      'layer',
      'layer',
      'layer',
    ]);
    const scene = plan.steps[1] as { body: { isDefault: boolean; visibleToPlayers: boolean } };
    expect([scene.body.isDefault, scene.body.visibleToPlayers]).toEqual([false, false]);
  });

  it('exécute dans l’ordre, relie catégorie et scène, clés stables', async () => {
    const plan = planInstall(content(), { campaignSystemId: 'dnd5e', title: 'Crypte' });
    const calls: string[] = [];
    const client: InstallClient = {
      createObjectTemplate: async (_b, key) => void calls.push(`objet ${key}`),
      createNpcCategory: async (name, key) => (
        calls.push(`catégorie ${name} ${key}`),
        { id: 'cat' }
      ),
      createNpcTemplate: async (b, key) => void calls.push(`pnj ${b.categoryId} ${key}`),
      createScene: async (_b, key) => (calls.push(`scène ${key}`), { id: 'carte' }),
      batch: async (mapId, path, items, key) =>
        void calls.push(`${path} ${mapId} ${items.length} ${key}`),
    };
    const progress: number[] = [];
    const created = await runInstall(plan, client, 'inst', (done) => progress.push(done));
    expect(created).toEqual({ scenes: 1, npcTemplates: 1, objectTemplates: 1, skipped: 0 });
    expect(calls).toEqual([
      `objet ${stepKey('inst', 0)}`,
      `catégorie Crypte ${stepKey('inst', 1)}`,
      `pnj cat ${stepKey('inst', 2)}`,
      `scène ${stepKey('inst', 3)}`,
      `obstacles carte 1 ${stepKey('inst', 4)}`,
      `lights carte 1 ${stepKey('inst', 5)}`,
      `objects carte 2 ${stepKey('inst', 6)}`,
    ]);
    expect(progress.at(-1)).toBe(plan.steps.length);
    expect(stepKey('0192a0e0-0000-7000-8000-000000000001', 12)).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('le client réel envoie la clé d’idempotence', async () => {
    const { api } = await import('../api');
    await campaignInstallClient('camp').createScene({ name: 'S' }, 'mkt-x-1');
    expect(api).toHaveBeenCalledWith('/v1/campaigns/camp/maps', {
      method: 'POST',
      body: JSON.stringify({ name: 'S' }),
      headers: { 'idempotency-key': 'mkt-x-1' },
    });
  });
});

describe('formats', () => {
  it('prix, part du créateur, saisie', () => {
    expect(priceLabel(0)).toBe('Gratuit');
    expect(priceLabel(499)).toMatch(/^4,99\s€$/);
    expect(creatorShare(1000)).toBe(850);
    expect(creatorShare(200)).toBe(150);
    expect(parsePrice('12,5')).toBe(1250);
    expect(parsePrice('4.99 €')).toBe(499);
    expect(parsePrice('')).toBe(0);
    expect(parsePrice('douze')).toBeNull();
    expect(priceInput(1250)).toBe('12,50');
  });

  it('contenu et requête du catalogue', () => {
    expect(countsLabel({ scenes: 2, npcTemplates: 1, objectTemplates: 0 })).toBe(
      '2 scènes · 1 PNJ',
    );
    expect(catalogQuery(DEFAULT_FILTERS)).toBe('');
    expect(
      catalogQuery({ ...DEFAULT_FILTERS, q: ' crypte ', kind: 'npcs', safe: true, page: 2 }),
    ).toBe('?q=crypte&kind=npcs&safe=1&page=2');
  });
});
