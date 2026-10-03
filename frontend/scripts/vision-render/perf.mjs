import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const front = '/Users/theo/Developer/VTT-DD/frontend';
const out =
  '/private/tmp/claude-501/-Users-theo-Developer-VTT-DD/8634a529-addf-4e10-b872-70379f281138/scratchpad/perf-bundle.js';
await build({
  entryPoints: [front + '/scripts/vision-render/page.ts'],
  bundle: true,
  format: 'iife',
  outfile: out,
  alias: { '@': front + '/src' },
  define: { 'process.env.NODE_ENV': '"development"' },
  tsconfig: front + '/tsconfig.json',
  logLevel: 'warning',
  absWorkingDir: front,
});
const server = createServer(async (req, res) =>
  req.url === '/b.js'
    ? res.end(await readFile(out))
    : res.end('<!doctype html><body style="margin:0"><script src="b.js"></script>'),
).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  headless: false,
});
const page = await browser.newPage({
  viewport: { width: 1000, height: 1000 },
  deviceScaleFactor: 2,
});
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.evaluate(() => window.visionBench.init());
const P = (x, y) => ({ x, y });
const box = (id, x, y, w, h) => ({
  id,
  kind: 'wall',
  points: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h), P(x, y)],
});
const scenes = {
  'aucun mur': [],
  'deux salles': [box('a', 500, 300, 300, 300), box('b', 50, 750, 200, 200)],
  'donjon 40 salles': Array.from({ length: 40 }, (_, i) =>
    box('r' + i, 20 + (i % 8) * 120, 20 + Math.floor(i / 8) * 190, 100, 160),
  ),
};
for (const [name, obstacles] of Object.entries(scenes)) {
  const r = await page
    .evaluate(
      (o) =>
        window.visionBench.perf({
          obstacles: o,
          from: { x: 5, y: 5 },
          to: { x: 990, y: 990 },
          steps: 60,
        }),
      obstacles,
    )
    .catch((e) => String(e));
  console.log(name.padEnd(18), JSON.stringify(r));
}
await browser.close();
server.close();
