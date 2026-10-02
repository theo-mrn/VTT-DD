/**
 * Banc visuel des dés : rend les six formes sous trois matières en vrai WebGL (Chromium sans
 * interface) et enregistre l'image.
 *
 *   node scripts/dice-render/run.mjs [sortie.png] [--resin | --compare | --rim]      (depuis frontend/)
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, '..', '..');
const out =
  process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(tmpdir(), 'dice-render.png');

const dir = await mkdtemp(join(tmpdir(), 'dice-render-'));
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
  '<!doctype html><html><body style="margin:0;background:#000"><script src="bundle.js"></script></body></html>';
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') res.end(await readFile(join(dir, 'bundle.js')));
  else res.end(html);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('erreur de la page :', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console :', m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const resin = process.argv.includes('--resin');
const compare = process.argv.includes('--compare');
const rim = process.argv.includes('--rim');
await page.evaluate((o) => window.diceBench.render({ width: 1600, height: 1000, ...o }), {
  resin,
  compare,
  rim,
});
await page.screenshot({ path: out });
await browser.close();
server.close();
console.log(out);
