import { describe, expect, it, vi } from 'vitest';
import type * as Pixi from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import type { RenderContext } from '../../engine/entities/entity-kind';
import { ScreenSpace } from '../../engine/screen-space';
import { objectCan } from './object-kind';
import { imageAspect } from './object-view';
import { GM, obj, PLAYER, SPECTATOR, setupObjects, token } from './objects-test-kit';
import { fitObjects, scaleObjects, setObjectKind, setSearchable } from './placement';
import type { ObjectData } from './types';

describe('sorte « objet »', () => {
  it('déclare les capacités communes et se range dans le calque des objets', () => {
    const t = setupObjects({ objects: [obj('coffre', 100, 100)] });
    const [kind, decor] = t.kinds;
    expect(kind.id).toBe('object');
    expect(decor.id).toBe('decor');
    expect([...kind.capabilities].sort()).toEqual(
      [
        'select',
        'move',
        'rotate',
        'resize',
        'lock',
        'hide',
        'restrictTo',
        'duplicate',
        'delete',
        'inspect',
        'order',
      ].sort(),
    );
    const e = t.engine.entity('coffre')!;
    expect(e.plane).toBe('content');
    expect(e.layerId).toBe('objets');
    // Sans calque : celui du rôle « objets »
    t.store.getState().upsert('objects', [obj('orphelin', 0, 0, { layerId: undefined })]);
    expect(t.engine.entity('orphelin')!.layerId).toBe('objets');
  });

  it('géométrie : pos est le coin haut gauche, la rotation se fait autour du centre', () => {
    const t = setupObjects({ objects: [obj('barre', 100, 100, { rotation: 90 })] });
    const e = t.engine.entity('barre')!;
    expect(e.geometry).toEqual({ x: 150, y: 125, width: 100, height: 50, rotation: 90 });
    // Debout : x ∈ [125, 175], y ∈ [75, 175]
    expect(t.engine.hitTest({ x: 150, y: 80 })?.id).toBe('barre');
    expect(t.engine.hitTest({ x: 110, y: 125 })).toBeNull();
    const kind = t.kinds[0];
    const moved = kind.applyGeometry!(
      e.data as ObjectData,
      { ...e.geometry, x: 300 },
      t.engine.kindContext(),
    );
    expect(moved.pos).toEqual({ x: 250, y: 100 });
    expect(moved.rotation).toBe(90);
  });

  it('glisser : une commande, aimantée à la grille ; verrouillé : ne bouge pas', async () => {
    const t = setupObjects({
      objects: [obj('a', 100, 100), obj('b', 400, 100, { isLocked: true })],
    });
    t.drag({ x: 150, y: 125 }, { x: 212, y: 170 });
    await t.commands.idle();
    expect(t.object('a')!.pos).toEqual({ x: 150, y: 150 });
    expect(t.objects.update).toHaveBeenCalledTimes(1);
    expect(t.objects.update.mock.calls[0]![0][0]!.changes).toEqual({ pos: { x: 150, y: 150 } });
    t.drag({ x: 450, y: 125 }, { x: 600, y: 300 });
    await t.commands.idle();
    expect(t.object('b')!.pos).toEqual({ x: 400, y: 100 });
  });

  it('droits : le MJ fait tout ; un joueur ne touche qu’un objet à fouiller ; un spectateur regarde', () => {
    const t = setupObjects({
      viewer: PLAYER,
      objects: [obj('table', 100, 100), obj('coffre', 400, 100, { searchable: true })],
    });
    const table = t.engine.entity('table')! as unknown as MapEntity<ObjectData>;
    const coffre = t.engine.entity('coffre')! as unknown as MapEntity<ObjectData>;
    // Le clic passe à travers la table ; le coffre se sélectionne mais ne bouge pas
    expect(t.engine.hitTest({ x: 150, y: 125 })).toBeNull();
    expect(t.engine.hitTest({ x: 450, y: 125 })?.id).toBe('coffre');
    expect(t.engine.movableSelection(coffre as unknown as MapEntity)).toEqual([]);
    for (const action of [
      'move',
      'rotate',
      'resize',
      'lock',
      'hide',
      'delete',
      'duplicate',
    ] as const)
      expect(objectCan(action, coffre, PLAYER)).toBe(false);
    expect(objectCan('inspect', coffre, PLAYER)).toBe(true);
    expect(objectCan('select', table, PLAYER)).toBe(false);
    expect(objectCan('view', table, PLAYER)).toBe(true);
    expect(objectCan('select', coffre, SPECTATOR)).toBe(false);
    expect(objectCan('delete', table, GM)).toBe(true);
  });

  it('masquer garde « visible pour… » ; « Tous les joueurs » le rend public', async () => {
    const t = setupObjects({ objects: [obj('a', 100, 100)] });
    const e = () => t.engine.entity('a')!;
    await t.engine.setRestrictedTo([e()], ['aldric']);
    expect(t.object('a')).toMatchObject({ visibility: 'custom', visibleTo: ['aldric'] });
    await t.engine.setHidden([e()], true);
    expect(t.object('a')).toMatchObject({ visibility: 'hidden', visibleTo: ['aldric'] });
    expect(e().state.hiddenForPlayers).toBe(true);
    await t.engine.setHidden([e()], false);
    expect(t.object('a')!.visibility).toBe('custom');
    await t.engine.setRestrictedTo([e()], null);
    expect(t.object('a')).toMatchObject({ visibility: 'visible', visibleTo: [] });
    await t.engine.setLocked([e()], true);
    expect(t.object('a')!.isLocked).toBe(true);
    expect(e().state.locked).toBe(true);
  });

  it('direct : masqué ou calque masqué → MJ ; pour certains → leurs joueurs seulement', () => {
    const t = setupObjects({
      objects: [
        obj('vu', 0, 0),
        obj('cache', 200, 0, { visibility: 'hidden' }),
        obj('certains', 400, 0, { visibility: 'custom', visibleTo: ['aldric'] }),
        obj('personne', 500, 0, { visibility: 'custom', visibleTo: [] }),
        obj('sous-sol', 600, 0, { layerId: 'sol' }),
      ],
    });
    Object.assign(t.engine, {
      directory: {
        characters: () => [],
        userName: () => null,
        players: () => [
          { userId: 'joueuse', name: 'Joueuse', characterIds: ['aldric'] },
          { userId: 'autre', name: 'Autre', characterIds: ['bree'] },
        ],
      },
    });
    expect(t.engine.liveAudience('vu')).toBe('public');
    expect(t.engine.liveAudience('cache')).toBe('gm');
    expect(t.engine.liveAudience('certains')).toEqual({ users: ['joueuse'] });
    expect(t.engine.liveAudience('personne')).toBe('gm');
    expect(t.engine.liveAudience('sous-sol')).toBe('public');
    const sol = t.store.getState().collections.layers!.get('sol')!;
    t.store.getState().upsert('layers', [{ ...sol, version: 2, visibleToPlayers: false }]);
    expect(t.engine.liveAudience('sous-sol')).toBe('gm');
  });

  it('décor : sa propre sorte, choisie par `kind` ; changer de sorte garde la sélection', async () => {
    const t = setupObjects({
      objects: [obj('arbre', 100, 100, { kind: 'decor' }), obj('coffre', 300, 100)],
    });
    expect(t.engine.entity('arbre')!.kind.id).toBe('decor');
    expect(t.engine.entity('coffre')!.kind.id).toBe('object');
    t.engine.selection.replace(['coffre']);
    t.engine.openInspector(['coffre']);
    await setObjectKind(t.engine, [t.engine.entity('coffre')!], 'decor');
    expect(t.engine.entity('coffre')!.kind.id).toBe('decor');
    expect(t.engine.selection.ids).toEqual(['coffre']);
    expect(t.engine.ui.getState().inspector).toEqual(['coffre']);
    expect(t.objects.update.mock.calls[0]![0][0]!.changes).toEqual({ kind: 'decor' });
  });

  it('agrandir, rétrécir autour du centre ; une case aux proportions ; pas les verrouillés', async () => {
    const t = setupObjects({
      objects: [obj('a', 100, 100), obj('v', 400, 100, { isLocked: true })],
    });
    const all = () => [t.engine.entity('a')!, t.engine.entity('v')!];
    await scaleObjects(t.engine, all(), 1.25);
    expect(t.engine.entity('a')!.geometry).toMatchObject({
      x: 150,
      y: 125,
      width: 125,
      height: 62.5,
    });
    expect(t.object('v')!.width).toBe(100);
    await scaleObjects(t.engine, all(), 0.8);
    expect(t.object('a')!.width).toBeCloseTo(100);
    await fitObjects(t.engine, all());
    // Pas d'image chargée : proportions actuelles (2:1), une case sur le petit côté
    expect(t.engine.entity('a')!.geometry).toMatchObject({
      width: 100,
      height: 50,
      x: 150,
      y: 125,
    });
  });

  it('dupliquer : décalé d’une case, contenu compris', async () => {
    const items = [{ id: 'i1', name: 'Potion', quantity: 2, ref: 'potion' }];
    const t = setupObjects({ objects: [obj('coffre', 100, 100, { items, searchable: true })] });
    await t.engine.duplicateEntities([t.engine.entity('coffre')!]);
    await t.commands.idle();
    const created = t.objects.create.mock.calls[0]![0][0] as ObjectData;
    expect(created.pos).toEqual({ x: 150, y: 150 });
    expect(created.items).toEqual(items);
    expect(created.searchable).toBe(true);
  });

  it('menu du MJ : actions communes, taille, fouille, contenu, sorte', async () => {
    const t = setupObjects({ objects: [obj('coffre', 100, 100)] });
    const ids = t.engine.menuItems(['coffre'], { x: 150, y: 125 }).map((i) => i.id);
    for (const id of [
      'inspect',
      'lock',
      'hide',
      'restrictTo',
      'rotate',
      'duplicate',
      'arrange',
      'delete',
    ])
      expect(ids).toContain(id);
    for (const id of ['object:size', 'object:searchable', 'object:contents', 'object:kind'])
      expect(ids).toContain(id);
    const toggle = t.engine
      .menuItems(['coffre'], { x: 0, y: 0 })
      .find((i) => i.id === 'object:searchable')!;
    expect(toggle.checked).toBe(false);
    toggle.run!();
    await t.commands.idle();
    expect(t.object('coffre')!.searchable).toBe(true);
    await setSearchable(t.engine, [t.engine.entity('coffre')!], false);
    expect(t.object('coffre')!.searchable).toBe(false);
  });

  it('menu du joueur : « Fouiller » à portée (comme le serveur), grisé trop loin', () => {
    const openSearch = vi.fn();
    const t = setupObjects({
      viewer: PLAYER,
      openSearch,
      // Coffre 100 × 50 en (100, 100), portée 1,5 case = 75 px
      objects: [obj('coffre', 100, 100, { searchable: true, rotation: 90 })],
      tokens: [token('t1', 'aldric', 150, 240)],
    });
    // Debout, il descend jusqu'à y = 175 : 65 px, à portée
    let items = t.engine.menuItems(['coffre'], { x: 150, y: 125 });
    let search = items.find((i) => i.id === 'object:search')!;
    expect(search).toMatchObject({ label: 'Fouiller', disabled: false });
    search.run!();
    expect(openSearch).toHaveBeenCalledWith('coffre');
    expect(items.map((i) => i.id)).not.toContain('lock');
    // Couché, il s'arrête à y = 150 : 90 px, trop loin
    const c = t.object('coffre')!;
    t.store.getState().upsert('objects', [{ ...c, version: 2, rotation: 0 }]);
    items = t.engine.menuItems(['coffre'], { x: 150, y: 125 });
    search = items.find((i) => i.id === 'object:search')!;
    expect(search).toMatchObject({ label: 'Fouiller (trop loin)', disabled: true });
  });
});

