/**
 * Télécharge quelques images depuis R2 et génère les versions optimisées en local.
 * Les fichiers sont sauvegardés dans /tmp/r2-preview/ pour comparaison visuelle.
 *
 * Usage:
 *   node scripts/preview-optimize.mjs [options]
 *
 * Options:
 *   --category <cat>   Filtre par catégorie (défaut: Map/Camp)
 *   --count <n>        Nombre d'images à prévisualiser (défaut: 5)
 *   --quality <n>      Qualité 1-100 (défaut: 80)
 *   --max-width <n>    Largeur max (défaut: 2048)
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) { console.error('❌  .env.local introuvable'); process.exit(1); }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = process.env[key] ?? val;
  }
}
loadEnv();

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const CATEGORY = get('--category') ?? 'Map/Camp';
const COUNT = parseInt(get('--count') ?? '5', 10);
const QUALITY = parseInt(get('--quality') ?? '80', 10);
const MAX_WIDTH = parseInt(get('--max-width') ?? '2048', 10);
const OUT_DIR = '/tmp/r2-preview';

function getKey(asset) {
  const raw = asset.localPath ?? asset.path;
  if (raw.startsWith('http')) return new URL(raw).pathname.slice(1);
  return raw.startsWith('/') ? raw.slice(1) : raw;
}

mkdirSync(OUT_DIR, { recursive: true });

let assets = JSON.parse(readFileSync(resolve(ROOT, 'public/asset-mappings.json'), 'utf-8'));
assets = assets.filter(a => a.type === 'image' && a.category?.toLowerCase().includes(CATEGORY.toLowerCase()));

// Prend COUNT images réparties uniformément
const step = Math.max(1, Math.floor(assets.length / COUNT));
const samples = Array.from({ length: COUNT }, (_, i) => assets[i * step]).filter(Boolean);

console.log(`\n📸  Prévisualisation de ${samples.length} images (catégorie: ${CATEGORY}, qualité: ${QUALITY})`);
console.log(`📁  Sortie: ${OUT_DIR}\n`);

for (const asset of samples) {
  const key = getKey(asset);
  const name = basename(key, extname(key));

  try {
    process.stdout.write(`  Téléchargement: ${key} ... `);
    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
    const res = await r2.send(cmd);
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    const original = Buffer.concat(chunks);

    // Sauvegarde l'original
    const origPath = `${OUT_DIR}/${name}_ORIGINAL${extname(key)}`;
    writeFileSync(origPath, original);

    // Optimise
    let pipeline = sharp(original);
    const meta = await pipeline.metadata();
    if (meta.width > MAX_WIDTH) pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    pipeline = pipeline.webp({ quality: QUALITY });
    const optimized = await pipeline.toBuffer();

    // Sauvegarde l'optimisé
    const optPath = `${OUT_DIR}/${name}_Q${QUALITY}.webp`;
    writeFileSync(optPath, optimized);

    const pct = (((original.length - optimized.length) / original.length) * 100).toFixed(0);
    console.log(`${(original.length / 1024).toFixed(0)} Ko → ${(optimized.length / 1024).toFixed(0)} Ko (${pct}%)`);
  } catch (err) {
    console.log(`❌  ${err.message}`);
  }
}

console.log(`\n✅  Ouvre ${OUT_DIR} pour comparer les images.`);
