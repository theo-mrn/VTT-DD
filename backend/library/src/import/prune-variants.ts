/**
 * Ne garde que certaines variantes de lieux (docs/bibliotheque.md § Import) :
 *
 *   pnpm --filter @vtt/library run prune-variants --source dndbackdrop <choix.json> [--dry-run]
 *
 * `choix.json` : `{ "<clé du lieu>": [positions gardées] }`. Les autres variantes du lieu perdent
 * leurs fichiers sur R2 (WebP, vignette, original) et leurs lignes ; les variantes gardées sont
 * renumérotées à partir de 0 dans leur ordre. Un lieu absent du fichier n'est pas touché.
 */
import { createObjectStore } from '@vtt/platform';
import { and, eq, inArray } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { backgrounds, backgroundVariants } from '../db/schema.js';
import { SOURCES } from './sources.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string', default: 'dndbackdrop' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const source = z.enum(SOURCES).parse(values.source);
const file = positionals[0];
if (!file) {
  console.error('usage : prune-variants --source <source> <choix.json> [--dry-run]');
  process.exit(2);
}
const choices = z
  .record(z.string(), z.array(z.number().int().min(0)).min(1))
  .parse(JSON.parse(readFileSync(file, 'utf8')));
const env = process.env;
const publicBase = (env.R2_PUBLIC_URL ?? 'https://assets.yner.fr').replace(/\/+$/, '');
const { db, pool } = createDb(z.string().min(1).parse(env.DATABASE_URL));
const store = values['dry-run'] ? undefined : createObjectStore(env);
if (!values['dry-run'] && !store) {
  console.error('R2 non configuré : R2_ENDPOINT, R2_BUCKET_NAME et les clés sont requis');
  process.exit(2);
}

/** Clé R2 d'une adresse publique de la bibliothèque, ou null hors de `library/`. */
const keyOf = (url: string | null) =>
  url?.startsWith(`${publicBase}/library/`) ? url.slice(publicBase.length + 1) : null;

let places = 0;
let dropped = 0;
let removedFiles = 0;
let unknown = 0;
for (const [key, keep] of Object.entries(choices)) {
  const [row] = await db
    .select({ id: backgrounds.id })
    .from(backgrounds)
    .where(and(eq(backgrounds.source, source), eq(backgrounds.sourceKey, key)))
    .limit(1);
  if (!row) {
    unknown++;
    console.error(`  ✗ lieu inconnu ${key}`);
    continue;
  }
  const variants = await db
    .select()
    .from(backgroundVariants)
    .where(eq(backgroundVariants.backgroundId, row.id))
    .orderBy(backgroundVariants.position);
  const gone = variants.filter((v) => !keep.includes(v.position));
  if (!gone.length) continue;
  if (gone.length === variants.length) {
    console.error(`  ✗ ${key} : aucune variante gardée n'existe, ignoré`);
    continue;
  }
  places++;
  dropped += gone.length;
  if (values['dry-run']) continue;
  const files = gone
    .flatMap((v) => [keyOf(v.url), keyOf(v.thumbUrl), v.originalKey])
    .filter((k): k is string => !!k?.startsWith('library/'));
  removedFiles += await store!.remove(files);
  await db.transaction(async (tx) => {
    await tx.delete(backgroundVariants).where(
      inArray(
        backgroundVariants.id,
        gone.map((v) => v.id),
      ),
    );
    // renumérotation en deux temps : la position est unique par lieu
    const kept = variants.filter((v) => keep.includes(v.position));
    for (const [i, v] of kept.entries())
      await tx
        .update(backgroundVariants)
        .set({ position: 32 + i })
        .where(eq(backgroundVariants.id, v.id));
    for (const [i, v] of kept.entries())
      await tx
        .update(backgroundVariants)
        .set({ position: i })
        .where(eq(backgroundVariants.id, v.id));
  });
  process.stdout.write(`\rlieux allégés : ${places}`);
}
console.log(
  `\n${places} lieux, ${dropped} variantes ${values['dry-run'] ? 'à retirer' : 'retirées'}, ${removedFiles} fichiers supprimés sur R2, ${unknown} lieux inconnus`,
);
await pool.end();
