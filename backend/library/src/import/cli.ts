/**
 * Import d'un dossier d'images dans la bibliothèque (docs/bibliotheque.md § Import).
 *
 *   pnpm --filter @vtt/library run ingest <dossier> [--source dndbackdrop] [--limit N | --sample N]
 *     [--describe] [--redescribe] [--dry-run] [--concurrency N]
 *
 * --limit N : les N premiers lieux ; --sample N : N lieux répartis sur tout le dossier.
 *
 * 1. regroupe les fichiers en lieux (une source par format de noms) ;
 * 2. envoie sur R2 ce qui manque (original, WebP pleine taille, vignette), clés fixes ;
 * 3. écrit les lieux et leurs variantes (rejouable sans doublon) ;
 * 4. avec --describe : décrit les lieux qui ne le sont pas (ou tous avec --redescribe), par
 *    Claude (ANTHROPIC_API_KEY, LIBRARY_DESCRIBE_MODEL, LIBRARY_DESCRIBE_EFFORT) ;
 * 5. rapport : lieux, images envoyées, descriptions, jetons et coût estimé.
 *
 * Sources : `dndbackdrop` (dossier d'images, envoyées sur R2) ; `asset-mappings` (chemin de
 * `asset-mappings.json` : cartes déjà publiées, citées sans recopie).
 *
 * --dry-run : lit et regroupe seulement, sans R2, base ni modèle.
 * --skip-files : lieux et variantes en base seulement, sans rien envoyer (un passage suivant
 *   envoie les fichiers) ; --originals : envoie aussi les PNG d'origine (désactivé par défaut : la
 *   place sur R2 est comptée et le débit montant lent ; les originaux restent dans les archives).
 * --agents <dossier> [--batch N] : au lieu de l'API, prépare la description par des agents :
 *   une image réduite par lieu à décrire et des lots `batch-NNN.json` ; les agents écrivent
 *   leurs réponses, relues et enregistrées par `run apply-descriptions` (apply.ts).
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import {
  claudeDescriber,
  DESCRIBE_TEMPLATE,
  EFFORTS,
  estimatedCost,
  type DescribeUsage,
} from './describe.js';
import {
  describeImage,
  dimensions,
  fullWebp,
  keysOf,
  mapWebp,
  r2Bucket,
  thumbWebp,
} from './files.js';
import { assetMappingEntries, type MappedAsset } from './asset-mappings.js';
import { readExcluded } from './excluded.js';
import { dndBackdropEntries, mapPackEntries, SOURCES, type SourceEntry } from './sources.js';
import { saveDescription, upsertEntry, upsertVariant } from './store.js';

const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const ImportEnv = z.object({
  DATABASE_URL: z.string().min(1),
  R2_ENDPOINT: optional(z.string().url()),
  R2_REGION: optional(z.string()),
  R2_BUCKET_NAME: optional(z.string()),
  R2_ACCESS_KEY_ID: optional(z.string()),
  R2_SECRET_ACCESS_KEY: optional(z.string()),
  R2_PUBLIC_URL: z.string().url().default('https://assets.yner.fr'),
  ANTHROPIC_API_KEY: optional(z.string()),
  LIBRARY_DESCRIBE_MODEL: z.string().default('claude-opus-5-5'),
  LIBRARY_DESCRIBE_EFFORT: z.enum(EFFORTS).default('medium'),
});

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string', default: 'dndbackdrop' },
    limit: { type: 'string' },
    sample: { type: 'string' },
    describe: { type: 'boolean', default: false },
    redescribe: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    agents: { type: 'string' },
    'skip-files': { type: 'boolean', default: false },
    originals: { type: 'boolean', default: false },
    batch: { type: 'string', default: '60' },
    concurrency: { type: 'string', default: '4' },
  },
});

const dir = positionals[0];
if (!dir) {
  console.error('usage : ingest <dossier> [--source dndbackdrop] [--limit N] [--describe] …');
  process.exit(2);
}
const source = z.enum(SOURCES).parse(values.source);
const count = (v: string | undefined) =>
  v ? z.coerce.number().int().positive().parse(v) : undefined;
const limit = count(values.limit);
const sample = count(values.sample);
const concurrency = z.coerce.number().int().min(1).max(16).parse(values.concurrency);
const describing = values.describe || values.redescribe;
const skipFiles = values['skip-files'];

/** Exécute `work` sur chaque élément, `n` à la fois. */
async function pool<T>(items: readonly T[], n: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

/** Un lieu à importer, quelle que soit sa source. */
interface Planned {
  sourceKey: string;
  collection: string | null;
  hint: string;
  animated: boolean;
  /** Plan de carte (vu du dessus) ou illustration (décor vu de face). */
  kind: 'map' | 'illustration';
  /** Nombre d'images : fichiers ou variantes. */
  images: number;
  /** Envoie ce qui manque sur R2 et écrit les variantes ; renvoie le nombre de fichiers envoyés. */
  store(backgroundId: string): Promise<number>;
  /** Image à décrire (WebP, 1024 px de large au plus), ou null s'il n'y en a pas. */
  image(): Promise<Buffer | null>;
}

const target = resolve(dir);
let all: Planned[];
let skipped: string[] = [];
let needsBucket = false;

if (source === 'asset-mappings') {
  // Cartes déjà publiées : variantes citées sans recopie, image à décrire lue sur le CDN
  const mapped = assetMappingEntries(JSON.parse(await readFile(target, 'utf8')) as MappedAsset[]);
  all = mapped.map((e) => ({
    sourceKey: e.sourceKey,
    collection: e.collection,
    hint: e.hint,
    animated: e.animated,
    kind: e.kind,
    images: e.variants.length,
    async store(id) {
      for (const v of e.variants)
        await upsertVariant(db, id, {
          ...v,
          originalKey: null,
          width: null,
          height: null,
          bytes: null,
        });
      return 0;
    },
    async image() {
      if (!e.describeUrl) return null;
      const r = await fetch(e.describeUrl, { headers: { accept: 'image/webp,image/*' } });
      if (!r.ok) throw new Error(`image introuvable (${r.status}) : ${e.describeUrl}`);
      return describeImage(Buffer.from(await r.arrayBuffer()));
    },
  }));
} else if (source === 'mappacks') {
  // Plans de carte des packs : la version sans grille, réduite à 2048 px, et sa vignette
  needsBucket = true;
  const files = (await readdir(target, { recursive: true, withFileTypes: true }))
    .filter((d) => d.isFile())
    .map((d) => relative(target, join(d.parentPath, d.name)));
  const found = mapPackEntries(files);
  skipped = found.skipped;
  all = found.entries.map((e) => ({
    sourceKey: e.sourceKey,
    collection: e.collection,
    hint: e.hint,
    animated: false,
    kind: 'map',
    images: 1,
    async store(id) {
      const image = e.images[0]!;
      const keys = keysOf(source, image.id);
      const source_ = await readFile(join(target, image.file));
      if (skipFiles) {
        const { width, height } = await dimensions(source_);
        const scale = Math.min(1, 2048 / Math.max(width ?? 1, height ?? 1));
        await upsertVariant(db, id, {
          position: 0,
          url: `${base}/${keys.full}`,
          thumbUrl: `${base}/${keys.thumb}`,
          originalKey: null,
          width: width && Math.round(width * scale),
          height: height && Math.round(height * scale),
          bytes: null,
        });
        return 0;
      }
      let uploaded = 0;
      const [sizeFull, sizeThumb] = await Promise.all([
        bucket!.size(keys.full),
        bucket!.size(keys.thumb),
      ]);
      const full = await mapWebp(source_);
      if (sizeFull === null) {
        await bucket!.put(keys.full, full.data, 'image/webp');
        uploaded++;
      }
      if (sizeThumb === null) {
        await bucket!.put(keys.thumb, await thumbWebp(source_), 'image/webp');
        uploaded++;
      }
      await upsertVariant(db, id, {
        position: 0,
        url: `${base}/${keys.full}`,
        thumbUrl: `${base}/${keys.thumb}`,
        originalKey: null,
        width: full.info.width,
        height: full.info.height,
        bytes: sizeFull ?? full.data.length,
      });
      return uploaded;
    },
    async image() {
      return describeImage(await readFile(join(target, e.images[0]!.file)));
    },
  }));
} else {
  // Fichiers d'un dossier : originaux, WebP et vignettes envoyés sur R2 s'ils manquent
  needsBucket = true;
  // Fichiers seulement (sous-dossiers compris), en chemins relatifs au dossier importé
  const files = (await readdir(target, { recursive: true, withFileTypes: true }))
    .filter((d) => d.isFile())
    .map((d) => relative(target, join(d.parentPath, d.name)));
  const found = dndBackdropEntries(files);
  skipped = found.skipped;
  all = found.entries.map((e: SourceEntry) => ({
    sourceKey: e.sourceKey,
    collection: e.collection,
    hint: e.hint,
    animated: false,
    // Export DndBackdrop : des décors, vus de face
    kind: 'illustration',
    images: e.images.length,
    async store(id) {
      let uploaded = 0;
      await pool(e.images, concurrency, async (image) => {
        const keys = keysOf(source, image.id);
        const png = await readFile(join(target, image.file));
        const { width, height } = await dimensions(png);
        const variant = {
          position: image.position,
          url: `${base}/${keys.full}`,
          thumbUrl: `${base}/${keys.thumb}`,
          width,
          height,
        };
        // --skip-files : les lignes seulement, les fichiers viendront d'un autre passage
        if (skipFiles) {
          await upsertVariant(db, id, { ...variant, originalKey: null, bytes: null });
          return;
        }
        const [sizeFull, sizeThumb, sizeOriginal] = await Promise.all([
          bucket!.size(keys.full),
          bucket!.size(keys.thumb),
          bucket!.size(keys.original),
        ]);
        let bytes = sizeFull;
        let original = sizeOriginal !== null;
        if (!original && values.originals) {
          await bucket!.put(keys.original, png, 'image/png');
          original = true;
          uploaded++;
        }
        if (sizeFull === null) {
          const webp = await fullWebp(png);
          await bucket!.put(keys.full, webp, 'image/webp');
          bytes = webp.length;
          uploaded++;
        }
        if (sizeThumb === null) {
          await bucket!.put(keys.thumb, await thumbWebp(png), 'image/webp');
          uploaded++;
        }
        await upsertVariant(db, id, {
          ...variant,
          originalKey: original ? keys.original : null,
          bytes,
        });
      });
      return uploaded;
    },
    async image() {
      return describeImage(await readFile(join(target, e.images[0]!.file)));
    },
  }));
}

// Lieux retirés de la bibliothèque (`run remove`) : jamais réimportés
const excluded = readExcluded()[source] ?? {};
const skippedExcluded = all.filter((e) => e.sourceKey in excluded).length;
all = all.filter((e) => !(e.sourceKey in excluded));
if (skippedExcluded) console.log(`${skippedExcluded} lieux retirés ignorés (excluded.json)`);

/** N lieux à intervalles réguliers : toutes les collections sont représentées. */
const spread = (n: number) =>
  Array.from({ length: Math.min(n, all.length) }, (_, i) => all[Math.floor((i * all.length) / n)]!);
const entries = sample ? spread(sample) : limit ? all.slice(0, limit) : all;
const images = entries.reduce((n, e) => n + e.images, 0);
console.log(`${target} (${source})`);
console.log(
  `${entries.length} lieux, ${images} images${entries.length < all.length ? ` (sur ${all.length} lieux)` : ''}`,
);
if (skipped.length)
  console.log(`${skipped.length} fichiers hors format ignorés : ${skipped.join(', ')}`);
if (values['dry-run']) process.exit(0);

const env = ImportEnv.parse(process.env);
if (describing && !env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY absent (backend/library/.env) : description impossible');
  process.exit(2);
}
const { db, pool: connections } = createDb(env.DATABASE_URL);
const bucket = needsBucket && !skipFiles ? r2Bucket(env) : null;
const base = env.R2_PUBLIC_URL.replace(/\/+$/, '');

let uploaded = 0;
const stored = new Map<string, { id: string; describedBy: string | null }>();

// Fichiers et lignes : plusieurs lieux à la fois, leurs images en parallèle
let done = 0;
await pool(entries, Math.max(1, Math.ceil(concurrency / 2)), async (entry) => {
  const row = await upsertEntry(db, source, entry, entry);
  stored.set(entry.sourceKey, row);
  const sent = await entry.store(row.id);
  uploaded += sent;
  process.stdout.write(`\rfichiers et lignes : ${++done}/${entries.length}`);
});
console.log(`\n${uploaded} fichiers envoyés sur R2`);

// Description par des agents : images réduites et lots de travail, sans appel à l'API
if (values.agents) {
  const out = resolve(values.agents);
  const size = z.coerce.number().int().min(1).max(500).parse(values.batch);
  const template = `#${DESCRIBE_TEMPLATE}`;
  const todo = entries.filter((e) => {
    const by = stored.get(e.sourceKey)!.describedBy;
    return values.redescribe || !by?.endsWith(template);
  });
  await mkdir(join(out, 'images'), { recursive: true });
  const jobs: { key: string; image: string; hint: string; collection: string | null }[] = [];
  let prepared = 0;
  await pool(todo, concurrency, async (e) => {
    const image = await e.image();
    if (!image) return;
    const path = join(out, 'images', `${e.sourceKey.replace(/[^\w-]/g, '_')}.webp`);
    await writeFile(path, image);
    jobs.push({ key: e.sourceKey, image: path, hint: e.hint, collection: e.collection });
    process.stdout.write(`\rimages préparées : ${++prepared}/${todo.length}`);
  });
  jobs.sort((a, b) => a.key.localeCompare(b.key));
  const batches = Math.ceil(jobs.length / size);
  for (let b = 0; b < batches; b++)
    await writeFile(
      join(out, `batch-${String(b + 1).padStart(3, '0')}.json`),
      JSON.stringify({ source, jobs: jobs.slice(b * size, (b + 1) * size) }, null, 1),
    );
  console.log(`\n${jobs.length} lieux en ${batches} lots de ${size} au plus : ${out}`);
}

// Descriptions
const usages: DescribeUsage[] = [];
let failures = 0;
if (describing) {
  const describe = claudeDescriber({
    model: env.LIBRARY_DESCRIBE_MODEL,
    effort: env.LIBRARY_DESCRIBE_EFFORT,
  });
  const template = `#${DESCRIBE_TEMPLATE}`;
  const todo = entries.filter((e) => {
    const by = stored.get(e.sourceKey)!.describedBy;
    return values.redescribe || !by?.endsWith(template);
  });
  console.log(
    `${todo.length} lieux à décrire (${env.LIBRARY_DESCRIBE_MODEL}, effort ${env.LIBRARY_DESCRIBE_EFFORT})`,
  );
  await pool(todo, concurrency, async (entry) => {
    try {
      const image = await entry.image();
      if (!image) throw new Error('aucune image à décrire');
      const { description, usage } = await describe(image, entry);
      await saveDescription(
        db,
        stored.get(entry.sourceKey)!.id,
        entry.collection,
        description,
        `${usage.model}${template}`,
      );
      usages.push(usage);
      console.log(
        `  ✓ ${description.titleFr} — ${description.place}, ${description.setting}, ${description.timeOfDay} (${usage.inputTokens} + ${usage.outputTokens} jetons)`,
      );
    } catch (e) {
      failures++;
      console.error(`  ✗ ${entry.hint} : ${(e as Error).message}`);
    }
  });
}

const input = usages.reduce((n, u) => n + u.inputTokens, 0);
const output = usages.reduce((n, u) => n + u.outputTokens, 0);
const costs = usages.map(estimatedCost);
const cost = costs.every((c) => c !== null) ? costs.reduce((n, c) => n + c!, 0) : null;
if (describing) {
  console.log(
    `${usages.length} lieux décrits, ${failures} échecs ; ${input} jetons en entrée, ${output} en sortie` +
      (cost === null
        ? ''
        : ` ; coût estimé ${cost.toFixed(3)} $ (${(cost / Math.max(usages.length, 1)).toFixed(4)} $ par lieu)`),
  );
}
await connections.end();