// ─── Rendu sans WebGL ────────────────────────────────────────────────────────

/** Graphics factice : toute méthode de dessin s'enchaîne ; `clear` est compté. */
function fakeGraphics(opts: { label?: string; context?: unknown } = {}) {
  const base = {
    label: opts.label,
    context: opts.context,
    visible: true,
    destroyed: false,
    parent: null,
    angle: 0,
    clears: 0,
    scale: { set: () => undefined },
    position: {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    },
    clear() {
      this.clears++;
      return this;
    },
  };
  const proxy: typeof base = new Proxy(base, {
    get: (target, key) => (key in target ? target[key as keyof typeof base] : () => proxy),
  });
  return proxy;
}

class FakeSprite {
  static created = 0;
  visible = true;
  destroyed = false;
  texture: unknown = null;
  size: [number, number] | null = null;
  anchor = { set: () => undefined };
  constructor() {
    FakeSprite.created++;
  }
  setSize(w: number, h: number) {
    this.size = [w, h];
  }
}

function fakeContext(viewer = GM) {
  const textures = new Map<string, Promise<unknown>>();
  const texture = vi.fn((url: string) => {
    if (!textures.has(url))
      textures.set(
        url,
        url.includes('casse')
          ? Promise.reject(new Error('404'))
          : Promise.resolve({ width: 200, height: 100, orig: { width: 200, height: 100 } }),
      );
    return textures.get(url)!;
  });
  const contexts: unknown[] = [];
  const pixi = {
    Sprite: FakeSprite,
    Graphics: function Graphics(opts?: { label?: string; context?: unknown }) {
      return fakeGraphics(opts);
    },
    GraphicsContext: function GraphicsContext() {
      const c = fakeGraphics();
      contexts.push(c);
      return c;
    },
  } as unknown as typeof Pixi;
  const ctx: RenderContext = {
    viewer,
    scene: null,
    settings: null,
    pixelsPerUnit: 50,
    unitName: 'm',
    tokenScale: 1,
    pixi,
    zoom: 1,
    theme: { primary: 1, foreground: 2, background: 3, muted: 4, destructive: 5, success: 6 },
    screenSpace: new ScreenSpace(),
    texture: texture as unknown as RenderContext['texture'],
    invalidate: vi.fn(),
  };
  return { ctx, texture, contexts };
}

