/**
 * Règles de visibilité du serveur (vision-rules.ts), sans base : mêmes cas que le miroir du
 * client (frontend/src/lib/map/modules/vision/rules.test.ts).
 */
import { prepareScene, withLights } from '@vtt/vision';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_SIZE,
  foggedScene,
  geometryScene,
  lightsKey,
  lightsOf,
  MapVision,
  type GeometryInput,
  type LightInput,
  type VisionObject,
  type VisionToken,
} from './vision-rules.js';

const square = (x: number, y: number, w: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + w },
  { x, y: y + w },
];

const token = (
  id: string,
  x: number,
  y: number,
  extra: Partial<VisionToken> = {},
): VisionToken => ({
  id,
  characterId: `perso-${id}`,
  pos: { x, y },
  scale: 1,
  visionRadius: 100,
  visibility: 'visible',
  visibleTo: [],
  layerId: 'persos',
  playerSide: false,
  ...extra,
});

const object = (
  id: string,
  x: number,
  y: number,
  extra: Partial<VisionObject> = {},
): VisionObject => ({
  id,
  kind: 'item',
  pos: { x, y },
  width: 20,
  height: 20,
  rotation: 0,
  visibility: 'visible',
  visibleTo: [],
  layerId: 'objets',
  ...extra,
});

const geometry = (extra: Partial<GeometryInput> = {}): GeometryInput => ({
  width: 1000,
  height: 1000,
  fogFull: false,
  display: {},
  obstacles: [],
  rooms: [],
  fogZones: [],
  ...extra,
});

/** Carte 1000 × 1000, héros d'Alice en (100, 100), rayon 100, 50 px par case. */
function mapVision(
  g: Partial<GeometryInput> = {},
  tokens: VisionToken[] = [],
  lights: LightInput[] = [],
  hiddenLayers: string[] = [],
) {
  const all = [token('heros', 100, 100, { playerSide: true }), ...tokens];
  const scene = geometryScene(geometry(g));
  const byId = new Map(all.map((t) => [t.id, t.pos]));
  const lit = lightsOf(lights, (id) => byId.get(id), 50);
  const vision = new MapVision({
    prep: withLights(prepareScene(scene), lit),
    fogged: () => withLights(prepareScene(foggedScene(scene)), lit),
    tokens: all,
    hiddenLayers: new Set(hiddenLayers),
    pixelsPerUnit: 50,
    tokenScale: 1,
  });
  return {
    alice: vision.forMember({ userId: 'alice', characterIds: ['perso-heros'] }),
    bob: vision.forMember({ userId: 'bob', characterIds: [] }),
    vision,
    t: (id: string) => all.find((x) => x.id === id)!,
  };
}

const wall = (id: string, x: number, y0: number, y1: number, extra = {}) => ({
  id,
  kind: 'wall' as const,
  points: [
    { x, y: y0 },
    { x, y: y1 },
  ],
  blocksFrom: null,
  isOpen: false,
  opacity: 1,
  ...extra,
});

