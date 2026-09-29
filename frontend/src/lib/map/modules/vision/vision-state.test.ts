/**
 * Visibilité côté client, à blanc (sans WebGL) : adaptateur du contrat, choix des
 * observateurs, masquage, plan `allies`, audience du direct, et ce qui déclenche un calcul.
 */
import { describe, expect, it } from 'vitest';
import { geometryInput, lightInput, visionObject, visionToken } from './scene-adapter';
import { GM_VEIL } from './vision-state';
import { ALICE, GM, object, setup, token, wall } from './vision-test-kit';

describe('adaptateur contrat → @vtt/vision', () => {
  it('obstacles, zones, lumières, tokens et objets', () => {
    const t = setup({
      extra: {
        fogZones: [
          {
            id: 'b',
            version: 1,
            shape: 'circle',
            mode: 'clear',
            points: [],
            center: { x: 5, y: 5 },
            radius: 3,
            order: 2,
          },
          {
            id: 'a',
            version: 1,
            shape: 'rect',
            mode: 'fog',
            points: [
              { x: 0, y: 0 },
              { x: 9, y: 0 },
              { x: 9, y: 9 },
              { x: 0, y: 9 },
            ],
            center: null,
            radius: null,
            order: 1,
          },
        ],
      },
    });
    const g = geometryInput(t.store.getState());
    expect(g).toMatchObject({ width: 1000, height: 1000, fogFull: false });
    expect(g.obstacles[0]).toEqual({
      id: 'mur',
      kind: 'wall',
      points: [
        { x: 200, y: 0 },
        { x: 200, y: 1000 },
      ],
      blocksFrom: null,
      isOpen: false,
      opacity: 1,
    });
    expect(g.fogZones.map((z) => z.id)).toEqual(['b', 'a']);
    expect(
      lightInput({
        id: 'l',
        version: 1,
        pos: { x: 1, y: 2 },
        radius: 3,
        visible: false,
        falloff: 0.2,
        attachedTokenId: 'heros',
      }),
    ).toEqual({
      id: 'l',
      pos: { x: 1, y: 2 },
      radius: 3,
      visible: false,
      falloff: 0.2,
      attachedTokenId: 'heros',
    });
    const vt = visionToken(
      token('barde', 5, 6, { characterId: 'c-barde' }),
      { x: 7, y: 8 },
      new Set(['c-barde']),
    );
    expect(vt).toMatchObject({ pos: { x: 7, y: 8 }, playerSide: true, visibility: 'visible' });
    // Objet pendant un geste : la géométrie affichée (centre, taille) remplace la sienne
    expect(
      visionObject(object('coffre', 0, 0), { x: 50, y: 60, width: 20, height: 40, rotation: 90 }),
    ).toMatchObject({ pos: { x: 40, y: 40 }, width: 20, height: 40, rotation: 90 });
  });
});

describe('observateurs et masquage (joueur)', () => {
  it('PNJ derrière le mur masqué ; porte ouverte : vu ; objets et décors', () => {
    const t = setup({
      tokens: [token('orc', 300, 100), token('gob', 150, 150)],
      objects: [object('coffre', 290, 90), object('statue', 290, 90, { kind: 'decor' })],
    });
    t.run();
    expect(t.masked('orc')).toBe(true);
    expect(t.masked('gob')).toBe(false);
    expect(t.masked('coffre')).toBe(true);
    expect(t.masked('statue')).toBe(false);
    // Le mur devient une porte ouverte
    t.store
      .getState()
      .upsert('obstacles', [wall('mur', 200, 0, 1000, { kind: 'door', isOpen: true, version: 2 })]);
    t.run();
    expect(t.masked('orc')).toBe(false);
    expect(t.masked('coffre')).toBe(false);
  });

  it('personnage joueur hors de ma vue : au-dessus de l’ombre (plan allies), jamais masqué', () => {
    const t = setup({ tokens: [token('barde', 400, 400, { characterId: 'c-barde' })] });
    t.run();
    const barde = t.engine.entity('barde')!;
    expect(t.masked('barde')).toBe(false);
    expect(barde.plane).toBe('allies');
    // Porte ouverte : il est dans ma vue, il retrouve son calque
    t.store
      .getState()
      .upsert('obstacles', [wall('mur', 200, 0, 1000, { kind: 'door', isOpen: true, version: 2 })]);
    t.run();
    expect(barde.plane).toBe('content');
  });

  it('un allié voit pour moi ; aperçu d’un glisser : la vue suit la position en direct', () => {
    const t = setup({
      tokens: [token('garde', 600, 100, { visibility: 'ally' }), token('orc', 650, 150)],
    });
    t.run();
    expect(t.masked('orc')).toBe(false);
    expect(
      t.state
        .memberVision({ userId: 'alice', characterIds: ['c-heros'] })!
        .observers.map((o) => o.id),
    ).toEqual(['heros', 'garde']);

    const u = setup({ tokens: [token('orc', 300, 100)], obstacles: [wall('mur', 200, 0, 500)] });
    u.run();
    expect(u.masked('orc')).toBe(true);
    // Je glisse mon héros sous le bout du mur : l'orc apparaît sans rien écrire
    const heros = u.engine.entity('heros')!;
    u.engine.setPreview(heros, { ...heros.geometry, x: 150, y: 900 });
    u.run();
    expect(u.masked('orc')).toBe(false);
    u.engine.setPreview(heros, null);
    u.run();
    expect(u.masked('orc')).toBe(true);
  });

  it('obscurité, brume et vue d’en haut dans l’image à dessiner', () => {
    const t = setup();
    t.run();
    const p = t.state.picture()!;
    expect(p.darkness).toBeCloseTo(0.8);
    expect(p.viewers.map((v) => v.id)).toEqual(['heros']);
    expect(p.topDown).toBeNull();
    // Spectateur sans personnage : vue d'en haut
    const s = setup({ viewer: { userId: 'bob', role: 'spectator', characterIds: [] } });
    s.run();
    expect(s.state.picture()!.viewers).toEqual([]);
    expect(s.state.picture()!.topDown).toEqual([]);
  });
});

