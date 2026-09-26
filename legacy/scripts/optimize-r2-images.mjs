/**
 * Batch image optimizer for Cloudflare R2
 *
 * Télécharge les images depuis R2, les optimise avec Sharp, puis les ré-uploade.
 * Convertit tout en WebP par défaut pour un gain de taille maximal.
 *
 * Usage:
 *   node scripts/optimize-r2-images.mjs [options]
 *
 * Options:
 *   --dry-run          Affiche ce qui serait fait sans modifier R2
 *   --category <cat>   Filtre par catégorie (ex: textures, Token, Map)
 *   --format <fmt>     Format de sortie: webp (défaut), jpeg, png
 *   --quality <n>      Qualité 1-100 (défaut: 80)
 *   --max-width <n>    Largeur max en pixels (défaut: 2048)
 *   --concurrency <n>  Nombre d'images traitées en parallèle (défaut: 5)
 *   --skip-small <n>   Ignore les images < n Ko (défaut: 100)
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Config ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Charge les variables d'environnement depuis .env.local
function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) {
    console.error('❌  .env.local introuvable. Copie .env.example et remplis les valeurs R2.');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
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

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('❌  Variables R2 manquantes dans .env.local');
  process.exit(1);
}

// ─── Parse args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};
const has = (flag) => args.includes(flag);

const DRY_RUN = has('--dry-run');
const CATEGORY_FILTER = get('--category');
const OUTPUT_FORMAT = get('--format') ?? 'webp';
const QUALITY = parseInt(get('--quality') ?? '80', 10);
const MAX_WIDTH = parseInt(get('--max-width') ?? '2048', 10);
const CONCURRENCY = parseInt(get('--concurrency') ?? '5', 10);
const SKIP_SMALL_KB = parseInt(get('--skip-small') ?? '100', 10);

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// ─── R2 client ─────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function getKey(asset) {
  // localPath est toujours un chemin relatif ex: "/Map/Village/foo.png"
  // path peut être une URL complète https://assets.yner.fr/... ou un chemin relatif
  const raw = asset.localPath ?? asset.path;
  if (raw.startsWith('http')) {
    // Extrait le chemin après le domaine
    try {
      return new URL(raw).pathname.slice(1); // retire le "/" initial
    } catch {
      return raw;
    }
  }
  return raw.startsWith('/') ? raw.slice(1) : raw;
}

function getOutputKey(key) {
  // Garde toujours la même clé pour ne pas casser asset-mappings.json
  return key;
}

async function downloadBuffer(key) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key });
  const res = await r2.send(cmd);
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return { buffer: Buffer.concat(chunks), contentType: res.ContentType };
}

async function optimizeImage(buffer) {
  let pipeline = sharp(buffer);

  // Redimensionne si trop large
  const meta = await pipeline.metadata();
  if (meta.width > MAX_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }

  // Conversion et compression
  if (OUTPUT_FORMAT === 'webp') {
    pipeline = pipeline.webp({ quality: QUALITY });
  } else if (OUTPUT_FORMAT === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: QUALITY, mozjpeg: true });
  } else if (OUTPUT_FORMAT === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  }

  return pipeline.toBuffer();
}

async function upload(key, buffer, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

// ─── Progress ──────────────────────────────────────────────────────────────

let processed = 0;
let skipped = 0;
let totalSavedBytes = 0;

function logProgress(total) {
  const pct = Math.round(((processed + skipped) / total) * 100);
  process.stdout.write(`\r  ${processed + skipped}/${total} (${pct}%)  optimisées: ${processed}  ignorées: ${skipped}  gain: ${(totalSavedBytes / 1024 / 1024).toFixed(1)} MB`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function processAsset(asset, total) {
  const key = getKey(asset);
  const ext = key.match(/\.(\w+)$/)?.[0]?.toLowerCase() ?? '';

  if (!IMAGE_EXTS.has(ext)) {
    skipped++;
    return;
  }

  try {
    const { buffer: original, contentType } = await downloadBuffer(key);

    // Ignore les petites images
    if (original.length < SKIP_SMALL_KB * 1024) {
      skipped++;
      logProgress(total);
      return;
    }

    const optimized = await optimizeImage(original);
    const savedBytes = original.length - optimized.length;
    totalSavedBytes += Math.max(0, savedBytes);

    if (DRY_RUN) {
      const pct = ((savedBytes / original.length) * 100).toFixed(0);
      console.log(`  [dry-run] ${key}  ${(original.length / 1024).toFixed(0)} Ko → ${(optimized.length / 1024).toFixed(0)} Ko  (${pct}%)`);
      processed++;
      logProgress(total);
      return;
    }

    const outputKey = getOutputKey(key);
    const outputContentType = OUTPUT_FORMAT === 'webp' ? 'image/webp'
      : OUTPUT_FORMAT === 'jpeg' ? 'image/jpeg'
      : 'image/png';

    await upload(outputKey, optimized, outputContentType);

    // Si on a changé l'extension (PNG→WebP), l'ancienne clé reste dans R2
    // mais les nouvelles URLs pointeront vers la bonne clé.
    processed++;
    logProgress(total);
  } catch (err) {
    skipped++;
    console.error(`\n  ⚠  Erreur sur ${key}: ${err.message}`);
    logProgress(total);
  }
}

async function runBatch(assets) {
  const total = assets.length;
  console.log(`\n🚀  ${DRY_RUN ? '[DRY RUN] ' : ''}Optimisation de ${total} images`);
  console.log(`   Format: ${OUTPUT_FORMAT}  Qualité: ${QUALITY}  Max-width: ${MAX_WIDTH}px  Concurrence: ${CONCURRENCY}`);
  if (CATEGORY_FILTER) console.log(`   Filtre catégorie: ${CATEGORY_FILTER}`);
  console.log('');

  // Traitement par chunks pour limiter la concurrence
  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const chunk = assets.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((a) => processAsset(a, total)));
  }

  console.log('\n');
  console.log(`✅  Terminé !`);
  console.log(`   Optimisées : ${processed}`);
  console.log(`   Ignorées   : ${skipped}`);
  console.log(`   Gain total : ${(totalSavedBytes / 1024 / 1024).toFixed(2)} MB`);
}

// ─── Entry ─────────────────────────────────────────────────────────────────

const mappingsPath = resolve(ROOT, 'public/asset-mappings.json');
if (!existsSync(mappingsPath)) {
  console.error('❌  public/asset-mappings.json introuvable');
  process.exit(1);
}

let assets = JSON.parse(readFileSync(mappingsPath, 'utf-8'));

// Filtre par catégorie si demandé
if (CATEGORY_FILTER) {
  assets = assets.filter((a) =>
    a.category?.toLowerCase().includes(CATEGORY_FILTER.toLowerCase())
  );
}

// Ne garde que les images
assets = assets.filter((a) => a.type === 'image');

if (assets.length === 0) {
  console.log('Aucune image trouvée avec ces critères.');
  process.exit(0);
}

await runBatch(assets);
