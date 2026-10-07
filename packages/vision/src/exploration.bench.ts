/**
 * Budgets de la mémoire de l'exploration (docs/exploration.md § 6), sur le donjon du banc de
 * `vision.bench.ts` (2 000 segments, 4 800 × 4 800 px, brouillard total, zones, lumières, pièces),
 * case de jeu de 100 px : grille de 192 × 192 cases d'exploration.
 * - marquage d'une vue en régime (cases déjà explorées) : < 0,5 ms ;
 * - marquage d'une vue neuve (premier passage) : < 3 ms ;
 * - traînée de 32 points (une vue par point) : < 30 ms ;
 * - codage du masque entier (événement de réinitialisation, chargement) : indicatif.
 */
import { bench, describe } from 'vitest';
import {
  decodeMask,
  encodeMask,
  encodeWindow,
  explorationGrid,
  ExplorationMask,
  markView,
  playerView,
  prepareScene,
  viewerView,
  windowOf,
  type Viewer,
} from './index.js';
import { Prng } from './testing/prng.js';
import { dungeon } from './testing/scenes.js';

const rng = new Prng(42);
const scene = dungeon(rng, 2000);
const prep = prepareScene(scene);
const size = scene.bounds.width;
const grid = explorationGrid(size, size, 100);

const party: Viewer[] = [0, 1, 2, 3].map((k) => ({
  id: `o${k}`,
  pos: { x: size / 2 + (k - 1.5) * 120 + 17, y: size / 2 + 23 },
  visionRadius: 300,
}));
const view = playerView(prep, party);

// Masque en régime : la vue du groupe déjà marquée
const steady = ExplorationMask.empty(grid);
markView(steady, prep, view);

// Chemin d'un glisser : 32 points, une case de jeu d'écart
const trail: Viewer[] = Array.from({ length: 32 }, (_, k) => ({
  id: 't',
  pos: { x: size / 2 - 1600 + k * 100 + 3, y: size / 2 + 47 },
  visionRadius: 300,
}));

// Masque à moitié exploré, en taches (chargement, réinitialisation)
const half = ExplorationMask.empty(grid);
for (let k = 0; k < 60; k++)
  markView(
    half,
    prep,
    viewerView(prep, {
      id: 'x',
      pos: { x: rng.range(0, size), y: rng.range(0, size) },
      visionRadius: 300,
    }),
  );
const encoded = encodeMask(half);

console.log(
  `grille ${grid.cols} × ${grid.rows} ; groupe : ${steady.count()} cases vues ; masque en taches : ` +
    `${half.count()} cases, ${encoded.data.length} caractères codés ` +
    `(bits tassés : ${Math.ceil((grid.cols * grid.rows) / 8)} octets)`,
);

describe('markView', () => {
  bench('groupe de 4, régime établi (budget 0,5 ms)', () => {
    markView(steady, prep, view);
  });
  bench('groupe de 4, premier passage (budget 3 ms)', () => {
    markView(ExplorationMask.empty(grid), prep, view);
  });
  bench('traînée de 32 points, vues comprises (budget 30 ms)', () => {
    const mask = steady.clone();
    for (const v of trail) markView(mask, prep, viewerView(prep, v));
  });
});

describe('codage', () => {
  bench('masque entier en plages (indicatif)', () => {
    encodeMask(half);
  });
  bench('masque entier depuis les plages (indicatif)', () => {
    decodeMask(grid, encoded);
  });
  bench('fenêtre d’un pas (32 × 32 cases)', () => {
    encodeWindow(windowOf(half, { x: 80, y: 80, w: 32, h: 32 }));
  });
});
