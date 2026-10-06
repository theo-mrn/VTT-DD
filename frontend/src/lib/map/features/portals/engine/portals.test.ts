import type { MapPortalUseResult, MapToken } from '@vtt/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GM, spyPersistence } from '@/lib/map/engine/test-kit';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import type { MapDto } from '@/lib/map/store/map-store';
import { ALICE, setupTokens, token } from '@/lib/map/features/tokens/engine/test-kit';
import type { PortalApi } from './api';
import { portalPersistence, placeWithRemoteReturn } from './commands';
import {
  enteredPortal,
  insidePortal,
  PORTAL_KIND,
  portalDraft,
  portalLabel,
  PORTALS,
  PORTALS_TOOL_ID,
  radiusFromDistance,
  type PortalData,
} from './model';
import { portalModuleOf, registerPortals } from './register';
import type { PortalTool } from './tool';

const P = (x: number, y: number) => ({ x, y });

function portal(id: string, extra: Partial<PortalData> = {}): PortalData {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    name: 'Trappe',
    pos: P(300, 300),
    radius: 50,
    kind: 'same_map',
    targetMapId: null,
    target: P(800, 800),
    icon: 'stairs',
    color: '#8b5cf6',
    visible: true,
    auto: false,
    linkedPortalId: null,
    ...extra,
  };
}

/** Faux client des portails : fait passer comme le serveur (arrivée sur `target`). */
function fakeApi(store: () => PortalData[]) {
  const api = {
    use: vi.fn(async (id: string, body: { characterIds?: string[]; party?: true }) => {
      const p = store().find((x) => x.id === id)!;
      const items = (body.characterIds ?? ['hero']).map((c, i) =>
        token(`t-${c}`, c, {
          mapId: p.kind === 'same_map' ? 'carte' : p.targetMapId!,
          pos: p.target ?? P(0, 0),
          version: 10 + i,
        }),
      ) as unknown as MapToken[];
      return {
        mapId: p.kind === 'same_map' ? 'carte' : p.targetMapId!,
        items,
      } satisfies MapPortalUseResult;
    }),
    createOn: vi.fn(async (mapId: string, body: Record<string, unknown>) => ({
      ...portal('remote-1'),
      ...body,
      mapId,
    })),
    removeOn: vi.fn(async () => undefined),
    list: vi.fn(async () => store()),
  };
  return api as typeof api & PortalApi;
}

function bench(
  opts: { portals?: PortalData[]; viewer?: MapViewer; tokens?: ReturnType<typeof token>[] } = {},
) {
  const kit = setupTokens({
    viewer: opts.viewer ?? GM,
    tokens: opts.tokens ?? [token('t-hero', 'hero', { pos: P(100, 100) })],
  });
  const persistence = spyPersistence();
  (kit.engine.backend as { collection: (k: string) => unknown }).collection = (key) =>
    key === PORTALS ? persistence : kit.base;
  kit.store.getState().replaceCollection(PORTALS, opts.portals ?? []);
  const portals = () =>
    [...(kit.store.getState().collections[PORTALS]?.values() ?? [])] as PortalData[];
  const api = fakeApi(portals);
  registerPortals(kit.engine, {}, { api });
  const ctx = portalModuleOf(kit.engine)!;
  const tool = () => {
    kit.engine.tools.activate(PORTALS_TOOL_ID);
    return kit.engine.tools.active as PortalTool;
  };
  return { ...kit, persistence, portals, api, ctx, tool };
}

describe('portails : calculs', () => {
  it('zone : centre du token à `radius` au plus ; entrer, pas arriver', () => {
    const p = portal('p');
    expect(insidePortal(p, P(350, 300))).toBe(true);
    expect(insidePortal(p, P(351, 300))).toBe(false);
    // Lâché dedans depuis dehors : entré ; bougé à l'intérieur : rien
    expect(enteredPortal([p], P(100, 100), P(320, 310))).toBe(p);
    expect(enteredPortal([p], P(310, 300), P(320, 310))).toBeNull();
    // Deux portails qui se chevauchent : le plus proche
    const q = portal('q', { pos: P(340, 300) });
    expect(enteredPortal([p, q], P(0, 0), P(335, 300))).toBe(q);
  });

  it('nom par défaut : celui de l’icône, jamais celui de la scène visée', () => {
    const d = portalDraft(
      'carte',
      P(10, 10),
      { icon: 'ladder', color: '#fff', radius: 1.5, twoWay: false, auto: true, visible: true },
      50,
      { kind: 'scene_change', targetMapId: 'crypte', target: null },
    );
    expect(d).toMatchObject({ name: 'Échelle', radius: 75, auto: true, targetMapId: 'crypte' });
    expect(portalLabel({ name: '  ', icon: 'door' })).toBe('Porte');
    expect(radiusFromDistance(130, 50, false)).toBe(2.5);
  });
});

