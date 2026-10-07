import { describe, expect, it } from 'vitest';
import {
  applyWindow,
  decodeMask,
  decodeWindow,
  effectiveWindow,
  encodeMask,
  encodeWindow,
  EXPLORATION_MAX_SIDE,
  explorationGrid,
  ExplorationMask,
  markView,
  packBits,
  playerView,
  prepareScene,
  rasterizeShape,
  unpackBits,
  viewerView,
  windowOf,
  type MarkStats,
  type PreparedScene,
  type View,
  type VisionScene,
} from './index.js';
import { Prng } from './testing/prng.js';
import { boxWalls, dungeon } from './testing/scenes.js';

/** Toutes les cases dont le centre est vu, par force brute. */
function bruteForce(prep: PreparedScene, view: View, cols: number, rows: number) {
  const out = new Uint8Array(cols * rows);
  const cw = prep.width / cols;
  const ch = prep.height / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (view.containsXY((c + 0.5) * cw, (r + 0.5) * ch)) out[r * cols + c] = 1;
  return out;
}

const stats = (): MarkStats => ({ scanned: 0, tested: 0, added: 0 });

describe('explorationGrid', () => {
  it('un quart de case de jeu, cases à peu près carrées', () => {
    expect(explorationGrid(2600, 2600, 100)).toEqual({ cols: 104, rows: 104 });
    expect(explorationGrid(2000, 1000, 50)).toEqual({ cols: 160, rows: 80 });
  });

  it('512 cases par côté au plus, proportions gardées', () => {
    const g = explorationGrid(40_000, 20_000, 100);
    expect(g.cols).toBe(EXPLORATION_MAX_SIDE);
    expect(g.rows).toBe(EXPLORATION_MAX_SIDE / 2);
  });

  it('taille ou case inconnues : une grille utile quand même', () => {
    const g = explorationGrid(0, 0, 0);
    expect(g.cols).toBeGreaterThanOrEqual(1);
    expect(g.cols).toBeLessThanOrEqual(EXPLORATION_MAX_SIDE);
    expect(explorationGrid(1000, 1000, Number.NaN).cols).toBe(100);
  });
});

