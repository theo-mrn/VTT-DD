/**
 * Banc du rendu de la vision en vrai WebGL (Chromium sans interface) : chaque scène est dessinée
 * par le moteur et le rendu de la carte, puis l'obscurité est lue à des points choisis (0 : vu,
 * 1 : dans l'ombre). Les tests unitaires du rendu tournent sans WebGL ; ce banc attrape ce
 * qu'ils ne voient pas (masques Pixi, tampons réutilisés).
 *
 *   node scripts/vision-render/run.mjs            (depuis frontend/)
 *   CHROME=/chemin/vers/chrome node scripts/vision-render/run.mjs
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, '..', '..');

const P = (x, y) => ({ x, y });
const wall = (id, pts, extra = {}) => ({ id, kind: 'wall', points: pts, ...extra });
const room = (left) => [
  wall('w', [P(500, 600), P(800, 600), P(800, 300), P(500, 300)]),
  { id: 'l', points: [P(500, 300), P(500, 600)], ...left },
];
const cases = [
  {
    name: 'mur seul : devant vu, derrière dans l’ombre, à côté vu',
    obstacles: [wall('m', [P(500, 300), P(500, 700)])],
    moves: [P(200, 500)],
    probes: [
      [P(300, 500), 0],
      [P(700, 500), 1],
      [P(700, 120), 0],
    ],
  },
  {
    name: 'salle à fenêtre : dedans vu, derrière le mur du fond dans l’ombre',
    obstacles: room({ kind: 'window' }),
    moves: [P(300, 450)],
    probes: [
      [P(650, 450), 0],
      [P(900, 450), 1],
      [P(900, 200), 1],
      [P(200, 450), 0],
    ],
  },
  {
    name: 'même salle après plusieurs déplacements (vue fantôme)',
    obstacles: room({ kind: 'window' }),
    moves: [P(100, 100), P(950, 950), P(100, 900), P(300, 450)],
    probes: [
      [P(650, 450), 0],
      [P(900, 450), 1],
      [P(900, 200), 1],
    ],
  },
  {
    name: 'salle à porte fermée, vue de dehors : intérieur noir',
    obstacles: room({ kind: 'door', isOpen: false }),
    moves: [P(300, 450)],
    probes: [
      [P(650, 450), 1],
      [P(900, 450), 1],
      [P(200, 450), 0],
    ],
  },
  {
    name: 'salle à porte ouverte : dedans vu, derrière le fond dans l’ombre',
    obstacles: room({ kind: 'door', isOpen: true }),
    moves: [P(300, 450)],
    probes: [
      [P(650, 450), 0],
      [P(900, 450), 1],
    ],
  },
  {
    name: 'héros dans la salle fermée : dedans vu, dehors noir',
    obstacles: room({ kind: 'door', isOpen: false }),
    moves: [P(650, 450)],
    probes: [
      [P(600, 400), 0],
      [P(300, 450), 1],
      [P(900, 450), 1],
    ],
  },
  {
    name: 'salle à fenêtre et une autre salle fermée ailleurs (masque imbriqué)',
    obstacles: [
      ...room({ kind: 'window' }),
      wall('autre', [P(50, 750), P(250, 750), P(250, 950), P(50, 950), P(50, 750)]),
    ],
    moves: [P(300, 450)],
    probes: [
      [P(650, 450), 0],
      [P(900, 450), 1],
      [P(900, 200), 1],
      [P(150, 850), 1],
      [P(200, 450), 0],
    ],
  },
  {
    name: 'deux salles côte à côte, porte fermée entre elles : la voisine noire',
    obstacles: [
      wall('a', [P(300, 300), P(500, 300)]),
      wall('b', [P(500, 300), P(700, 300), P(700, 600), P(500, 600)]),
      wall('c', [P(500, 600), P(300, 600), P(300, 300)]),
      { id: 'p', kind: 'door', isOpen: false, points: [P(500, 300), P(500, 600)] },
    ],
    moves: [P(400, 450)],
    probes: [
      [P(420, 400), 0],
      [P(600, 450), 1],
      [P(100, 450), 1],
    ],
  },
  {
    name: 'mêmes salles, porte ouverte : la voisine vue par la porte',
    obstacles: [
      wall('a', [P(300, 300), P(500, 300)]),
      wall('b', [P(500, 300), P(700, 300), P(700, 600), P(500, 600)]),
      wall('c', [P(500, 600), P(300, 600), P(300, 300)]),
      { id: 'p', kind: 'door', isOpen: true, points: [P(500, 300), P(500, 600)] },
    ],
    moves: [P(400, 450)],
    probes: [
      [P(600, 450), 0],
      [P(100, 450), 1],
      [P(900, 450), 1],
    ],
  },
  {
    name: 'porte fermée devant, murs à sens unique : intérieur caché',
    obstacles: [
      { id: 'g', kind: 'one_way_wall', blocksFrom: 'left', points: [P(500, 600), P(500, 300)] },
      { id: 'h', kind: 'one_way_wall', blocksFrom: 'left', points: [P(500, 300), P(800, 300)] },
      { id: 'd', kind: 'one_way_wall', blocksFrom: 'left', points: [P(800, 300), P(800, 600)] },
      { id: 'p', kind: 'door', isOpen: false, points: [P(800, 600), P(500, 600)] },
    ],
    moves: [P(650, 800)],
    probes: [
      [P(650, 450), 1],
      [P(650, 700), 0],
    ],
  },
];

const dir = await mkdtemp(join(tmpdir(), 'vision-render-'));
await build({
  entryPoints: [join(here, 'page.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(dir, 'bundle.js'),
  alias: { '@': join(front, 'src') },
  define: { 'process.env.NODE_ENV': '"development"' },
  tsconfig: join(front, 'tsconfig.json'),
  logLevel: 'warning',
});
const html =
  '<!doctype html><html><body style="margin:0"><script src="bundle.js"></script></body></html>';
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') res.end(await readFile(join(dir, 'bundle.js')));
  else res.end(html);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.on('pageerror', (e) => console.log('erreur de la page :', e.message));
await page.goto(url);
await page.evaluate(() => window.visionBench.init());
let fails = 0;
for (const c of cases) {
  const got = await page.evaluate(
    (c) =>
      window.visionBench.run({
        obstacles: c.obstacles,
        moves: c.moves,
        probes: c.probes.map((p) => p[0]),
      }),
    c,
  );
  const bad = c.probes
    .map((p, i) =>
      Math.abs(got[i] - p[1]) > 0.25
        ? `(${p[0].x}, ${p[0].y}) attendu ${p[1]}, obtenu ${got[i]}`
        : null,
    )
    .filter(Boolean);
  if (bad.length) fails++;
  console.log(bad.length ? 'ÉCHEC' : 'ok   ', c.name, bad.length ? '→ ' + bad.join(' ; ') : '');
}
await browser.close();
server.close();
console.log(fails ? `${fails} scène(s) en échec` : 'toutes les scènes passent');
process.exit(fails ? 1 : 0);
