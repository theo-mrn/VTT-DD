// Bakes a still PNG for every dice skin so the shop grid shows images instead
// of live WebGL canvases (huge CPU/GPU win). Output: public/dice/<skinId>.png
//
// Usage:
//   1. Start the dev server:  npm run dev
//   2. Run:                   node scripts/bake-dice.mjs
//   (optional) BAKE_URL=http://localhost:3000 to override the base URL.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BAKE_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve('public/dice');
const SIZE = 512;

async function run() {
    await mkdir(OUT_DIR, { recursive: true });

    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: SIZE, height: SIZE },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // Load once to read the full skin list exposed on window.__allSkins.
    // NOTE: never wait for 'networkidle' — a live WebGL/HMR page is never idle.
    console.log(`Opening ${BASE}/dice-bake …`);
    await page.goto(`${BASE}/dice-bake?skin=gold`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('Array.isArray(window.__allSkins) && window.__allSkins.length > 0', { timeout: 30000 });
    const skins = await page.evaluate('window.__allSkins');
    console.log(`Baking ${skins.length} dice skins → ${OUT_DIR}`);

    // Hide global overlays (cookie banner, toasts, theme switch) and make the
    // page background transparent. IMPORTANT: only hide fixed/sticky overlays,
    // never structural wrappers (that hid the canvas and broke captures).
    const hideChrome = () => {
        const style = document.createElement('style');
        style.id = '__bake_style';
        style.textContent = `
            html, body { background: transparent !important; }
            [class*="cookie" i], [id*="cookie" i],
            [data-sonner-toaster], [class*="Toaster" i],
            [class*="theme" i][class*="toggle" i] { display: none !important; }
        `;
        document.head.appendChild(style);
        // Hide EVERY element that is neither the bake canvas subtree nor an
        // ancestor of it — kills theme toggles, floating widgets, etc.
        const bake = document.querySelector('.bake-root');
        if (bake) {
            document.querySelectorAll('body *').forEach((el) => {
                if (!bake.contains(el) && !el.contains(bake)) {
                    (el).style.display = 'none';
                }
            });
        }
    };

    let ok = 0, fail = 0;
    for (const skinId of skins) {
        try {
            await page.goto(`${BASE}/dice-bake?skin=${encodeURIComponent(skinId)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForFunction('window.__dieReady === true', { timeout: 45000 });
            await page.evaluate(hideChrome);
            await page.waitForTimeout(250); // settle

            // Screenshot the exact 512×512 canvas, transparent background.
            const canvas = page.locator('canvas').first();
            await canvas.waitFor({ state: 'attached', timeout: 10000 });
            const box = await canvas.boundingBox();
            const buf = await page.screenshot({
                omitBackground: true,
                clip: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : { x: 0, y: 0, width: 512, height: 512 },
            });
            await writeFile(path.join(OUT_DIR, `${skinId}.png`), buf);
            ok++;
            console.log(`  ✓ ${skinId}`);
        } catch (e) {
            fail++;
            console.warn(`  ✗ ${skinId}: ${e.message.split('\n')[0]}`);
        }
    }

    await browser.close();
    console.log(`Done. ${ok} baked, ${fail} failed.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
