import { describe, expect, it } from 'vitest';
import { setup, spyPersistence } from '@/lib/map/engine/test-kit';
import type { MapDto } from '@/lib/map/store/map-store';
import { hatchPolygon, lassoPolygon, simplifyPath, zoneContains } from './geometry';
import { creationFields, FOG_ZONES, type FogZoneData } from './model';
import { registerFog, setFogFull } from './register';
import type { FogShape, FogTool } from './tool';

const P = (x: number, y: number) => ({ x, y });

function zone(id: string, extra: Partial<FogZoneData> = {}): FogZoneData {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    shape: 'rect',
    mode: 'fog',
    points: [P(100, 100), P(300, 100), P(300, 300), P(100, 300)],
    center: null,
    radius: null,
    order: 1,
    createdBy: 'mj',
    ...extra,
  } as FogZoneData;
}

function bench(opts: { zones?: FogZoneData[]; shape?: FogShape } = {}) {
  const kit = setup();
  const fog = spyPersistence();
  kit.backend.collection = (key: string) => (key === FOG_ZONES ? fog : spyPersistence()) as never;
  kit.store
    .getState()
    .setScene({ ...kit.store.getState().scene!, fogFull: false }, { force: true });
  kit.store.getState().replaceCollection(FOG_ZONES, opts.zones ?? []);
  registerFog(kit.engine);
  kit.engine.tools.activate('fog');
  const tool = kit.engine.tools.active as FogTool;
  tool.setShape(opts.shape ?? 'rect');
  const zones = () =>
    [...(kit.store.getState().collections[FOG_ZONES]?.values() ?? [])] as FogZoneData[];
  return { ...kit, tool, fog, zones };
}

describe('géométrie du brouillard', () => {
  it('simplifie un tracé à main levée (Ramer-Douglas-Peucker)', () => {
    const line = Array.from({ length: 50 }, (_, i) => P(i * 2, 0.1 * Math.sin(i)));
    expect(simplifyPath(line, 1)).toEqual([
      P(0, 0),
      P(98, Math.round(0.1 * Math.sin(49) * 100) / 100),
    ]);
  });

  it('lasso : polygone fermé simplifié, refusé s’il est trop petit', () => {
    const square = [P(0, 0), P(50, 0), P(100, 0), P(100, 100), P(0, 100), P(0, 1)];
    expect(lassoPolygon(square, 2, 16)).toEqual([P(0, 0), P(100, 0), P(100, 100), P(0, 100)]);
    expect(lassoPolygon([P(0, 0), P(2, 0), P(2, 2)], 0.5, 16)).toBeNull();
  });

  it('hachures dans un polygone, et contenance', () => {
    const sq = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
    const lines = hatchPolygon(sq, 10);
    expect(lines.length).toBeGreaterThan(10);
    for (const [a, b] of lines) {
      expect(
        zoneContains(
          { shape: 'rect', points: sq, center: null, radius: null },
          P((a.x + b.x) / 2, (a.y + b.y) / 2),
        ),
      ).toBe(true);
    }
    expect(
      zoneContains({ shape: 'circle', points: [], center: P(0, 0), radius: 10 }, P(6, 6)),
    ).toBe(true);
  });

  it('une création n’envoie que les champs de sa forme', () => {
    const circle = zone('c', { shape: 'circle', points: [], center: P(0, 0), radius: 5 });
    expect(creationFields(circle).points).toBeUndefined();
    expect(creationFields(zone('r')).center).toBeUndefined();
  });
});