describe('scène de visibilité', () => {
  it('convertit obstacles, pièces et zones ; ordre des zones ; taille par défaut', () => {
    const scene = geometryScene(
      geometry({
        width: null,
        obstacles: [
          wall('m', 10, 0, 50),
          {
            id: 'p',
            kind: 'door',
            points: square(0, 0, 10),
            blocksFrom: null,
            isOpen: true,
            opacity: 1,
          },
        ],
        rooms: [{ id: 'r', points: square(0, 0, 50) }],
        fogZones: [
          {
            id: 'b',
            shape: 'circle',
            mode: 'clear',
            points: [],
            center: { x: 5, y: 5 },
            radius: 3,
            order: 2,
          },
          {
            id: 'a',
            shape: 'rect',
            mode: 'fog',
            points: square(0, 0, 9),
            center: null,
            radius: null,
            order: 1,
          },
          {
            id: 'x',
            shape: 'circle',
            mode: 'fog',
            points: [],
            center: null,
            radius: null,
            order: 3,
          },
        ],
      }),
    );
    expect(scene.bounds).toEqual({ width: DEFAULT_MAP_SIZE, height: DEFAULT_MAP_SIZE });
    expect(scene.segments).toHaveLength(4);
    expect(scene.segments[1]).toMatchObject({
      id: 'p',
      kind: 'door',
      open: true,
      blocksFrom: 'left',
    });
    expect(scene.fogZones!.map((z) => z.id)).toEqual(['a', 'b']);
    expect(scene.rooms).toHaveLength(1);
    // Occlusion coupée par le MJ (affichage des obstacles) : ni murs ni pièces
    const off = geometryScene(
      geometry({ display: { obstacles: false }, obstacles: [wall('m', 1, 0, 9)] }),
    );
    expect(off.segments).toEqual([]);
    expect(off.rooms).toEqual([]);
  });

  it('lumières : rayon en pixels, torche là où est son token ; clé stable', () => {
    const lights = lightsOf(
      [
        {
          id: 'l',
          pos: { x: 1, y: 2 },
          radius: 2,
          visible: true,
          falloff: 0.5,
          attachedTokenId: null,
        },
        {
          id: 't',
          pos: { x: 0, y: 0 },
          radius: 1,
          visible: false,
          falloff: 0,
          attachedTokenId: 'k',
        },
      ],
      (id) => (id === 'k' ? { x: 50, y: 60 } : undefined),
      50,
    );
    expect(lights).toEqual([
      { id: 'l', pos: { x: 1, y: 2 }, radius: 100, falloff: 0.5, on: true },
      { id: 't', pos: { x: 50, y: 60 }, radius: 50, falloff: 0, on: false },
    ]);
    expect(lightsKey(lights)).toBe(lightsKey([...lights]));
  });
});

