import { afterEach, describe, expect, it } from 'vitest';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { boxKind, setup, spyPersistence, type Box } from '@/lib/map/engine/test-kit';
import { CLICK_FADE_MS, CLICK_HOLD_MS } from './click-distance';
import { measurePrefs, setClickDistance } from './prefs';
import { measureModuleOf, registerMeasurements } from './register';

const P = (x: number, y: number) => ({ x, y });

const PLAYER: MapViewer = { userId: 'joueur', role: 'player', characterIds: ['aria', 'bree'] };
const GM: MapViewer = { userId: 'mj', role: 'gm', characterIds: [] };

function token(id: string, x: number, y: number, characterId: string, extra: Partial<Box> = {}) {
  return { id, version: 1, x, y, w: 50, h: 50, layerId: null, z: 0, characterId, ...extra };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function bench(opts: { viewer?: MapViewer; tokens?: Box[]; objects?: Box[]; decor?: Box[] } = {}) {
  const kit = setup({ viewer: opts.viewer ?? PLAYER });
  const e = kit.engine;
  e.registerKind(boxKind(spyPersistence(), { id: 'token', collection: 'tokens' }));
  e.registerKind(boxKind(spyPersistence(), { id: 'object', collection: 'objects' }));
  e.registerKind(boxKind(spyPersistence(), { id: 'decor', collection: 'decors' }));
  const s = kit.store.getState();
  s.replaceCollection('tokens', opts.tokens ?? []);
  s.replaceCollection('objects', opts.objects ?? []);
  s.replaceCollection('decors', opts.decor ?? []);
  // Distance au clic activée, quel que soit ce qu'un test précédent a gardé ; 1 case = 1 m
  measurePrefs(e).setState({ clickDistance: true });
  s.patchSettings({ unitsPerCell: 1, diagonals: 'chebyshev' });
  cleanup = registerMeasurements(e);
  const cd = measureModuleOf(e)!.clickDistance;
  /** Mesure affichée juste après le clic. */
  const shown = () => {
    const a = cd.active;
    return a ? cd.resolve(a.at) : null;
  };
  return { ...kit, cd, shown };
}

describe('distance au clic : personnage d’où mesurer', () => {
  it('depuis le personnage incarné, même si un autre de ses tokens est plus près', () => {
    const b = bench({
      tokens: [token('t-aria', 100, 100, 'aria'), token('t-bree', 800, 800, 'bree')],
    });
    b.click(P(700, 100));
    const m = b.shown()!;
    expect(m.from).toEqual(P(100, 100));
    expect(m.to).toEqual(P(700, 100));
    // 600 px / 50 px par case = 12 unités ; grille absente : pas de cases
    expect(m.label).toBe('12 m');
  });

  it('sans le personnage incarné sur la carte : son token le plus proche du clic', () => {
    const b = bench({
      tokens: [token('t-bree', 800, 800, 'bree'), token('t-autre', 100, 100, 'bree')],
    });
    b.click(P(150, 300));
    expect(b.shown()!.from).toEqual(P(100, 100));
  });

  it('aucun token à lui : rien', () => {
    const b = bench({ tokens: [token('gob', 300, 300, 'gobelin')] });
    b.click(P(600, 600));
    expect(b.cd.active).toBeNull();
  });

  it('clic sur son propre token, ou sur place : rien', () => {
    const b = bench({ tokens: [token('t-aria', 100, 100, 'aria')] });
    b.click(P(110, 105));
    expect(b.cd.active).toBeNull();
  });

  it('Alt + clic (ping) ou préférence coupée : rien', () => {
    const b = bench({ tokens: [token('t-aria', 100, 100, 'aria')] });
    b.click(P(600, 100), { alt: true });
    expect(b.cd.active).toBeNull();
    setClickDistance(b.engine, false);
    b.click(P(600, 100));
    expect(b.cd.active).toBeNull();
    setClickDistance(b.engine, true);
  });
});

describe('distance au clic : point visé', () => {
  it('le centre d’un token ou d’un objet cliqué ; le clic garde son effet (sélection)', () => {
    const b = bench({
      tokens: [token('t-aria', 100, 100, 'aria'), token('gob', 510, 310, 'gobelin')],
      objects: [{ id: 'coffre', version: 1, x: 300, y: 700, w: 60, h: 60, layerId: null, z: 0 }],
    });
    b.click(P(520, 320));
    expect(b.shown()!.to).toEqual(P(510, 310));
    expect(b.engine.selection.ids).toEqual(['gob']);
    b.click(P(290, 690));
    expect(b.shown()!.to).toEqual(P(300, 700));
  });

  it('un élément masqué (non vu) ou un décor : le point cliqué, rien de plus', () => {
    const b = bench({
      tokens: [token('t-aria', 100, 100, 'aria'), token('cache', 500, 500, 'gobelin')],
      decor: [{ id: 'arbre', version: 1, x: 300, y: 300, w: 120, h: 120, layerId: null, z: 0 }],
    });
    b.engine.setMask(b.engine.entity('cache')!, 'vision', true);
    b.click(P(510, 490));
    expect(b.shown()!.to).toEqual(P(510, 490));
    b.click(P(320, 280));
    expect(b.shown()!.to).toEqual(P(320, 280));
  });

  it('suit les tokens qui bougent', () => {
    const b = bench({
      tokens: [token('t-aria', 100, 100, 'aria'), token('gob', 500, 100, 'gobelin')],
    });
    b.click(P(500, 100));
    const aria = b.engine.entity('t-aria')!;
    b.engine.setPreview(aria, { ...aria.geometry, x: 300, y: 100 });
    const m = b.shown()!;
    expect(m.from).toEqual(P(300, 100));
    expect(m.label).toBe('4 m');
  });
});

describe('distance au clic : unités et cases', () => {
  it('arrondi à la demi-unité, cases de la grille de jeu selon le comptage', () => {
    const b = bench({ tokens: [token('t-aria', 125, 125, 'aria')] });
    b.store.getState().setScene(
      {
        ...b.store.getState().scene!,
        grids: [
          {
            id: 'jeu',
            name: 'Jeu',
            size: 50,
            offsetX: 0,
            offsetY: 0,
            color: '#000000',
            opacity: 1,
            thickness: 1,
            visibleToPlayers: true,
            primary: true,
          },
        ],
      },
      { force: true },
    );
    // 3 cases en diagonale : 4,24 unités → « 4 m », 3 cases (diagonale : 1 case)
    b.click(P(275, 275));
    expect(b.shown()!.label).toBe('4 m · 3 cases');
    // Règle des diagonales de la table (MJ)
    b.engine.store.getState().patchSettings({ diagonals: 'alternating' });
    expect(b.shown()!.label).toBe('4 m · 4 cases');
    b.engine.store.getState().patchSettings({ diagonals: 'off' });
    expect(b.shown()!.label).toBe('4 m');
  });
});

describe('distance au clic : effacement', () => {
  it('reste, s’efface doucement, puis disparaît ; le clic suivant la remplace', () => {
    const b = bench({ tokens: [token('t-aria', 100, 100, 'aria')] });
    b.click(P(600, 100));
    const at = b.cd.active!.at;
    expect(b.cd.resolve(at + CLICK_HOLD_MS - 1)).toMatchObject({ alpha: 1, fading: false });
    const mid = b.cd.resolve(at + CLICK_HOLD_MS + CLICK_FADE_MS / 2)!;
    expect(mid.fading).toBe(true);
    expect(mid.alpha).toBeCloseTo(0.5);
    // Juste après l'échéance (l'heure de départ est fractionnaire : pas d'égalité exacte)
    expect(b.cd.resolve(at + CLICK_HOLD_MS + CLICK_FADE_MS + 1)).toBeNull();
    expect(b.cd.active).toBeNull();

    b.click(P(600, 100));
    b.click(P(100, 600));
    expect(b.shown()!.to).toEqual(P(100, 600));
  });
});

describe('⌘/Ctrl + clic : depuis le token sélectionné, sélection gardée', () => {
  it('MJ : clic simple muet ; ⌘ + clic mesure depuis le token sélectionné', () => {
    const b = bench({
      viewer: GM,
      tokens: [token('gob', 100, 100, 'gobelin'), token('aria', 600, 100, 'aria')],
    });
    b.engine.selection.replace(['gob']);
    b.click(P(600, 100), { meta: true });
    expect(b.shown()!.from).toEqual(P(100, 100));
    expect(b.shown()!.to).toEqual(P(600, 100));
    expect(b.engine.selection.ids).toEqual(['gob']);
    // Ctrl aussi, plusieurs cibles de suite
    b.click(P(100, 400), { ctrl: true });
    expect(b.shown()!.to).toEqual(P(100, 400));
    expect(b.engine.selection.ids).toEqual(['gob']);
    // Clic simple : la sélection change, aucune mesure
    b.click(P(600, 100));
    expect(b.cd.active).toBeNull();
    expect(b.engine.selection.ids).toEqual(['aria']);
  });

  it('MJ sans token sélectionné : rien ; ⌘ + glisser déplace la vue', () => {
    const b = bench({ viewer: GM, tokens: [token('gob', 100, 100, 'gobelin')] });
    b.click(P(600, 100), { meta: true });
    expect(b.cd.active).toBeNull();
    const before = b.engine.camera.x;
    b.drag(P(500, 500), P(300, 500), { meta: true });
    expect(b.engine.camera.x).not.toBe(before);
    expect(b.cd.active).toBeNull();
  });

  it('joueur : ⌘ + clic depuis le token sélectionné, sinon depuis son personnage', () => {
    const b = bench({
      tokens: [token('t-aria', 100, 100, 'aria'), token('gob', 400, 400, 'gobelin')],
    });
    b.engine.selection.replace(['gob']);
    b.click(P(400, 700), { meta: true });
    expect(b.shown()!.from).toEqual(P(400, 400));
    b.engine.selection.clear();
    b.click(P(400, 700), { meta: true });
    expect(b.shown()!.from).toEqual(P(100, 100));
  });
});
