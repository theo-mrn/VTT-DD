import type { MapExploration } from '@vtt/contracts';
import {
  encodeMask,
  encodeWindow,
  ExplorationMask,
  prepareScene,
  viewerView,
  windowOf,
} from '@vtt/vision';
import { describe, expect, it, vi } from 'vitest';
import { setup } from '@/lib/map/engine/test-kit';
import type { ExplorationApi } from './api';
import { editCommand, resetCommand, shapeCommand } from './commands';
import { attachExploration, explorationOf, LOCAL_TTL_MS } from './model';
import { registerExploration } from './register';
import { FOG_ZONES } from '@/lib/map/features/fog/engine/model';
import { registerFog } from '@/lib/map/features/fog/engine/register';
import { FogTool } from '@/lib/map/features/fog/engine/tool';
import { decimate, TrailRecorder } from './trail';

const P = (x: number, y: number) => ({ x, y });

/** Carte de test : 1250 × 1250, case de 50 px → grille de 100 × 100 cases de 12,5 px. */
const GRID = { cols: 100, rows: 100 };

function exploration(version: number, mask = ExplorationMask.empty(GRID)): MapExploration {
  return {
    mapId: 'carte',
    scope: 'party',
    cols: mask.cols,
    rows: mask.rows,
    version,
    window: encodeMask(mask),
  };
}

function fakeApi(): ExplorationApi & {
  get: ReturnType<typeof vi.fn>;
  edit: ReturnType<typeof vi.fn>;
  trail: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(async () => null),
    edit: vi.fn(async () => null),
    trail: vi.fn(async () => 1),
  };
}

/** Moteur à blanc, exploration active, masque vide connu (version 1). */
function bench(opts: { enabled?: boolean; mask?: ExplorationMask } = {}) {
  const kit = setup();
  const scene = kit.store.getState().scene!;
  kit.store
    .getState()
    .setScene({ ...scene, exploration: opts.enabled === false ? 'off' : 'party' }, { force: true });
  kit.store.getState().setExtra('exploration', exploration(1, opts.mask));
  const api = fakeApi();
  const timers: (() => void)[] = [];
  const attached = attachExploration(kit.engine, api, {
    set: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clear: () => undefined,
  });
  return { ...kit, api, model: attached.model, attached, timers };
}