describe('ce qu’un joueur voit', () => {
  it('mur opaque : caché ; porte ouverte, fenêtre ou mur translucide : vu', () => {
    const npc = token('orc', 180, 100);
    expect(mapVision({}, [npc]).alice.seesToken(npc)).toBe(true);
    expect(mapVision({ obstacles: [wall('m', 140, 0, 300)] }, [npc]).alice.seesToken(npc)).toBe(
      false,
    );
    for (const extra of [{ kind: 'door', isOpen: true }, { kind: 'window' }, { opacity: 0.5 }])
      expect(
        mapVision({ obstacles: [wall('m', 140, 0, 300, extra)] }, [npc]).alice.seesToken(npc),
      ).toBe(true);
    // Porte fermée
    expect(
      mapVision({ obstacles: [wall('m', 140, 0, 300, { kind: 'door' })] }, [npc]).alice.seesToken(
        npc,
      ),
    ).toBe(false);
    // Affichage des obstacles coupé par le MJ : plus d'occlusion
    expect(
      mapVision({ display: { obstacles: false }, obstacles: [wall('m', 140, 0, 300)] }, [
        npc,
      ]).alice.seesToken(npc),
    ).toBe(true);
  });

  it('mur à sens unique : bloque depuis son côté seulement', () => {
    const npc = token('orc', 180, 100);
    // Tracé vers le bas : sa gauche est à l'est, le héros est à l'ouest (à droite)
    const oneWay = (blocksFrom: 'left' | 'right') => ({
      ...wall('s', 140, 0, 300),
      kind: 'one_way_wall' as const,
      blocksFrom,
    });
    expect(mapVision({ obstacles: [oneWay('left')] }, [npc]).alice.seesToken(npc)).toBe(true);
    expect(mapVision({ obstacles: [oneWay('right')] }, [npc]).alice.seesToken(npc)).toBe(false);
  });

  it('pièce fermée : ni dedans depuis dehors, ni dehors depuis dedans ; porte ouverte : vue', () => {
    const inside = token('orc', 300, 100);
    const room = { id: 'cave', points: square(250, 50, 100) };
    const door = (isOpen: boolean) => ({
      id: 'porte',
      kind: 'door' as const,
      points: [
        { x: 250, y: 80 },
        { x: 250, y: 120 },
      ],
      blocksFrom: null,
      isOpen,
      opacity: 1,
    });
    expect(mapVision({ rooms: [room] }, [inside]).alice.seesToken(inside)).toBe(false);
    expect(
      mapVision({ rooms: [room], obstacles: [door(false)] }, [inside]).alice.seesToken(inside),
    ).toBe(false);
    expect(
      mapVision({ rooms: [room], obstacles: [door(true)] }, [inside]).alice.seesToken(inside),
    ).toBe(true);
    // Héros dedans, PNJ dehors
    const out = token('gob', 100, 300);
    const t = mapVision({ rooms: [{ id: 'cave', points: square(0, 0, 200) }] }, [out]);
    expect(t.alice.seesToken(out)).toBe(false);
  });

  it('brouillard : vu dans le rayon de vision ou éclairé ; `hidden` jamais hors de ces zones', () => {
    const far = token('orc', 600, 600);
    const fog = {
      fogZones: [
        {
          id: 'z',
          shape: 'rect' as const,
          mode: 'fog' as const,
          points: square(500, 500, 200),
          center: null,
          radius: null,
          order: 1,
        },
      ],
    };
    expect(mapVision({}, [far]).alice.seesToken(far)).toBe(true);
    expect(mapVision(fog, [far]).alice.seesToken(far)).toBe(false);
    expect(mapVision({ fogFull: true }, [far]).alice.seesToken(far)).toBe(false);
    const torch: LightInput = {
      id: 'l',
      pos: { x: 650, y: 600 },
      radius: 2,
      visible: true,
      falloff: 0.5,
      attachedTokenId: null,
    };
    expect(mapVision(fog, [far], [torch]).alice.seesToken(far)).toBe(true);
    expect(mapVision(fog, [far], [{ ...torch, visible: false }]).alice.seesToken(far)).toBe(false);
    // Une lumière derrière un mur n'éclaire pas l'autre côté
    const shielded = mapVision(
      { ...fog, obstacles: [wall('m', 620, 400, 800)] },
      [far],
      [{ ...torch, pos: { x: 640, y: 600 } }],
    );
    expect(shielded.alice.seesToken(far)).toBe(false);
    // `hidden` : hors brouillard mais hors de portée, caché ; dans le rayon, vu
    const hidden = token('espion', 600, 100, { visibility: 'hidden' });
    expect(mapVision({}, [hidden]).alice.seesToken(hidden)).toBe(false);
    const near = token('espion', 150, 100, { visibility: 'hidden' });
    expect(mapVision({}, [near]).alice.seesToken(near)).toBe(true);
    expect(
      mapVision({}, [hidden], [{ ...torch, pos: { x: 600, y: 120 } }]).alice.seesToken(hidden),
    ).toBe(true);
  });

  it('calque masqué, invisible, custom, camp des joueurs, allié (qui voit pour les joueurs)', () => {
    const secret = token('orc', 150, 100, { layerId: 'embuscade' });
    const mine = token('familier', 900, 900, {
      characterId: 'perso-heros-2',
      layerId: 'embuscade',
    });
    const t = mapVision({}, [secret], [], ['embuscade']);
    expect(t.alice.seesToken(secret)).toBe(false);
    const own = mapVision({}, [mine], [], ['embuscade']);
    const alice2 = own.vision.forMember({
      userId: 'alice',
      characterIds: ['perso-heros', 'perso-heros-2'],
    });
    expect(alice2.seesToken(mine)).toBe(true);
    // Son propre token, même dans un calque masqué, est un observateur
    expect(alice2.observers.map((o) => o.id)).toEqual(['heros', 'familier']);

    const ghost = token('fantome', 110, 100, { visibility: 'invisible' });
    expect(mapVision({}, [ghost]).alice.seesToken(ghost)).toBe(false);
    const whisper = token('ombre', 900, 900, { visibility: 'custom', visibleTo: ['perso-heros'] });
    const w = mapVision({ obstacles: [wall('m', 500, 0, 1000)] }, [whisper]);
    expect(w.alice.seesToken(whisper)).toBe(true);
    expect(w.bob.seesToken(whisper)).toBe(false);

    const other = token('barde', 900, 900, { playerSide: true });
    const ally = token('garde', 900, 900, { visibility: 'ally' });
    const npc = token('orc', 920, 900);
    const a = mapVision({ obstacles: [wall('m', 500, 0, 1000)] }, [other, ally, npc]);
    expect(a.alice.seesToken(other)).toBe(true);
    expect(a.alice.seesToken(ally)).toBe(true);
    // L'allié voit le PNJ pour Alice, derrière le mur
    expect(a.alice.observers.map((o) => o.id)).toEqual(['heros', 'garde']);
    expect(a.alice.seesToken(npc)).toBe(true);
    // Allié dans un calque masqué : ni vu, ni observateur
    const hid = mapVision(
      { obstacles: [wall('m', 500, 0, 1000)] },
      [{ ...ally, layerId: 'embuscade' }, npc],
      [],
      ['embuscade'],
    );
    expect(hid.alice.observers.map((o) => o.id)).toEqual(['heros']);
    expect(hid.alice.seesToken(npc)).toBe(false);
  });

  it('sans observateur : vue d’en haut, hors brouillard et pièces fermées, ou éclairé', () => {
    const open = token('orc', 600, 100);
    const t = mapVision({ obstacles: [wall('m', 500, 0, 1000)] }, [open]);
    expect(t.bob.observers).toEqual([]);
    expect(t.bob.seesToken(open)).toBe(true);
    const fog = {
      fogZones: [
        {
          id: 'z',
          shape: 'circle' as const,
          mode: 'fog' as const,
          points: [],
          center: { x: 600, y: 100 },
          radius: 50,
          order: 1,
        },
      ],
    };
    expect(mapVision(fog, [open]).bob.seesToken(open)).toBe(false);
    const torch: LightInput = {
      id: 'l',
      pos: { x: 600, y: 100 },
      radius: 1,
      visible: true,
      falloff: 0,
      attachedTokenId: null,
    };
    expect(mapVision(fog, [open], [torch]).bob.seesToken(open)).toBe(true);
    const room = { rooms: [{ id: 'cave', points: square(550, 50, 100) }] };
    expect(mapVision(room, [open]).bob.seesToken(open)).toBe(false);
    const hidden = token('espion', 600, 100, { visibility: 'hidden' });
    expect(mapVision({}, [hidden]).bob.seesToken(hidden)).toBe(false);
    expect(mapVision({}, [hidden], [torch]).bob.seesToken(hidden)).toBe(true);
  });

  it('échantillons du token : vu dès qu’un bord dépasse du mur', () => {
    // Centre caché derrière le coin du mur, bord visible (rayon 25 px)
    const npc = token('orc', 300, 195);
    const t = mapVision({ obstacles: [wall('m', 200, 0, 150)] }, [npc]);
    expect(t.alice.seesToken(npc)).toBe(true);
    const tiny = mapVision({ obstacles: [wall('m', 200, 0, 150)] }, [{ ...npc, scale: 0.1 }]);
    expect(tiny.alice.seesToken({ ...npc, scale: 0.1 })).toBe(false);
  });

  it('objets : décor jamais filtré, objet derrière un mur caché, custom, masqué', () => {
    const behind = object('coffre', 300, 90);
    const g = { obstacles: [wall('m', 200, 0, 1000)] };
    const t = mapVision(g);
    expect(t.alice.seesObject(behind)).toBe(false);
    expect(t.alice.seesObject({ ...behind, kind: 'decor' })).toBe(true);
    expect(t.alice.seesObject({ ...behind, kind: 'decor', visibility: 'hidden' })).toBe(false);
    expect(
      t.alice.seesObject({ ...behind, visibility: 'custom', visibleTo: ['perso-heros'] }),
    ).toBe(true);
    expect(mapVision().alice.seesObject(behind)).toBe(true);
    expect(mapVision({}, [], [], ['objets']).alice.seesObject({ ...behind, kind: 'decor' })).toBe(
      false,
    );
    // Rectangle tourné : un coin dépasse du mur
    const big = object('table', 150, 50, { width: 100, height: 20, rotation: 0 });
    expect(t.alice.seesObject(big)).toBe(true);
  });
});
