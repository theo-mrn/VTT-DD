/**
 * Cuisson des images des dés : pour chaque skin, le d20 rendu par le vrai moteur 3D de l'app
 * (Chromium sans interface, WebGL logiciel), enregistré en
 *   public/dice/<skin>.webp         512 px, boutique (grille et fiche)
 *   public/dice/thumbs/<skin>.webp  128 px, petits affichages (réglages des dés)
 *
 *   pnpm --filter @vtt/web dice:bake               les skins sans image (dé ajouté au catalogue)
 *   pnpm --filter @vtt/web dice:bake --all         tous les skins (rendu ou éclairage modifié)
 *   pnpm --filter @vtt/web dice:bake gold ruby     ces skins seulement
 *
 * Pas de serveur de dev : la page est assemblée par esbuild et servie avec public/. Un dé
 * ajouté à dice-definitions.ts sans image fait échouer la CI (src/lib/dice-images.test.ts).
 */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, '..', '..');
const publicDir = join(front, 'public');
const outDir = join(publicDir, 'dice');
const thumbsDir = join(outDir, 'thumbs');
const args = process.argv.slice(2);

const dir = await mkdtemp(join(tmpdir(), 'dice-bake-'));
await build({
  entryPoints: [join(here, 'page.tsx')],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  outfile: join(dir, 'bundle.js'),
  alias: { '@': join(front, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfig: join(front, 'tsconfig.json'),
  logLevel: 'warning',
});

const TYPES = {
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
const html =
  '<!doctype html><html><body style="margin:0;background:transparent"><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path === '/bundle.js') {
    res.setHeader('content-type', TYPES['.js']);
    return res.end(await readFile(join(dir, 'bundle.js')));
  }
  // Fichiers de public/ (environnement HDR, textures, modèles des cœurs d'orbes)
  const file = normalize(join(publicDir, path));
  if (path !== '/' && file.startsWith(publicDir) && existsSync(file)) {
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    return res.end(await readFile(file));
  }
  if (path !== '/') {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('content-type', 'text/html');
  res.end(html);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 512, height: 512 } });

const probe = await context.newPage();
await probe.goto(`${base}?skin=gold`);
await probe.waitForFunction(() => Array.isArray(window.__skins));
const all = await probe.evaluate(() => window.__skins);
await probe.close();

const named = args.filter((a) => !a.startsWith('--'));
const unknown = named.filter((s) => !all.includes(s));
if (unknown.length) throw new Error(`skins inconnus : ${unknown.join(', ')}`);
const missing = (s) =>
  !existsSync(join(outDir, `${s}.webp`)) || !existsSync(join(thumbsDir, `${s}.webp`));
let skins = named;
if (!named.length) skins = args.includes('--all') ? all : all.filter(missing);
console.log(`${skins.length} skin(s) à cuire sur ${all.length}`);

await mkdir(thumbsDir, { recursive: true });
let failed = 0;
for (const skin of skins) {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  ${skin} : erreur de la page, ${e.message}`));
  try {
    await page.goto(`${base}?skin=${encodeURIComponent(skin)}`);
    await page.waitForFunction(() => window.__dieReady === true, null, { timeout: 120_000 });
    const { large, small } = await page.evaluate(() => window.__export(512, 128));
    const data = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    await writeFile(join(outDir, `${skin}.webp`), data(large));
    await writeFile(join(thumbsDir, `${skin}.webp`), data(small));
    console.log(`  ✓ ${skin}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${skin} : ${e.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}
await browser.close();
server.close();
console.log(`${skins.length - failed} image(s) cuite(s), ${failed} échec(s)`);
if (failed) process.exitCode = 1;