describe('mémoire : masque du serveur', () => {
  it('lit le chargement de la carte, puis applique les versions dans l’ordre', () => {
    const b = bench();
    expect(b.model.active).toBe(true);
    expect(b.model.version).toBe(1);
    const next = ExplorationMask.empty(GRID);
    next.cells[0] = 1;
    b.model.applyUpdate({
      mapId: 'carte',
      scope: 'party',
      version: 2,
      cols: 100,
      rows: 100,
      window: encodeWindow(windowOf(next, { x: 0, y: 0, w: 2, h: 2 })),
    });
    expect(b.model.explored(0, 0)).toBe(true);
    expect(b.model.version).toBe(2);
    // Ancienne version : ignorée
    b.model.applyUpdate({
      mapId: 'carte',
      scope: 'party',
      version: 2,
      cols: 100,
      rows: 100,
      window: encodeWindow(windowOf(ExplorationMask.empty(GRID), { x: 0, y: 0, w: 1, h: 1 })),
    });
    expect(b.model.explored(0, 0)).toBe(true);
    expect(b.api.get).not.toHaveBeenCalled();
  });

  it('une relecture demandée pendant une autre en relance une après elle', async () => {
    const b = bench();
    let release!: () => void;
    b.api.get.mockImplementationOnce(
      () => new Promise((r) => (release = () => r(null))) as Promise<null>,
    );
    b.api.get.mockResolvedValueOnce(exploration(7));
    const first = b.model.reload();
    void b.model.reload();
    release();
    await first;
    expect(b.api.get).toHaveBeenCalledTimes(2);
    expect(b.model.version).toBe(7);
  });

  it('un trou de version fait relire le masque ; une autre scène est ignorée', async () => {
    const b = bench();
    const win = encodeWindow(windowOf(ExplorationMask.empty(GRID), { x: 0, y: 0, w: 1, h: 1 }));
    b.model.applyUpdate({
      mapId: 'ailleurs',
      scope: 'party',
      version: 9,
      cols: 100,
      rows: 100,
      window: win,
    });
    expect(b.api.get).not.toHaveBeenCalled();
    const full = ExplorationMask.empty(GRID);
    full.cells.fill(1);
    b.api.get.mockResolvedValueOnce(exploration(5, full));
    b.model.applyUpdate({
      mapId: 'carte',
      scope: 'party',
      version: 4,
      cols: 100,
      rows: 100,
      window: win,
    });
    await vi.waitFor(() => expect(b.model.version).toBe(5));
    expect(b.api.get).toHaveBeenCalledTimes(1);
    expect(b.model.explored(50, 50)).toBe(true);
  });

  it('réinitialisation reçue (toute la grille) : remplace le masque, même autre grille', () => {
    const b = bench();
    const grid = { cols: 20, rows: 20 };
    const mask = ExplorationMask.empty(grid);
    b.model.applyUpdate({
      mapId: 'carte',
      scope: 'party',
      version: 3,
      cols: 20,
      rows: 20,
      window: encodeWindow(windowOf(mask, { x: 0, y: 0, w: 20, h: 20 })),
    });
    expect(b.model.cols).toBe(20);
    expect(b.model.version).toBe(3);
  });

  it('exploration coupée : rien de montré ; réactivée sans masque, relecture', () => {
    const b = bench({ enabled: false });
    expect(b.model.active).toBe(false);
    b.store.getState().setExtra('exploration', null);
    const scene = b.store.getState().scene!;
    b.store.getState().setScene({ ...scene, exploration: 'party', version: scene.version + 1 });
    expect(b.api.get).toHaveBeenCalled();
  });

  it('écrit la texture : 4 octets par case', () => {
    const mask = ExplorationMask.empty(GRID);
    mask.cells[3] = 1;
    const b = bench({ mask });
    const out = new Uint8Array(100 * 100 * 4);
    b.model.write(out);
    expect([...out.subarray(12, 16)]).toEqual([255, 255, 255, 255]);
    expect(out[0]).toBe(0);
  });
});

describe('mémoire : couche locale (glisser d’un joueur)', () => {
  it('marque ce que voit le joueur, puis s’efface après le délai', () => {
    const b = bench();
    const prep = prepareScene({
      bounds: { width: 1250, height: 1250 },
      segments: [],
      fogFull: true,
    });
    const view = viewerView(prep, { id: 'h', pos: P(600, 600), visionRadius: 100 });
    const revision = b.model.revision;
    expect(b.model.markLocal(prep, view)).toBe(true);
    expect(b.model.revision).toBeGreaterThan(revision);
    expect(b.model.explored(48, 48)).toBe(true);
    // Une seconde fois : rien de neuf
    expect(b.model.markLocal(prep, view)).toBe(false);
    // Le serveur n'a rien : le masque du serveur reste vide
    expect(b.model.serverMask()!.count()).toBe(0);
    expect(b.timers.length).toBeGreaterThan(0);
    b.timers.at(-1)!();
    expect(b.model.explored(48, 48)).toBe(false);
    expect(LOCAL_TTL_MS).toBe(3000);
  });
});

