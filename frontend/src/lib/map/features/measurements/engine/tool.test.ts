import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { boxKind, setup, spyPersistence, type Box } from '@/lib/map/engine/test-kit';
import type { MeasureEvent } from '@/lib/map/live/live-channel';
import type { MapDto } from '@/lib/map/store/map-store';
import { EPHEMERAL_FADE_MS, EPHEMERAL_MS, PIN_SETTLE_MS, RemoteMeasures } from './live-measures';
import { MEASURE_TOOL_ID, MEASUREMENTS, type MeasurementData } from './model';
import { measureModuleOf, registerMeasurements } from './register';
import { DEFAULT_MEASURE_SETTINGS } from './settings';
import type { MeasureTool } from './tool';

const P = (x: number, y: number) => ({ x, y });
const GM: MapViewer = { userId: 'mj', role: 'gm', characterIds: [] };
const PLAYER: MapViewer = { userId: 'joueur', role: 'player', characterIds: ['aria'] };

function template(id: string, extra: Partial<MeasurementData> = {}): MeasurementData {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    shape: 'circle',
    start: P(500, 500),
    end: P(600, 500),
    color: '#ffd700',
    skin: null,
    options: {},
    createdBy: 'mj',
    ...extra,
  };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function fakeLive() {
  const listeners: ((e: MeasureEvent) => void)[] = [];
  return {
    measure: vi.fn(),
    end: vi.fn(),
    transform: vi.fn(),
    drag: vi.fn(),
    cursor: vi.fn(),
    ping: vi.fn(),
    settle: vi.fn(),
    poses: () => [],
    animating: () => false,
    onActivity: () => () => undefined,
    onPing: () => () => undefined,
    onMeasure: (l: (e: MeasureEvent) => void) => {
      listeners.push(l);
      return () => undefined;
    },
    emit: (e: MeasureEvent) => listeners.forEach((l) => l(e)),
  };
}

function bench(opts: { viewer?: MapViewer; templates?: MeasurementData[]; tokens?: Box[] } = {}) {
  const kit = setup({ viewer: opts.viewer ?? GM });
  const persistence = spyPersistence();
  kit.backend.collection = (key: string) =>
    (key === MEASUREMENTS ? persistence : spyPersistence()) as never;
  const live = fakeLive();
  Object.defineProperty(kit.engine, 'live', { value: live });
  kit.engine.registerKind(boxKind(spyPersistence(), { id: 'token', collection: 'tokens' }));
  kit.store.getState().replaceCollection('tokens', opts.tokens ?? []);
  kit.store.getState().replaceCollection(MEASUREMENTS, (opts.templates ?? []) as MapDto[]);
  cleanup = registerMeasurements(kit.engine);
  const ctx = measureModuleOf(kit.engine)!;
  ctx.settings.setState({ ...DEFAULT_MEASURE_SETTINGS });
  const tool = () => kit.engine.tools.active as MeasureTool;
  const templates = () =>
    [...(kit.store.getState().collections[MEASUREMENTS]?.values() ?? [])] as MeasurementData[];
  const local = () => ctx.local.getState().measure;
  return { ...kit, ctx, live, persistence, tool, templates, local };
}

