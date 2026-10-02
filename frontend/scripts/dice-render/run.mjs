/**
 * Banc visuel des dés : rend les six formes sous trois matières en vrai WebGL (Chromium sans
 * interface) et enregistre l'image.
 *
 *   node scripts/dice-render/run.mjs [sortie.png] [--resin | --compare | --rim | --cores | --orbs | --cost]      (depuis frontend/)
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
const repo = join(front, '..');
const originalsArg = process.argv.find((a) => a.startsWith('--originals='));
const originalsDir = originalsArg ? originalsArg.slice('--originals='.length) : '';
const server = createServer(async (req, res) => {
  // Modèles des cœurs d'orbes : d'origine (legacy) et optimisés (public du front)
  const model = /^\/(legacy3d|3d)\/([\w-]+\.glb)$/.exec(req.url ?? '');
  if (model) {
    const base =
      model[1] === '3d' ? join(front, 'public', '3d') : join(repo, 'legacy', 'public', '3d');
    res.end(await readFile(join(base, model[2])));
    return;
  }
  // Textures des skins : WebP du front, et originaux (dossier de `--originals`)
  const tex = /^\/(dice\/textures|orig-tex)\/([\w.-]+)$/.exec(req.url ?? '');
  if (tex) {
    const base = tex[1] === 'orig-tex' ? originalsDir : join(front, 'public', 'dice', 'textures');
    res.end(await readFile(join(base, tex[2])));
    return;
  }
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
if (originalsDir) {
  // Correspondance WebP → original (même nom, autre extension)
  const { readdirSync } = await import('node:fs');
  const originals = Object.fromEntries(
    readdirSync(originalsDir).map((f) => [
      `/dice/textures/${f.replace(/\.[^.]+$/, '')}.webp`,
      `/orig-tex/${f}`,
    ]),
  );
  await page.evaluate(
    (o) => window.diceBench.textures({ width: 1600, height: 1000, originals: o }),
    originals,
  );
  await page.screenshot({ path: out });
  await browser.close();
  server.close();
  console.log(out);
  process.exit(0);
}
if (process.argv.includes('--cost')) {
  const rig = process.argv.find((a) => a.startsWith('--rig='))?.slice(6) ?? 'all';
  const r = await page.evaluate(
    (rig) => window.diceBench.cost({ size: 700, frames: 12, rig }),
    rig,
  );
  for (const [k, v] of Object.entries(r).sort((a, b) => b[1] - a[1]))
    console.log(String(v).padStart(7), k);
  await browser.close();
  server.close();
  process.exit(0);
}
if (process.argv.includes('--orbs')) {
  await page.evaluate(() => window.diceBench.orbs({ width: 1600, height: 400 }));
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1600, height: 400 } });
  await browser.close();
  server.close();
  console.log(out);
  process.exit(0);
}
if (process.argv.includes('--cores')) {
  const names = ['beholder', 'book', 'butterfly', 'mimique', 'mug', 'potion', 'ring', 'shield'];
  await page.evaluate(
    (names) => window.diceBench.cores({ width: 1600, height: 1000, names }),
    names,
  );
  await page.screenshot({ path: out });
  await browser.close();
  server.close();
  console.log(out);
  process.exit(0);
}
await page.evaluate((o) => window.diceBench.render({ width: 1600, height: 1000, ...o }), {
  resin,
  compare,
  rim,
});
await page.screenshot({ path: out });
await browser.close();
server.close();
console.log(out);