describe('markView', () => {
  it('marque exactement les cases dont le centre est vu (donjons au hasard)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = new Prng(seed);
      const scene = dungeon(rng, 400);
      const prep = prepareScene(scene);
      const grid = explorationGrid(prep.width, prep.height, 75);
      const observers = [0, 1, 2].map((k) => ({
        id: `o${k}`,
        pos: { x: rng.range(10, prep.width - 10), y: rng.range(10, prep.height - 10) },
        visionRadius: rng.range(0, 300),
      }));
      const view = playerView(prep, observers);
      const mask = ExplorationMask.empty(grid);
      markView(mask, prep, view);
      expect(mask.cells).toEqual(bruteForce(prep, view, grid.cols, grid.rows));
    }
  });

  it('sans brouillard ni mur : toute la carte d’un coup', () => {
    const prep = prepareScene({ bounds: { width: 1000, height: 500 }, segments: [] });
    const mask = ExplorationMask.empty(explorationGrid(1000, 500, 100));
    const rect = markView(
      mask,
      prep,
      viewerView(prep, { id: 'a', pos: { x: 10, y: 10 }, visionRadius: 50 }),
    );
    expect(mask.count()).toBe(40 * 20);
    expect(rect).toEqual({ x: 0, y: 0, w: 40, h: 20 });
  });

  it('un mur coupe la mémoire ; le côté caché reste inexploré', () => {
    const scene: VisionScene = {
      bounds: { width: 1000, height: 1000 },
      segments: [{ id: 'm', a: { x: 500, y: 0 }, b: { x: 500, y: 1000 }, kind: 'wall' }],
    };
    const prep = prepareScene(scene);
    const mask = ExplorationMask.empty(explorationGrid(1000, 1000, 100));
    markView(mask, prep, viewerView(prep, { id: 'a', pos: { x: 200, y: 500 }, visionRadius: 0 }));
    for (let r = 0; r < mask.rows; r++)
      for (let c = 0; c < mask.cols; c++) expect(mask.get(c, r)).toBe(c < mask.cols / 2);
  });

  it('brouillard total : seulement le disque de vision, sans balayer toute la carte', () => {
    const prep = prepareScene({
      bounds: { width: 4000, height: 4000 },
      segments: [],
      fogFull: true,
    });
    const mask = ExplorationMask.empty(explorationGrid(4000, 4000, 100));
    const s = stats();
    markView(
      mask,
      prep,
      viewerView(prep, { id: 'a', pos: { x: 2000, y: 2000 }, visionRadius: 200 }),
      s,
    );
    // Disque de 200 px, cases de 25 px : ≈ π × 8² cases
    expect(mask.count()).toBeGreaterThan(190);
    expect(mask.count()).toBeLessThan(215);
    // Le balayage s'en tient au carré du disque (16 × 16 cases), pas aux 160 × 160 de la carte
    expect(s.scanned).toBeLessThanOrEqual(17 * 17);
  });

  it('une pièce fermée : rien dehors, et de dehors rien dedans', () => {
    const scene: VisionScene = {
      bounds: { width: 1000, height: 1000 },
      segments: boxWalls('salle', 100, 100, 300, 300),
    };
    const prep = prepareScene(scene);
    const grid = explorationGrid(1000, 1000, 100);
    const inside = ExplorationMask.empty(grid);
    markView(inside, prep, viewerView(prep, { id: 'a', pos: { x: 250, y: 250 }, visionRadius: 0 }));
    expect(inside.get(10, 10)).toBe(true);
    expect(inside.get(30, 30)).toBe(false);
    const outside = ExplorationMask.empty(grid);
    markView(
      outside,
      prep,
      viewerView(prep, { id: 'b', pos: { x: 700, y: 700 }, visionRadius: 0 }),
    );
    expect(outside.get(30, 30)).toBe(true);
    expect(outside.get(10, 10)).toBe(false);
  });

  it('une seconde fois : rien de neuf, aucune case testée de nouveau', () => {
    const rng = new Prng(9);
    const prep = prepareScene(dungeon(rng, 400));
    const mask = ExplorationMask.empty(explorationGrid(prep.width, prep.height, 75));
    const view = viewerView(prep, { id: 'a', pos: { x: 400, y: 400 }, visionRadius: 250 });
    expect(markView(mask, prep, view)).not.toBeNull();
    const before = mask.count();
    const s = stats();
    expect(markView(mask, prep, view, s)).toBeNull();
    expect(mask.count()).toBe(before);
    expect(s.added).toBe(0);
    // Les cases déjà explorées sont sautées sans test
    expect(s.tested).toBeLessThan(s.scanned);
  });
});