describe('outil Mesurer (Z)', () => {
  it('Z l’active (MJ et joueurs, pas les spectateurs)', () => {
    const b = bench({ viewer: PLAYER });
    b.engine.controller.keyDown(b.key('z'));
    expect(b.engine.tools.getActiveId()).toBe(MEASURE_TOOL_ID);
    const spectator = setup({ viewer: { userId: 's', role: 'spectator', characterIds: [] } });
    const off = registerMeasurements(spectator.engine);
    expect(spectator.engine.tools.activate(MEASURE_TOOL_ID)).toBe(false);
    off();
  });

  it('glisser : règle aimantée, au direct pendant le geste, récente au lâcher', () => {
    const b = bench();
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.drag(P(110, 120), P(420, 130), {}, false);
    expect(b.tool().state).toBe('measuring');
    // Aimantation à la case : centres des cases
    expect(b.local()).toMatchObject({
      phase: 'drawing',
      spec: { shape: 'line', start: P(125, 125), end: P(425, 125) },
    });
    expect(b.live.measure).toHaveBeenLastCalledWith(
      expect.objectContaining({ shape: 'line', from: [125, 125], to: [425, 125] }),
      'public',
    );
    b.engine.controller.pointerUp(b.pointer(P(420, 130), { buttons: 0 }));
    expect(b.tool().state).toBe('idle');
    expect(b.local()?.phase).toBe('recent');
    expect(b.live.end).toHaveBeenCalled();
    expect(b.templates()).toHaveLength(0);
  });

  it('⇧ : direction par 15° ; Alt : sans aimantation', () => {
    const b = bench();
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.drag(P(110, 110), P(410, 140), { shift: true, alt: true }, false);
    const m = b.local()!.spec;
    expect(m.start).toEqual(P(110, 110));
    expect(m.end.y).toBeCloseTo(110);
  });

  it('1 à 4 : la forme, même pendant le geste', () => {
    const b = bench();
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.drag(P(110, 110), P(310, 110), {}, false);
    b.engine.controller.keyDown(b.key('3', { code: 'Digit3' }));
    expect(b.ctx.settings.getState().shape).toBe('circle');
    expect(b.local()!.spec.shape).toBe('circle');
  });

  it('cône à longueur fixe : le pointeur ne donne que la direction', () => {
    const b = bench();
    b.ctx.settings.setState({
      shape: 'cone',
      cone: { angle: 60, mode: 'dimensions', width: 3, length: 4, rounded: false },
    });
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.drag(P(125, 125), P(900, 125), { alt: true }, false);
    const m = b.local()!.spec;
    expect(m.end).toEqual(P(325, 125));
    expect(m.options).toMatchObject({ coneMode: 'dimensions', coneWidth: 3, fixedLength: 4 });
  });

  it('Échap : le geste, puis la mesure récente, puis la sélection', () => {
    const b = bench();
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.drag(P(110, 110), P(310, 110), {}, false);
    b.engine.controller.keyDown(b.key('Escape'));
    expect(b.local()).toBeNull();
    expect(b.live.measure).toHaveBeenLastCalledWith(null, 'public');
    b.engine.controller.pointerUp(b.pointer(P(310, 110), { buttons: 0 }));
    b.drag(P(110, 110), P(310, 110));
    expect(b.local()?.phase).toBe('recent');
    b.engine.controller.keyDown(b.key('Escape'));
    expect(b.local()).toBeNull();
    b.engine.controller.keyDown(b.key('Escape'));
    expect(b.engine.tools.getActiveId()).toBe('select');
  });

  it('mesure privée du MJ : au direct pour les MJ seulement', () => {
    const b = bench();
    b.ctx.settings.setState({ shared: false });
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.drag(P(110, 110), P(310, 110), {}, false);
    expect(b.live.measure).toHaveBeenLastCalledWith(expect.anything(), 'gm');
  });
});

describe('épingler', () => {
  it('Entrée épingle la mesure récente : un gabarit, une commande annulable', async () => {
    const b = bench({ viewer: PLAYER });
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.ctx.settings.setState({ shape: 'circle', color: '#3b82f6' });
    b.drag(P(510, 510), P(610, 510));
    expect(b.engine.controller.keyDown(b.key('Enter'))).toBe(true);
    expect(b.templates()).toHaveLength(1);
    expect(b.templates()[0]).toMatchObject({
      shape: 'circle',
      start: P(525, 525),
      end: P(625, 525),
      color: '#3b82f6',
      createdBy: 'joueur',
    });
    expect(b.local()).toBeNull();
    expect(b.live.measure).toHaveBeenLastCalledWith(
      expect.objectContaining({ pinned: true }),
      'public',
    );
    await b.commands.idle();
    expect(b.persistence.create).toHaveBeenCalledTimes(1);
    const id = b.templates()[0]!.id;
    expect(b.engine.selection.ids).toEqual([id]);
    await b.commands.undo();
    expect(b.templates()).toHaveLength(0);
  });

  it('« Épingler au lâcher » : le gabarit est posé tout de suite', () => {
    const b = bench();
    b.ctx.settings.setState({ pinOnRelease: true, shape: 'cube' });
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.drag(P(510, 510), P(610, 510));
    expect(b.templates()).toMatchObject([{ shape: 'cube' }]);
    expect(b.local()).toBeNull();
  });

  it('un clic sans glisser ne mesure rien : il sélectionne le gabarit touché (contour)', () => {
    const b = bench({ templates: [template('g')] });
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.click(P(600, 500));
    expect(b.engine.selection.ids).toEqual(['g']);
    b.click(P(530, 500));
    expect(b.engine.selection.ids).toEqual([]);
    expect(b.local()).toBeNull();
  });
});