describe('sorte portal', () => {
  it('se touche sur son icône, pas sur sa zone ; un token posé dessus reste prioritaire', () => {
    const b = bench({
      portals: [portal('p')],
      tokens: [token('t-orc', 'orc', { pos: P(300, 300) })],
    });
    // Outil sélection : le token d'abord, le portail en dernier recours
    expect(b.engine.hitTest(P(300, 300))?.id).toBe('t-orc');
    expect(b.engine.hitTest(P(302, 302), { filter: (e) => e.kind.id === PORTAL_KIND })?.id).toBe(
      'p',
    );
    // Avec l'outil X, seuls les portails ; le bord de la zone ne prend pas le clic
    b.tool();
    expect(b.engine.hitTest(P(300, 300))?.id).toBe('p');
    expect(b.engine.hitTest(P(345, 300))).toBeNull();
  });

  it('droits : un joueur voit et sélectionne, le MJ fait le reste ; masquer = visible', async () => {
    const b = bench({ portals: [portal('p')], viewer: ALICE });
    const e = b.engine.entity('p')!;
    expect(e.kind.can('select', e, ALICE)).toBe(true);
    expect(e.kind.can('move', e, ALICE)).toBe(false);
    expect(e.kind.can('inspect', e, ALICE)).toBe(false);
    expect(e.kind.can('move', e, GM)).toBe(true);
    expect(e.kind.hidden!.set(e.data, true)).toMatchObject({ visible: false });
    expect(e.kind.visionSamples!(e)).toHaveLength(18);
  });

  it('dupliquer : la copie garde la destination, pas le lien', () => {
    const b = bench({ portals: [portal('p', { linkedPortalId: 'q' })] });
    const e = b.engine.entity('p')!;
    const copy = e.kind.duplicate!(e.data, P(50, 50), b.engine.kindContext()) as PortalData;
    expect(copy).toMatchObject({ linkedPortalId: null, target: P(800, 800), pos: P(350, 350) });
  });
});

describe('outil portails (X)', () => {
  it('clic, puis clic sur la carte : un portail aller-retour relié, en une commande', async () => {
    const b = bench();
    const tool = b.tool();
    b.click(P(312, 290));
    expect(tool.state).toBe('destination');
    // Aimanté au centre de la case
    expect(tool.ui.getState().entry).toEqual(P(325, 275));
    expect(b.portals()).toHaveLength(0);
    b.click(P(712, 690));
    expect(tool.state).toBe('idle');
    const [a, back] = b.portals();
    expect(a).toMatchObject({ pos: P(325, 275), target: P(725, 675), kind: 'same_map' });
    expect(back).toMatchObject({ pos: P(725, 675), target: P(325, 275) });
    expect(a!.linkedPortalId).toBe(back!.id);
    expect(b.engine.selection.ids).toEqual([a!.id]);
    await b.commands.idle();
    // Créés sans leurs liens (identifiants provisoires), puis reliés par le serveur
    const created = b.persistence.create.mock.calls[0]![0] as PortalData[];
    expect(created.map((d) => d.linkedPortalId)).toEqual([null, null]);
    expect(b.persistence.update).toHaveBeenCalledTimes(1);
    expect(b.commands.history.undo).toHaveLength(1);
  });

  it('Échap pendant le choix de la destination : rien n’est écrit', () => {
    const b = bench();
    const tool = b.tool();
    b.click(P(300, 300));
    b.engine.controller.keyDown(b.key('Escape'));
    expect(tool.state).toBe('idle');
    expect(b.portals()).toHaveLength(0);
    expect(b.commands.history.undo).toHaveLength(0);
  });

  it('aller simple vers une autre scène : son point d’arrivée par défaut', async () => {
    const b = bench();
    const tool = b.tool();
    tool.settings.setState({ twoWay: false });
    b.click(P(300, 300));
    tool.placeToScene(b.engine, 'crypte', null);
    expect(b.portals()[0]).toMatchObject({
      kind: 'scene_change',
      targetMapId: 'crypte',
      target: null,
      linkedPortalId: null,
    });
    await b.commands.idle();
    expect(b.api.createOn).not.toHaveBeenCalled();
  });

  it('aller-retour vers une autre scène : le retour est posé là-bas, relié ; ⌘Z retire les deux', async () => {
    const b = bench();
    b.ctx.scenesStore.setState({
      scenes: [
        {
          id: 'crypte',
          name: 'Crypte',
          visibleToPlayers: false,
          groupId: null,
          spawn: P(40, 60),
          width: 800,
          height: 600,
          backgroundUrl: null,
        },
      ],
    });
    const tool = b.tool();
    b.click(P(300, 300));
    tool.placeToScene(b.engine, 'crypte', null);
    await b.commands.idle();
    const here = b.portals()[0]!;
    expect(b.api.createOn).toHaveBeenCalledWith(
      'crypte',
      expect.objectContaining({ pos: P(40, 60), linkedPortalId: here.id, name: 'Portail' }),
    );
    await b.commands.undo();
    await b.commands.idle();
    expect(b.api.removeOn).toHaveBeenCalledWith('crypte', 'remote-1');
    expect(b.persistence.remove).toHaveBeenCalledTimes(1);
    expect(b.portals()).toHaveLength(0);
  });

  it('poignée de rayon : par demi-case, une commande au lâcher ; Échap : rien', async () => {
    const b = bench({ portals: [portal('p')] });
    b.tool();
    b.engine.selection.replace(['p']);
    b.drag(P(350, 300), P(420, 300));
    expect(b.portals()[0]!.radius).toBe(125);
    await b.commands.idle();
    expect(b.persistence.update).toHaveBeenCalledTimes(1);
  });

  it('poignée d’arrivée d’un portail interne non relié ; choisir l’arrivée sur la carte', async () => {
    const b = bench({
      portals: [
        portal('p'),
        portal('s', {
          pos: P(600, 200),
          kind: 'scene_change',
          targetMapId: 'crypte',
          target: null,
        }),
      ],
    });
    const tool = b.tool();
    b.engine.selection.replace(['p']);
    b.drag(P(800, 800), P(640, 710));
    expect(b.portals()[0]!.target).toEqual(P(625, 725));
    // Depuis l'inspecteur : un clic donne l'arrivée (téléportation)
    tool.startPick(b.engine, 's');
    expect(tool.state).toBe('pick');
    b.click(P(110, 910));
    expect(b.portals().find((p) => p.id === 's')).toMatchObject({
      kind: 'same_map',
      targetMapId: null,
      target: P(125, 925),
    });
    await b.commands.idle();
  });
});

