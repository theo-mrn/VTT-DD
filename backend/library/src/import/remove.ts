/**
 * Retire des lieux de la bibliothèque (docs/bibliotheque.md § Import) :
 *
 *   pnpm --filter @vtt/library run remove --source dndbackdrop --reason "moderne" <clé ou préfixe>…
 *   pnpm --filter @vtt/library run remove --source mappacks --reason "tri" --from <liste.txt>
 *
 * Pour chaque lieu (clé de la source, ou ses 8 premiers caractères s'ils sont uniques) : fichiers
 * sur R2 (WebP, vignettes, originaux), lignes en base (variantes comprises), et inscription dans
 * `excluded.json` pour que l'import ne le remette pas. --from : clés lues dans un fichier, une par
 * ligne. --dry-run : affiche seulement.
 */
import { createObjectStore } from '@vtt/platform';
import { and, eq, like } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { backgrounds, backgroundVariants } from '../db/schema.js';
import { readExcluded, writeExcluded } from './excluded.js';
import { SOURCES } from './sources.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string', default: 'dndbackdrop' },
    reason: { type: 'string' },
    from: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const source = z.enum(SOURCES).parse(values.source);
const reason = z.string().min(1, '--reason est requis').parse(values.reason);
const wantedKeys = [
  ...positionals,
  ...(values.from ? readFileSync(values.from, 'utf8').split(/\s+/).filter(Boolean) : []),
];
if (!wantedKeys.length) {
  console.error(
    'usage : remove --source <source> --reason <raison> [--from <liste>] <clé ou préfixe>…',
  );
  process.exit(2);
}
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

const excluded = readExcluded();
const bySource = (excluded[source] ??= {});
let removedFiles = 0;
for (const wanted of wantedKeys) {
  const rows = await db
    .select({ id: backgrounds.id, key: backgrounds.sourceKey, title: backgrounds.titleFr })
    .from(backgrounds)
    .where(and(eq(backgrounds.source, source), like(backgrounds.sourceKey, `${wanted}%`)));
  if (rows.length !== 1) {
    console.error(`  ✗ ${wanted} : ${rows.length} lieux correspondent, ignoré`);
    continue;
  }
  const row = rows[0]!;
  const variants = await db
    .select()
    .from(backgroundVariants)
    .where(eq(backgroundVariants.backgroundId, row.id));
  const keys = variants
    .flatMap((v) => [keyOf(v.url), keyOf(v.thumbUrl), v.originalKey])
    .filter((k): k is string => !!k?.startsWith('library/'));
  console.log(
    `  ${values['dry-run'] ? '·' : '✓'} ${row.key.slice(0, 8)} ${row.title} (${keys.length} fichiers)`,
  );
  if (values['dry-run']) continue;
  removedFiles += await store!.remove(keys);
  await db.delete(backgrounds).where(eq(backgrounds.id, row.id));
  bySource[row.key] = reason;
}
if (!values['dry-run']) writeExcluded(excluded);
console.log(`${removedFiles} fichiers supprimés sur R2`);
await pool.end();