describe('gabarits épinglés', () => {
  it('poignée d’extrémité (outil Z) : une commande, origine et extrémité envoyées ensemble', async () => {
    const b = bench({ templates: [template('g')] });
    b.engine.tools.activate(MEASURE_TOOL_ID);
    b.engine.selection.replace(['g']);
    b.drag(P(600, 500), P(700, 500), { alt: true }, false);
    expect(b.tool().state).toBe('reshaping');
    expect(b.engine.entity('g')!.masks.has('measure:reshape')).toBe(true);
    expect(b.live.transform).toHaveBeenCalled();
    b.engine.controller.pointerUp(b.pointer(P(700, 500), { buttons: 0, alt: true }));
    expect(b.templates()[0]).toMatchObject({ start: P(500, 500), end: P(700, 500) });
    expect(b.engine.entity('g')!.masks.size).toBe(0);
    await b.commands.idle();
    const sent = b.persistence.update.mock.calls[0]![0][0]!;
    expect(sent.changes).toMatchObject({ start: P(500, 500), end: P(700, 500) });
  });

  it('outil sélection : glisser le contour déplace ; l’intérieur laisse passer le clic', async () => {
    const b = bench({
      templates: [template('g')],
      tokens: [{ id: 'gob', version: 1, x: 520, y: 500, w: 40, h: 40, layerId: null, z: 0 }],
    });
    b.click(P(525, 505));
    expect(b.engine.selection.ids).toEqual(['gob']);
    b.drag(P(500, 600), P(500, 700));
    expect(b.templates()[0]).toMatchObject({ start: P(500, 600), end: P(600, 600) });
  });

  it('droits : l’auteur ou le MJ ; un joueur ne déplace pas le gabarit du MJ', () => {
    const b = bench({
      viewer: PLAYER,
      templates: [
        template('mj'),
        template('mien', { createdBy: 'joueur', start: P(200, 200), end: P(250, 200) }),
      ],
    });
    const e = b.engine.entity('mj')!;
    expect(e.kind.can('move', e, PLAYER)).toBe(false);
    expect(e.kind.can('select', e, PLAYER)).toBe(true);
    const mine = b.engine.entity('mien')!;
    expect(mine.kind.can('delete', mine, PLAYER)).toBe(true);
  });

  it('menu : sélectionner les personnages dans la zone', () => {
    const b = bench({
      templates: [template('g')],
      tokens: [
        { id: 'dedans', version: 1, x: 540, y: 520, w: 40, h: 40, layerId: null, z: 0 },
        { id: 'dehors', version: 1, x: 700, y: 700, w: 40, h: 40, layerId: null, z: 0 },
      ],
    });
    const items = b.engine.menuItems(['g'], P(600, 500));
    const zone = items.find((i) => i.id === 'measure:zone')!;
    expect(zone.label).toBe('Sélectionner les personnages dans la zone (1)');
    zone.run!();
    expect(b.engine.selection.ids).toEqual(['dedans']);
  });
});

describe('mesures des autres (direct)', () => {
  const measure = {
    id: 'm',
    shape: 'line' as const,
    from: [10, 10] as [number, number],
    to: [110, 10] as [number, number],
    color: '#ffd700',
  };

  it('pendant le geste, puis 6 s après la fin, puis effacée', () => {
    const r = new RemoteMeasures();
    r.handle({ userId: 'u', measure, end: false }, 0);
    expect(r.shown(1000)).toHaveLength(1);
    r.handle({ userId: 'u', measure: undefined, end: true }, 1000);
    expect(r.shown(1000 + EPHEMERAL_MS - 1)[0]!.alpha).toBe(1);
    expect(r.shown(1000 + EPHEMERAL_MS + EPHEMERAL_FADE_MS / 2)[0]!.fading).toBe(true);
    expect(r.shown(1000 + EPHEMERAL_MS + EPHEMERAL_FADE_MS)).toHaveLength(0);
  });

  it('effacée par l’auteur (null) ; une nouvelle mesure remplace la précédente', () => {
    const r = new RemoteMeasures();
    r.handle({ userId: 'u', measure, end: false }, 0);
    r.handle({ userId: 'u', measure: { ...measure, id: 'n' }, end: false }, 10);
    expect(r.get('u')!.measure.id).toBe('n');
    r.handle({ userId: 'u', measure: null, end: true }, 20);
    expect(r.size).toBe(0);
  });

  it('épinglée : pleine jusqu’à l’arrivée du gabarit du même auteur, 3 s au plus', () => {
    const r = new RemoteMeasures();
    r.handle({ userId: 'u', measure: { ...measure, pinned: true }, end: true }, 0);
    expect(r.shown(PIN_SETTLE_MS - 1)[0]!.alpha).toBe(1);
    r.arrived('autre', P(10, 10));
    expect(r.size).toBe(1);
    r.arrived('u', P(10.4, 9.8));
    expect(r.size).toBe(0);
    r.handle({ userId: 'u', measure: { ...measure, pinned: true }, end: true }, 0);
    expect(r.shown(PIN_SETTLE_MS + 1)).toHaveLength(0);
  });

  it('le module reçoit le direct et pose le fantôme à l’arrivée du gabarit', () => {
    const b = bench();
    b.live.emit({ userId: 'u', measure: { ...measure, pinned: true }, end: true });
    expect(b.ctx.remote.size).toBe(1);
    b.store
      .getState()
      .upsert(MEASUREMENTS, [template('t', { createdBy: 'u', start: P(10, 10) }) as MapDto], {
        force: true,
      });
    expect(b.ctx.remote.size).toBe(0);
  });
});