describe('outil brouillard', () => {
  it('rectangle glissé, aimanté à la grille : une zone, une commande', async () => {
    const b = bench();
    b.drag(P(104, 96), P(296, 212));
    expect(b.zones().map((z) => [z.shape, z.mode, z.points])).toEqual([
      ['rect', 'fog', [P(100, 100), P(300, 100), P(300, 200), P(100, 200)]],
    ]);
    await b.commands.idle();
    expect(b.fog.create).toHaveBeenCalledTimes(1);
    expect((b.fog.create.mock.calls[0]![0] as MapDto[])[0]).not.toHaveProperty('center', null);
  });

  it('Alt inverse le mode le temps du geste (gomme de brouillard)', () => {
    const b = bench();
    b.drag(P(100, 100), P(300, 300), { alt: true });
    expect(b.zones()[0]!.mode).toBe('clear');
    b.tool.settings.setState({ mode: 'clear' });
    b.drag(P(400, 400), P(500, 500), { alt: true });
    expect(
      b
        .zones()
        .map((z) => z.mode)
        .sort(),
    ).toEqual(['clear', 'fog']);
  });

  it('cercle depuis le centre ; ⇧ : rayon en cases entières', () => {
    const b = bench({ shape: 'circle' });
    b.drag(P(500, 500), P(572, 500), { shift: true });
    const z = b.zones()[0]!;
    expect(z.shape).toBe('circle');
    expect(z.center).toEqual(P(500, 500));
    expect(z.radius).toBe(50);
    expect(z.points).toEqual([]);
  });

  it('main levée : un polygone simplifié', () => {
    const b = bench({ shape: 'lasso' });
    const c = b.engine.controller;
    c.pointerDown(b.pointer(P(100, 100)));
    const path = [
      ...Array.from({ length: 20 }, (_, i) => P(100 + i * 10, 100)),
      ...Array.from({ length: 20 }, (_, i) => P(300, 100 + i * 10)),
      ...Array.from({ length: 20 }, (_, i) => P(300 - i * 10, 300)),
    ];
    for (const p of path) c.pointerMove(b.pointer(p, { button: -1 }));
    c.pointerUp(b.pointer(P(100, 300), { buttons: 0 }));
    const z = b.zones()[0]!;
    expect(z.shape).toBe('polygon');
    expect(z.points.length).toBeLessThanOrEqual(5);
    expect(z.points.length).toBeGreaterThanOrEqual(3);
  });

  it('un clic sans glisser ne pose rien et sélectionne la zone touchée', () => {
    const b = bench({ zones: [zone('z')] });
    b.click(P(200, 200));
    expect(b.zones()).toHaveLength(1);
    expect(b.engine.selection.ids).toEqual(['z']);
  });

  it('Sélection : glisser déplace la zone (une commande), Suppr la supprime', async () => {
    const b = bench({ zones: [zone('z')], shape: 'select' });
    b.drag(P(200, 200), P(250, 200));
    expect(b.zones()[0]!.points[0]).toEqual(P(150, 100));
    await b.commands.idle();
    expect(b.fog.update).toHaveBeenCalledTimes(1);
    b.engine.controller.keyDown(b.key('Delete'));
    expect(b.zones()).toHaveLength(0);
  });

  it('Échap pendant le tracé : rien n’est écrit', () => {
    const b = bench();
    b.drag(P(100, 100), P(300, 300), {}, false);
    b.engine.controller.keyDown(b.key('Escape'));
    b.engine.controller.pointerUp(b.pointer(P(300, 300), { buttons: 0 }));
    expect(b.zones()).toHaveLength(0);
  });

  it('les chiffres 1 à 4 changent de forme', () => {
    const b = bench();
    b.engine.controller.keyDown(b.key('3', { code: 'Digit3' }));
    expect(b.tool.shape).toBe('lasso');
  });

  it('seules les zones se touchent avec l’outil G', () => {
    const b = bench({ zones: [zone('z')] });
    b.store.getState().upsert('boxes', [{ id: 'box', version: 1, x: 600, y: 600, w: 40, h: 40 }]);
    expect(b.engine.hitTest(P(600, 600))).toBeNull();
    expect(b.engine.hitTest(P(200, 200))?.id).toBe('z');
  });
});

describe('Tout couvrir, tout découvrir', () => {
  it('une commande : fogFull et suppression des zones ; annuler les rend dans l’ordre', async () => {
    const b = bench({
      zones: [zone('a', { order: 2 }), zone('b', { order: 1, mode: 'clear' })],
    });
    void setFogFull(b.engine, true);
    expect(b.store.getState().scene!.fogFull).toBe(true);
    expect(b.zones()).toHaveLength(0);
    await b.commands.idle();
    expect(b.commands.history.undo).toHaveLength(1);
    expect(b.backend.updateScene).toHaveBeenCalledWith({ fogFull: true }, expect.anything());
    await b.commands.undo();
    expect(b.store.getState().scene!.fogFull).toBe(false);
    const recreated = b.fog.create.mock.calls.at(-1)![0] as FogZoneData[];
    expect(recreated.map((z) => z.mode)).toEqual(['clear', 'fog']);
  });

  it('rien à faire : aucune commande', () => {
    const b = bench();
    expect(setFogFull(b.engine, false)).toBeNull();
  });
});