describe('gestes du MJ', () => {
  it('révéler : seules les cases neuves ; l’annuler les oublie, rien d’autre', async () => {
    const mask = ExplorationMask.empty(GRID);
    mask.cells[0] = 1;
    const b = bench({ mask });
    b.api.edit.mockImplementation(async () => null);
    const win = { x: 0, y: 0, w: 2, h: 1, cells: Uint8Array.from([1, 1]) };
    const cmd = shapeCommand(b.model, b.api, 'reveal', win)!;
    await b.engine.execute(cmd);
    expect(b.model.explored(0, 0) && b.model.explored(1, 0)).toBe(true);
    const sent = b.api.edit.mock.calls[0]![0];
    expect(sent).toMatchObject({ op: 'reveal', cols: 100, rows: 100 });
    // La fenêtre envoyée ne garde que la case ajoutée
    expect(sent.window).toEqual(
      encodeWindow({ x: 0, y: 0, w: 2, h: 1, cells: Uint8Array.from([0, 1]) }),
    );
    await b.commands.undo();
    expect(b.model.explored(0, 0)).toBe(true);
    expect(b.model.explored(1, 0)).toBe(false);
    expect(b.api.edit.mock.calls[1]![0]).toMatchObject({ op: 'forget' });
    // Tout est déjà révélé : aucune commande
    b.model.editLocal('reveal', win);
    expect(shapeCommand(b.model, b.api, 'reveal', win)).toBeNull();
  });

  it('réinitialiser, puis annuler : l’ancien masque revient', async () => {
    const mask = ExplorationMask.empty(GRID);
    mask.cells[5] = 1;
    const b = bench({ mask });
    await b.engine.execute(resetCommand(b.model, b.api)!);
    expect(b.model.explored(5, 0)).toBe(false);
    expect(b.api.edit).toHaveBeenCalledWith({ op: 'reset' });
    await b.commands.undo();
    expect(b.model.explored(5, 0)).toBe(true);
    expect(b.api.edit.mock.calls[1]![0]).toMatchObject({ op: 'reveal', cols: 100, rows: 100 });
  });

  it('échec du serveur : le geste est défait', async () => {
    const b = bench();
    b.api.edit.mockRejectedValueOnce(new Error('panne'));
    const win = { x: 3, y: 3, w: 1, h: 1, cells: Uint8Array.from([1]) };
    await b.engine.execute(editCommand(b.model, b.api, 'reveal', win, GRID));
    expect(b.model.explored(3, 3)).toBe(false);
  });
});

describe('outil Brouillard, gestes sur la mémoire', () => {
  function toolBench(opts: { known?: boolean } = {}) {
    const kit = setup();
    const scene = kit.store.getState().scene!;
    kit.store.getState().setScene({ ...scene, exploration: 'party' }, { force: true });
    kit.store.getState().setExtra('exploration', opts.known === false ? null : exploration(1));
    const api = fakeApi();
    const off = registerExploration(kit.engine, { api });
    const offFog = registerFog(kit.engine);
    kit.engine.tools.activate('fog');
    const tool = kit.engine.tools.active as FogTool;
    tool.setMode('reveal');
    const cleanup = () => {
      offFog();
      off();
    };
    return { ...kit, tool, cleanup, model: explorationOf(kit.engine)! };
  }

  it('un rectangle révèle ses cases ; Alt oublie ; Échap n’écrit rien', async () => {
    const b = toolBench();
    expect(b.tool.mode).toBe('reveal');
    // Aimantation à la case (50 px) : rectangle de 100 × 100 px = 8 × 8 cases de 12,5 px
    b.drag(P(100, 100), P(200, 200));
    await b.commands.idle();
    expect(b.model.explored(8, 8)).toBe(true);
    expect(b.model.explored(15, 15)).toBe(true);
    expect(b.model.explored(16, 16)).toBe(false);
    expect(b.model.serverMask()!.count()).toBe(64);
    // Alt : oublier, le temps du geste
    b.drag(P(100, 100), P(150, 150), { alt: true });
    await b.commands.idle();
    expect(b.model.serverMask()!.count()).toBe(64 - 16);
    // Échap pendant le geste
    b.drag(P(400, 400), P(500, 500), {}, false);
    b.engine.controller.keyDown(b.key('Escape'));
    b.engine.controller.pointerUp(b.pointer(P(500, 500), { buttons: 0 }));
    await b.commands.idle();
    expect(b.model.explored(35, 35)).toBe(false);
    // Aucune zone de brouillard posée par ces gestes
    expect(b.store.getState().collections[FOG_ZONES]?.size ?? 0).toBe(0);
    b.cleanup();
    expect(explorationOf(b.engine)).toBeNull();
  });

  it('avant toute exploration du groupe : le MJ révèle déjà, à la grille de la scène', async () => {
    const b = toolBench({ known: false });
    expect(b.model.active).toBe(false);
    b.drag(P(100, 100), P(200, 200));
    await b.commands.idle();
    expect(b.model.cols).toBe(100);
    expect(b.model.explored(10, 10)).toBe(true);
    b.cleanup();
  });

  it('chiffres : la forme, sans Sélection ; mémoire coupée : pas de geste sur elle', () => {
    const b = toolBench();
    b.tool.setShape('select');
    expect(b.tool.shape).toBe('rect');
    b.engine.controller.keyDown(b.key('2', { code: 'Digit2' }));
    expect(b.tool.shape).toBe('circle');
    b.engine.controller.keyDown(b.key('3', { code: 'Digit3' }));
    expect(b.tool.shape).toBe('lasso');
    b.engine.controller.keyDown(b.key('4', { code: 'Digit4' }));
    expect(b.tool.shape).toBe('lasso');
    const scene = b.store.getState().scene!;
    b.store.getState().setScene({ ...scene, exploration: 'off', version: scene.version + 1 });
    expect(b.tool.down(b.pointer(P(100, 100)), b.engine)).toBe(false);
    b.cleanup();
  });
});