describe('rasterizeShape', () => {
  const grid = { cols: 10, rows: 10 };
  const bounds = { width: 100, height: 100 };

  it('cercle : les centres dans le disque', () => {
    const win = rasterizeShape(grid, bounds, {
      shape: 'circle',
      center: { x: 50, y: 50 },
      radius: 10,
    })!;
    const mask = ExplorationMask.empty(grid);
    applyWindow(mask, win, 'reveal');
    expect(mask.count()).toBe(4);
    expect(mask.get(4, 4) && mask.get(5, 5)).toBe(true);
  });

  it('polygone : rectangle aligné sur les cases', () => {
    const win = rasterizeShape(grid, bounds, {
      shape: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 20 },
        { x: 0, y: 20 },
      ],
    })!;
    expect(win).toMatchObject({ x: 0, y: 0, w: 3, h: 2 });
    expect([...win.cells]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('hors de la carte ou trop petite : rien', () => {
    expect(
      rasterizeShape(grid, bounds, { shape: 'circle', center: { x: -50, y: -50 }, radius: 10 }),
    ).toBeNull();
    expect(
      rasterizeShape(grid, bounds, { shape: 'circle', center: { x: 52, y: 52 }, radius: 1 }),
    ).toBeNull();
  });
});

describe('fenêtres', () => {
  it('révéler puis oublier ; l’annulation exacte ne touche que ce que le geste a changé', () => {
    const mask = ExplorationMask.empty({ cols: 8, rows: 8 });
    applyWindow(mask, { x: 0, y: 0, w: 2, h: 1, cells: Uint8Array.from([1, 1]) }, 'reveal');
    const win = { x: 0, y: 0, w: 4, h: 1, cells: Uint8Array.from([1, 1, 1, 1]) };
    const added = effectiveWindow(mask, win, 'reveal')!;
    expect([...added.cells]).toEqual([0, 0, 1, 1]);
    expect(applyWindow(mask, win, 'reveal')).toEqual({ x: 2, y: 0, w: 2, h: 1 });
    // Annuler : oublier ce qui a été ajouté seulement
    applyWindow(mask, added, 'forget');
    expect(mask.get(0, 0) && mask.get(1, 0)).toBe(true);
    expect(mask.get(2, 0) || mask.get(3, 0)).toBe(false);
    expect(applyWindow(mask, win, 'set')).toEqual({ x: 2, y: 0, w: 2, h: 1 });
    expect(() => applyWindow(mask, { ...win, x: 6 }, 'set')).toThrow(RangeError);
  });

  it('codage en plages : aller-retour, fenêtres et masques', () => {
    const rng = new Prng(3);
    for (let k = 0; k < 50; k++) {
      const cols = rng.int(1, 60);
      const rows = rng.int(1, 60);
      const mask = new ExplorationMask(cols, rows);
      const density = rng.next();
      for (let i = 0; i < mask.cells.length; i++) mask.cells[i] = rng.next() < density ? 1 : 0;
      expect(decodeMask(mask, encodeMask(mask)).cells).toEqual(mask.cells);
      const x = rng.int(0, cols - 1);
      const y = rng.int(0, rows - 1);
      const rect = { x, y, w: rng.int(1, cols - x), h: rng.int(1, rows - y) };
      const win = windowOf(mask, rect);
      expect(decodeWindow(encodeWindow(win))).toEqual(win);
    }
  });

  it('une tache se code en peu d’octets', () => {
    const mask = ExplorationMask.empty({ cols: 104, rows: 104 });
    const prep = prepareScene({
      bounds: { width: 2600, height: 2600 },
      segments: [],
      fogFull: true,
    });
    markView(
      mask,
      prep,
      viewerView(prep, { id: 'a', pos: { x: 1300, y: 1300 }, visionRadius: 600 }),
    );
    expect(encodeMask(mask).data.length).toBeLessThan(300);
  });

  it('plages invalides refusées', () => {
    const good = encodeWindow({ x: 0, y: 0, w: 4, h: 1, cells: Uint8Array.from([0, 1, 1, 0]) });
    expect(() => decodeWindow({ ...good, w: 5 })).toThrow(RangeError);
    expect(() => decodeWindow({ ...good, w: 3 })).toThrow(RangeError);
    expect(() => decodeWindow({ ...good, data: '!!' })).toThrow(RangeError);
    expect(() => decodeWindow({ ...good, w: 0 })).toThrow(RangeError);
    expect(() => decodeMask({ cols: 4, rows: 2 }, good)).toThrow(RangeError);
  });

  it('bits tassés : aller-retour', () => {
    const rng = new Prng(5);
    const cells = new Uint8Array(1003);
    for (let i = 0; i < cells.length; i++) cells[i] = rng.chance(0.4) ? 1 : 0;
    const packed = packBits(cells);
    expect(packed.length).toBe(126);
    expect(unpackBits(packed, cells.length)).toEqual(cells);
  });
});
