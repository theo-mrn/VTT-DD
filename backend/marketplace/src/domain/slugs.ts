/** Adresses lisibles uniques (`les-cryptes-de-sel`, `les-cryptes-de-sel-2`…). */
import { slugify } from '@vtt/contracts';
import { like, or, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/outbox.js';
import { creators, listings } from '../db/schema.js';

/** Première adresse libre à partir de `text`, parmi celles de la table. */
export async function uniqueSlug(
  db: Db | Tx,
  table: 'listings' | 'creators',
  text: string,
): Promise<string> {
  const base = slugify(text).slice(0, 72).replace(/-+$/, '') || 'pack';
  const column = table === 'listings' ? listings.slug : creators.slug;
  const source = table === 'listings' ? listings : creators;
  const taken = new Set(
    (
      await db
        .select({ slug: column })
        .from(source)
        .where(or(eq(column, base), like(column, `${base}-%`)))
    ).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