describe('MJ : voile et « Vue de… »', () => {
  it('par défaut tout visible, voile à 25 % ; vue d’un joueur : masquage exact', () => {
    const t = setup({
      viewer: GM,
      tokens: [token('orc', 300, 100), token('fantome', 120, 100, { visibility: 'invisible' })],
    });
    t.run();
    expect(t.masked('orc')).toBe(false);
    expect(t.state.picture()!.darkness).toBeCloseTo(0.8 * GM_VEIL);
    t.engine.setViewAs('alice');
    t.run();
    expect(t.state.mode).toBe('view-as');
    expect(t.masked('orc')).toBe(true);
    expect(t.masked('fantome')).toBe(true);
    expect(t.state.picture()!.darkness).toBeCloseTo(0.8);
    t.engine.setViewAs(null);
    t.run();
    expect(t.masked('orc')).toBe(false);
  });

  it('« Vue de… » : ce qui est rangé dans un calque masqué aux joueurs disparaît aussi', () => {
    const t = setup({ viewer: GM, tokens: [token('gob', 150, 150, { layerId: 'secret' })] });
    t.store
      .getState()
      .upsert('layers', [
        { id: 'secret', version: 1, name: 'Secret', sortOrder: 3, visibleToPlayers: false },
      ]);
    t.engine.registerKind({
      id: 'drawing',
      label: 'Dessin',
      collection: 'drawings',
      capabilities: ['select'],
      plane: 'annotations',
      stacking: {
        arrangeKind: 'drawing',
        layerId: {
          get: (d) => (d.layerId as string) ?? null,
          set: (d, v) => ({ ...d, layerId: v }),
        },
        z: { get: () => 0, set: (d) => d },
        optional: true,
      },
      geometry: () => ({ x: 10, y: 10, width: 5, height: 5, rotation: 0 }),
      can: () => true,
      persistence: {} as never,
    });
    t.store.getState().upsert('drawings', [
      { id: 'plan', version: 1, layerId: 'secret' },
      { id: 'note', version: 1, layerId: null },
    ]);
    t.run();
    expect(t.masked('gob')).toBe(false);
    expect(t.masked('plan')).toBe(false);
    t.engine.setViewAs('alice');
    t.run();
    expect(t.masked('gob')).toBe(true);
    expect(t.masked('plan')).toBe(true);
    expect(t.masked('note')).toBe(false);
    t.engine.setViewAs(null);
    t.run();
    expect(t.masked('plan')).toBe(false);
  });

  it('retour à la vue du MJ : plus de plan forcé ni de masque', () => {
    const t = setup({ viewer: GM, tokens: [token('barde', 400, 400, { characterId: 'c-barde' })] });
    t.engine.setViewAs('alice');
    t.run();
    expect(t.engine.entity('barde')!.plane).toBe('allies');
    t.engine.setViewAs(null);
    t.run();
    expect(t.engine.entity('barde')!.plane).toBe('content');
  });
});