describe('emprunter', () => {
  it('un joueur lâche son token dans un portail : proposition, puis passage à la demande', async () => {
    const b = bench({ portals: [portal('p')], viewer: ALICE });
    b.drag(P(100, 100), P(300, 300));
    const prompt = b.ctx.travel.state.getState().prompt;
    expect(prompt).toEqual({ portalId: 'p', characterIds: ['hero'] });
    expect(b.api.use).not.toHaveBeenCalled();
    await b.ctx.travel.use(b.portals()[0]!, { characterIds: prompt!.characterIds });
    // Le déplacement d'abord, puis l'emprunt
    expect(b.base.update).toHaveBeenCalledTimes(1);
    expect(b.api.use).toHaveBeenCalledWith('p', { characterIds: ['hero'] });
    expect(b.data('t-hero')!.pos).toEqual(P(800, 800));
    expect(b.ctx.travel.state.getState().prompt).toBeNull();
  });

  it('proposition fermée quand le token quitte la zone, ou sur ×', async () => {
    const b = bench({ portals: [portal('p')], viewer: ALICE });
    b.drag(P(100, 100), P(300, 300));
    expect(b.ctx.travel.state.getState().prompt).not.toBeNull();
    const at = b.data('t-hero')!.pos;
    expect(insidePortal(b.portals()[0]!, at)).toBe(true);
    b.drag(at, P(at.x + 200, at.y + 200));
    expect(b.data('t-hero')!.pos).not.toEqual(at);
    expect(b.ctx.travel.state.getState().prompt).toBeNull();
    b.drag(b.data('t-hero')!.pos, P(300, 300));
    expect(b.ctx.travel.state.getState().prompt).not.toBeNull();
    b.ctx.travel.dismiss();
    expect(b.ctx.travel.state.getState().prompt).toBeNull();
    await b.commands.idle();
  });

  it('portail automatique : franchi aussitôt ; bouger dans la zone ne relance rien', async () => {
    const b = bench({ portals: [portal('p', { auto: true })], viewer: ALICE });
    b.drag(P(100, 100), P(300, 300));
    await vi.waitFor(() => expect(b.api.use).toHaveBeenCalledTimes(1));
    await b.commands.idle();
    b.drag(P(800, 800), P(820, 800));
    await b.commands.idle();
    expect(b.api.use).toHaveBeenCalledTimes(1);
  });

  it('le MJ qui déplace un token dans un portail ne le déclenche pas', async () => {
    const b = bench({ portals: [portal('p', { auto: true })] });
    b.drag(P(100, 100), P(300, 300));
    await b.commands.idle();
    expect(b.api.use).not.toHaveBeenCalled();
    expect(b.ctx.travel.state.getState().prompt).toBeNull();
  });

  it('vers une autre scène : le token quitte la carte, la vue est prévenue', async () => {
    const b = bench({
      portals: [portal('p', { kind: 'scene_change', targetMapId: 'crypte', target: null })],
      tokens: [token('t-hero', 'hero', { pos: P(310, 300) })],
      viewer: ALICE,
    });
    const crossed = vi.fn();
    b.ctx.travel.onCrossed(crossed);
    expect(await b.ctx.travel.use(b.portals()[0]!, { characterIds: ['hero'] })).toBe(true);
    expect(b.data('t-hero')).toBeUndefined();
    expect(crossed).toHaveBeenCalledWith(
      expect.objectContaining({ mapId: 'crypte' }),
      expect.objectContaining({ id: 'p' }),
      false,
    );
  });

  it('refus du serveur : un message clair', async () => {
    const b = bench({ portals: [portal('p')], viewer: ALICE });
    const { ApiError } = await import('@/lib/api');
    b.api.use.mockRejectedValueOnce(
      new ApiError({ status: 422, title: 'Refusé', code: 'out_of_range' }),
    );
    expect(await b.ctx.travel.use(b.portals()[0]!, { characterIds: ['hero'] })).toBe(false);
    expect(b.notify).toHaveBeenCalledWith('Entrez dans la zone de « Trappe » pour l’emprunter.');
  });

  it('menus : le MJ fait emprunter un portail à la sélection ; le joueur, celui où il est', async () => {
    const gm = bench({
      portals: [portal('p'), portal('nowhere', { target: null, name: 'Mur' })],
    });
    const items = gm.engine.menuItems(['t-hero'], P(100, 100));
    const take = items.find((i) => i.id === 'portal:take');
    expect(take?.children?.map((c) => c.label)).toEqual(['Trappe · sur la carte']);
    take!.children![0]!.run!();

    const player = bench({
      portals: [portal('p')],
      tokens: [token('t-hero', 'hero', { pos: P(310, 300) })],
      viewer: ALICE,
    });
    await vi.waitFor(() =>
      expect(gm.api.use).toHaveBeenCalledWith('p', { characterIds: ['hero'] }),
    );

    const mine = player.engine.menuItems(['t-hero'], P(310, 300));
    expect(mine.map((i) => i.label)).toContain('Emprunter « Trappe »');
    // Sur le portail : « Emprunter » dans la barre (action du joueur)
    const bar = player.engine.menuItems(['p'], P(300, 300)).find((i) => i.id === 'portal:use');
    expect(bar).toMatchObject({ label: 'Emprunter', forPlayers: true, disabled: false });
  });

  it('MJ : faire passer tout le groupe', async () => {
    const b = bench({ portals: [portal('p')] });
    const party = b.engine.menuItems(['p'], P(300, 300)).find((i) => i.id === 'portal:party');
    party!.run!();
    await vi.waitFor(() => expect(b.api.use).toHaveBeenCalledWith('p', { party: true }));
  });
});