describe('traînées', () => {
  it('décime en gardant le premier et le dernier point', () => {
    const pts = Array.from({ length: 100 }, (_, i) => P(i, 0));
    const out = decimate(pts, 32);
    expect(out).toHaveLength(32);
    expect(out[0]).toEqual(P(0, 0));
    expect(out.at(-1)).toEqual(P(99, 0));
    expect(decimate(pts.slice(0, 3), 32)).toHaveLength(3);
  });

  it('un point par case glissée, envoyé après la réponse du déplacement', async () => {
    const b = bench();
    const token = {
      id: 'heros',
      kind: { collection: 'tokens' },
      state: { dragging: true },
      current: { x: 0, y: 0 },
      data: { characterId: 'perso', visibility: 'ally' },
    };
    const engine = b.engine as unknown as {
      entities(): Iterable<unknown>;
      viewer: unknown;
    };
    engine.entities = () => [token];
    const rec = new TrailRecorder(b.engine, b.model, b.api);
    for (let x = 0; x <= 400; x += 10) {
      token.current = { x, y: 100 };
      rec.frame(1000 + x);
    }
    let resolve!: (ok: boolean) => void;
    const done = new Promise<boolean>((r) => (resolve = r));
    rec.moved([{ entity: token as never, from: P(0, 100), to: P(400, 100) }], done, 1400);
    expect(b.api.trail).not.toHaveBeenCalled();
    resolve(true);
    await done;
    await Promise.resolve();
    expect(b.api.trail).toHaveBeenCalledTimes(1);
    const { trails } = b.api.trail.mock.calls[0]![0];
    expect(trails[0].tokenId).toBe('heros');
    // MJ : un PNJ ennemi n'est pas un observateur du groupe, sa traînée ne part pas
    token.data = { characterId: 'gobelin', visibility: 'visible' };
    rec.frame(2000);
    rec.moved(
      [{ entity: token as never, from: P(0, 0), to: P(400, 0) }],
      Promise.resolve(true),
      2000,
    );
    await Promise.resolve();
    expect(b.api.trail).toHaveBeenCalledTimes(1);
    // Un point toutes les cases (50 px), sauf tout près de l'arrivée
    expect(trails[0].points.map((p: { x: number }) => p.x)).toEqual([
      0, 50, 100, 150, 200, 250, 300, 350,
    ]);
  });

  it('déplacement refusé, ou glisser ancien : rien ne part', async () => {
    const b = bench();
    const token = {
      id: 'heros',
      kind: { collection: 'tokens' },
      state: { dragging: true },
      current: { x: 0, y: 0 },
      data: { characterId: 'perso', visibility: 'ally' },
    };
    (b.engine as unknown as { entities(): Iterable<unknown> }).entities = () => [token];
    const rec = new TrailRecorder(b.engine, b.model, b.api);
    rec.frame(1000);
    token.current = { x: 200, y: 0 };
    rec.frame(1016);
    rec.moved(
      [{ entity: token as never, from: P(0, 0), to: P(400, 0) }],
      Promise.resolve(false),
      1020,
    );
    await Promise.resolve();
    rec.frame(1100);
    rec.moved(
      [{ entity: token as never, from: P(0, 0), to: P(400, 0) }],
      Promise.resolve(true),
      5000,
    );
    await Promise.resolve();
    expect(b.api.trail).not.toHaveBeenCalled();
  });
});