function fakeDisplay() {
  const children: unknown[] = [];
  return { children, addChild: (...c: unknown[]) => children.push(...c) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('rendu d’un objet (sans WebGL)', () => {
  it('un sprite pour toute la vie de l’entité, texture partagée, retaillé sans être recréé', async () => {
    const t = setupObjects({
      objects: [
        obj('a', 0, 0, { imageUrl: '/coffre.png' }),
        obj('b', 200, 0, { imageUrl: '/coffre.png' }),
      ],
    });
    const { ctx, texture } = fakeContext();
    const kind = t.kinds[0];
    const a = t.engine.entity('a')! as unknown as MapEntity<ObjectData>;
    const b = t.engine.entity('b')! as unknown as MapEntity<ObjectData>;
    a.display = fakeDisplay() as never;
    b.display = fakeDisplay() as never;
    FakeSprite.created = 0;
    kind.render!(a, ctx);
    kind.render!(b, ctx);
    await flush();
    expect(FakeSprite.created).toBe(2);
    // Aucun repère ici : ni cadenas ni loupe créés
    expect((a.display as unknown as { children: unknown[] }).children).toHaveLength(2);
    // Même adresse : une seule texture chargée par le cache du moteur, partagée
    expect(new Set(texture.mock.results.map((r) => r.value)).size).toBe(1);
    expect(imageAspect(a as unknown as MapEntity)).toBe(2);
    const sprite = (a.display as unknown as { children: unknown[] }).children[1] as FakeSprite;
    expect(sprite.size).toEqual([100, 50]);
    expect(sprite.visible).toBe(true);

    // Nouvelle taille : le même sprite, retaillé ; aucune nouvelle texture demandée
    const previous = a.data;
    a.data = { ...a.data, width: 300, height: 150, version: 2 };
    kind.update!(a, ctx, { previous });
    kind.update!(a, ctx, { state: true });
    expect(FakeSprite.created).toBe(2);
    expect(sprite.size).toEqual([300, 150]);
    expect(texture).toHaveBeenCalledTimes(2);
  });

  it('image illisible : cadre barré ; sans image : cadre du MJ seulement ; repères', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = setupObjects({
      objects: [
        obj('casse', 0, 0, { imageUrl: '/casse.png', isLocked: true, searchable: true }),
        obj('zone', 200, 0),
      ],
    });
    const gm = fakeContext(GM);
    const kind = t.kinds[0];
    const casse = t.engine.entity('casse')! as unknown as MapEntity<ObjectData>;
    casse.display = fakeDisplay() as never;
    kind.render!(casse, gm.ctx);
    await flush();
    const [frame, sprite, lock, search] = (casse.display as unknown as { children: unknown[] })
      .children as [
      ReturnType<typeof fakeGraphics>,
      FakeSprite,
      ReturnType<typeof fakeGraphics>,
      ReturnType<typeof fakeGraphics>,
    ];
    expect(sprite.visible).toBe(false);
    expect(frame.visible).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    expect(lock).toMatchObject({ label: 'lock', visible: true });
    expect(search).toMatchObject({ label: 'search', visible: true });
    // Repères à taille constante à l'écran, retirés avec l'entité
    expect(gm.ctx.screenSpace.size).toBe(2);
    kind.dispose!(casse);
    expect(gm.ctx.screenSpace.size).toBe(0);

    // Zone sans image : un joueur ne voit rien (pas de cadre, aucun repère créé)
    const zone = t.engine.entity('zone')! as unknown as MapEntity<ObjectData>;
    zone.display = fakeDisplay() as never;
    const player = fakeContext(PLAYER);
    kind.render!(zone, player.ctx);
    const zchildren = (zone.display as unknown as { children: ReturnType<typeof fakeGraphics>[] })
      .children;
    expect(zchildren).toHaveLength(2);
    expect(zchildren[0]!.visible).toBe(false);
    // Devenue fouillable : la loupe apparaît, pour tous
    const previous = zone.data;
    zone.data = { ...zone.data, searchable: true, version: 2 };
    kind.update!(zone, player.ctx, { previous });
    expect(zchildren[2]).toMatchObject({ label: 'search', visible: true });
    const zoneGm = t.engine.entity('zone')! as unknown as MapEntity<ObjectData>;
    zoneGm.display = fakeDisplay() as never;
    kind.render!(zoneGm, fakeContext(GM).ctx);
    expect(
      (zoneGm.display as unknown as { children: ReturnType<typeof fakeGraphics>[] }).children[0]!
        .visible,
    ).toBe(true);
  });

  it('les repères partagent un seul dessin par thème, quel que soit le nombre d’objets', () => {
    const t = setupObjects({
      objects: Array.from({ length: 5 }, (_, i) =>
        obj(`v${i}`, i * 150, 0, { isLocked: true, searchable: true }),
      ),
    });
    const { ctx, contexts } = fakeContext(GM);
    const kind = t.kinds[0];
    const drawn = new Set<unknown>();
    for (let i = 0; i < 5; i++) {
      const e = t.engine.entity(`v${i}`)! as unknown as MapEntity<ObjectData>;
      e.display = fakeDisplay() as never;
      kind.render!(e, ctx);
      const children = (e.display as unknown as { children: { context?: unknown }[] }).children;
      for (const c of children.slice(2)) drawn.add(c.context);
    }
    // Un contexte pour le cadenas, un pour la loupe
    expect(contexts).toHaveLength(2);
    expect(drawn.size).toBe(2);
  });
});