describe('persistance des portails reliés', () => {
  it('une paire recréée (⌘Z) : créée sans liens, puis reliée, puis relue', async () => {
    const base = spyPersistence();
    let server: MapDto[] = [];
    base.create.mockImplementation(async (drafts) => {
      server = drafts.map((d) => ({ ...d, id: `srv-${d.id}`, version: 1 }));
      return server;
    });
    const api = {
      list: vi.fn(async () =>
        server.map((s, i) => ({ ...s, version: 2, linkedPortalId: server[1 - i]!.id })),
      ),
    } as unknown as PortalApi;
    const p = portalPersistence(base, api);
    const out = await p.create!([
      portal('a', { linkedPortalId: 'b' }),
      portal('b', { linkedPortalId: 'a' }),
    ]);
    expect((base.create.mock.calls[0]![0] as PortalData[]).map((d) => d.linkedPortalId)).toEqual([
      null,
      null,
    ]);
    expect(base.update.mock.calls[0]![0][0]).toMatchObject({
      changes: { linkedPortalId: 'srv-a' },
    });
    expect(out.map((o) => (o as PortalData).linkedPortalId)).toEqual(['srv-b', 'srv-a']);
  });

  it('retour sur une autre scène en échec : le portail d’ici repart, rien à moitié posé', async () => {
    const b = bench();
    b.api.createOn.mockRejectedValueOnce(new Error('panne'));
    await b.engine.execute(
      placeWithRemoteReturn({
        label: 'Poser',
        persistence: b.ctx.persistence,
        api: b.api,
        entry: portal('tmp-a', { kind: 'scene_change', targetMapId: 'crypte', target: null }),
        remote: { mapId: 'crypte', body: { pos: P(1, 1) } },
      }),
    );
    expect(b.persistence.remove).toHaveBeenCalledTimes(1);
    expect(b.portals()).toHaveLength(0);
  });
});