describe('audience du direct (client du MJ)', () => {
  it('vu de certains joueurs : eux seuls ; de tous : public ; de personne ou caché : MJ', () => {
    const t = setup({
      viewer: GM,
      tokens: [
        token('barde', 700, 100, { characterId: 'c-barde' }),
        token('orc', 650, 150),
        token('gob', 150, 150),
        token('fantome', 150, 120, { visibility: 'invisible' }),
        token('rodeur', 600, 900, { visibility: 'hidden' }),
      ],
      objects: [object('coffre', 690, 90)],
      extra: { drawings: [] },
    });
    t.run();
    const audience = (id: string) => t.state.audience(t.engine.entity(id)!);
    expect(audience('orc')).toEqual({ users: ['bob'] });
    expect(audience('gob')).toEqual({ users: ['alice'] });
    expect(audience('coffre')).toEqual({ users: ['bob'] });
    expect(audience('barde')).toBe('public');
    expect(audience('fantome')).toBe('gm');
    expect(audience('rodeur')).toBe('gm');
    // Pendant un glisser, à la position affichée
    const orc = t.engine.entity('orc')!;
    t.engine.setPreview(orc, { ...orc.geometry, x: 150, y: 100 });
    t.run();
    expect(audience('orc')).toEqual({ users: ['alice'] });
    // Le résolveur du moteur passe par ici
    expect(t.engine.liveAudience('orc')).toEqual(t.engine.liveAudience('orc'));
  });

  it('sans annuaire des joueurs : règle par défaut du moteur', () => {
    const t = setup({ viewer: GM, players: null, tokens: [token('orc', 300, 100)] });
    t.run();
    expect(t.state.audience(t.engine.entity('orc')!)).toBe('public');
  });
});

describe('invalidations : ce qui déclenche un calcul', () => {
  it('rien de neuf : rien ; PNJ qui bouge : aucune vue refaite ; mon token : la sienne seule', () => {
    const t = setup({
      tokens: [token('orc', 300, 100), token('garde', 600, 100, { visibility: 'ally' })],
    });
    t.run();
    const views = t.state.viewsComputed;
    const prepared = t.state.stats.summary().prepare!.count;
    expect(t.state.sync()).toBe(false);
    // Une couche sans rapport (dessins)
    t.store.getState().upsert('drawings', [{ id: 'd', version: 1, mapId: 'carte', points: [] }]);
    expect(t.state.sync()).toBe(false);
    // Le PNJ bouge : ni scène ni vue refaites
    const orc = t.engine.entity('orc')!;
    t.engine.setPreview(orc, { ...orc.geometry, x: 320 });
    expect(t.state.sync()).toBe(true);
    expect(t.state.viewsComputed).toBe(views);
    // Mon héros bouge : sa vue seule
    const heros = t.engine.entity('heros')!;
    t.engine.setPreview(heros, { ...heros.geometry, x: 110 });
    t.state.sync();
    expect(t.state.viewsComputed).toBe(views + 1);
    // Une lumière : pas de nouvelle préparation des murs
    t.store.getState().upsert('lights', [
      {
        id: 'l',
        version: 1,
        mapId: 'carte',
        pos: { x: 500, y: 500 },
        radius: 2,
        visible: true,
        falloff: 0.5,
        color: '#ffcc88',
        intensity: 1,
        attachedTokenId: null,
      },
    ]);
    t.state.sync();
    expect(t.state.stats.summary().prepare!.count).toBe(prepared);
    expect(t.state.picture()!.lights.map((l) => l.area.id)).toEqual(['l']);
    // Un mur : la scène est refaite
    t.store.getState().upsert('obstacles', [wall('mur2', 400, 0, 1000)]);
    t.state.sync();
    expect(t.state.stats.summary().prepare!.count).toBe(prepared + 1);
  });

  it('une torche suit son token pendant un glisser', () => {
    const t = setup({
      extra: {
        lights: [
          {
            id: 'torche',
            version: 1,
            mapId: 'carte',
            pos: { x: 0, y: 0 },
            radius: 1,
            visible: true,
            falloff: 0.5,
            color: '#ffcc88',
            intensity: 1,
            attachedTokenId: 'heros',
          },
        ],
      },
    });
    t.run();
    expect(t.state.picture()!.lights[0]!.area.center).toEqual({ x: 100, y: 100 });
    const v = t.state.picture()!.versions.lights;
    const heros = t.engine.entity('heros')!;
    t.engine.setPreview(heros, { ...heros.geometry, x: 120, y: 130 });
    t.run();
    expect(t.state.picture()!.lights[0]!.area.center).toEqual({ x: 120, y: 130 });
    expect(t.state.picture()!.versions.lights).toBe(v + 1);
  });
});
