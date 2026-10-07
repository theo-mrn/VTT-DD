/** Requêtes du catalogue : recherche, filtres, tris, possession. */
import { normalizeText, type CatalogSort, type ListingKind } from '@vtt/contracts';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { acquisitions, listings } from '../../db/schema.js';

export const PER_PAGE = 20;

/** Note de base du classement « mieux notés » : 5 avis fictifs à 3,5. */
const PRIOR_COUNT = 5;
const PRIOR_MEAN = 3.5;

export interface CatalogFilters {
  q?: string;
  system?: string;
  kind?: ListingKind;
  price?: 'free' | 'paid';
  /** Masque les fiches avec un avertissement de contenu. */
  safe?: boolean;
  sort: CatalogSort;
  page: number;
}

/**
 * Requête plein texte : chaque mot devient un préfixe (`gob:*`), tous requis. Rien de ce que
 * tape l'utilisateur n'atteint la syntaxe de `to_tsquery` (mots réduits à [a-z0-9]).
 */
export function tsQuery(q: string): string | null {
  const words = normalizeText(q)
    .split(' ')
    .filter((w) => w.length > 0)
    .slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

function orderBy(sort: CatalogSort): SQL[] {
  switch (sort) {
    case 'recent':
      return [desc(listings.publishedAt)];
    case 'rating':
      return [
        desc(
          sql`(${listings.ratingSum} + ${PRIOR_COUNT * PRIOR_MEAN}) / (${listings.ratingCount} + ${PRIOR_COUNT})::float`,
        ),
        desc(listings.publishedAt),
      ];
    case 'price_asc':
      return [asc(listings.priceCents), desc(listings.publishedAt)];
    case 'price_desc':
      return [desc(listings.priceCents), desc(listings.publishedAt)];
    case 'popular':
      return [desc(listings.acquisitionsCount), desc(listings.publishedAt)];
  }
}

export async function searchCatalog(db: Db, f: CatalogFilters) {
  const where: SQL[] = [eq(listings.status, 'published')];
  const query = f.q ? tsQuery(f.q) : null;
  if (query) where.push(sql`search @@ to_tsquery('simple', ${query})`);
  if (f.system) where.push(eq(listings.systemId, f.system));
  if (f.kind) where.push(sql`${f.kind} = ANY(${listings.kinds})`);
  if (f.price === 'free') where.push(eq(listings.priceCents, 0));
  if (f.price === 'paid') where.push(sql`${listings.priceCents} > 0`);
  if (f.safe) where.push(sql`cardinality(${listings.contentWarnings}) = 0`);
  const condition = and(...where);

  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(condition)
      .orderBy(...orderBy(f.sort), asc(listings.id))
      .limit(PER_PAGE)
      .offset((f.page - 1) * PER_PAGE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(listings)
      .where(condition),
  ]);
  return { rows, total: count?.total ?? 0 };
}

/** Parmi `listingIds`, ceux que l'utilisateur possède (acquisition active). */
export async function ownedAmong(
  db: Db,
  userId: string,
  listingIds: readonly string[],
): Promise<Set<string>> {
  if (!listingIds.length) return new Set();
  const rows = await db
    .select({ listingId: acquisitions.listingId })
    .from(acquisitions)
    .where(
      and(
        eq(acquisitions.userId, userId),
        inArray(acquisitions.listingId, [...listingIds]),
        isNull(acquisitions.revokedAt),
      ),
    );
  return new Set(rows.map((r) => r.listingId));
}
