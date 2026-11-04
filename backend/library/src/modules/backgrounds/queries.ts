/** Requêtes des fonds : recherche, filtres, facettes, lecture d'une entrée. */
import {
  BACKGROUNDS_PER_PAGE,
  type Background,
  type BackgroundKind,
  type BackgroundFacets,
  type BackgroundQuery,
  type LibraryLang,
} from '@vtt/contracts';
import { and, asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  backgrounds,
  backgroundVariants,
  type BackgroundRow,
  type VariantRow,
} from '../../db/schema.js';
import { prefix, searchTerms } from '../../search.js';

/**
 * Un terme est trouvé dans l'une ou l'autre langue, par sa racine (configuration de la langue)
 * ou tel quel (« simple ») : une requête en anglais marche aussi dans l'interface française.
 */
function termMatch(term: string): SQL {
  const p = prefix(term);
  return sql`(${backgrounds.searchFr} @@ (to_tsquery('french', ${p}) || to_tsquery('simple', ${p}))
    or ${backgrounds.searchEn} @@ (to_tsquery('english', ${p}) || to_tsquery('simple', ${p})))`;
}

/** Score d'une entrée : somme des rangs dans les deux langues, pour tous les termes. */
function rank(terms: string[]): SQL<number> {
  const any = terms.map(prefix).join(' | ');
  return sql<number>`(ts_rank_cd(${backgrounds.searchFr}, to_tsquery('french', ${any}) || to_tsquery('simple', ${any}))
    + ts_rank_cd(${backgrounds.searchEn}, to_tsquery('english', ${any}) || to_tsquery('simple', ${any})))`;
}

function facetFilters(q: BackgroundQuery): SQL[] {
  const where: SQL[] = [];
  if (q.kind) where.push(eq(backgrounds.kind, q.kind));
  if (q.place) where.push(eq(backgrounds.place, q.place));
  if (q.setting) where.push(eq(backgrounds.setting, q.setting));
  if (q.time) where.push(eq(backgrounds.timeOfDay, q.time));
  if (q.mood) where.push(sql`${q.mood} = ANY(${backgrounds.moods})`);
  if (q.collection) where.push(eq(backgrounds.collection, q.collection));
  if (q.animated !== undefined) where.push(eq(backgrounds.animated, q.animated));
  return where;
}

async function page(db: Db, where: SQL | undefined, order: SQL[], pageNumber: number) {
  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(backgrounds)
      .where(where)
      .orderBy(...order, asc(backgrounds.id))
      .limit(BACKGROUNDS_PER_PAGE)
      .offset((pageNumber - 1) * BACKGROUNDS_PER_PAGE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(backgrounds)
      .where(where),
  ]);
  return { rows, total: count?.total ?? 0 };
}

/**
 * Recherche : tous les termes d'abord ; si rien ne répond à tous, n'importe lequel (« grotte
 * cristal lune » trouve encore les grottes). Sans requête : collection, puis titre.
 */
export async function searchBackgrounds(db: Db, q: BackgroundQuery) {
  const filters = facetFilters(q);
  const terms = q.q ? searchTerms(q.q) : [];
  const title = q.lang === 'en' ? backgrounds.titleEn : backgrounds.titleFr;
  if (!terms.length)
    return page(db, and(...filters), [asc(backgrounds.collection), asc(title)], q.page);

  const order = [sql`${rank(terms)} desc`, asc(title)];
  const all = await page(db, and(...filters, ...terms.map(termMatch)), order, q.page);
  if (all.total > 0 || terms.length === 1) return all;
  return page(db, and(...filters, or(...terms.map(termMatch))), order, q.page);
}

export async function variantsOf(db: Db, ids: readonly string[]) {
  const byBackground = new Map<string, VariantRow[]>();
  if (!ids.length) return byBackground;
  const rows = await db
    .select()
    .from(backgroundVariants)
    .where(inArray(backgroundVariants.backgroundId, [...ids]))
    .orderBy(asc(backgroundVariants.position));
  for (const v of rows) {
    const list = byBackground.get(v.backgroundId) ?? [];
    list.push(v);
    byBackground.set(v.backgroundId, list);
  }
  return byBackground;
}

/** Fond dont une variante a cette adresse (fond actuel d'une scène). */
export async function backgroundByUrl(db: Db, url: string) {
  const [row] = await db
    .select({ background: backgrounds })
    .from(backgroundVariants)
    .innerJoin(backgrounds, eq(backgrounds.id, backgroundVariants.backgroundId))
    .where(eq(backgroundVariants.url, url))
    .limit(1);
  return row?.background ?? null;
}

export async function backgroundById(db: Db, id: string) {
  const [row] = await db.select().from(backgrounds).where(eq(backgrounds.id, id)).limit(1);
  return row ?? null;
}

/** Entrée servie, dans la langue demandée. */
export function backgroundView(
  b: BackgroundRow,
  variants: readonly VariantRow[],
  lang: LibraryLang,
): Background {
  return {
    id: b.id,
    kind: b.kind,
    title: lang === 'en' ? b.titleEn : b.titleFr,
    description: lang === 'en' ? b.descriptionEn : b.descriptionFr,
    keywords: lang === 'en' ? b.keywordsEn : b.keywordsFr,
    collection: b.collection,
    place: b.place as Background['place'],
    setting: b.setting as Background['setting'],
    timeOfDay: b.timeOfDay as Background['timeOfDay'],
    moods: b.moods as Background['moods'],
    animated: b.animated,
    variants: variants.map((v) => ({
      id: v.id,
      position: v.position,
      url: v.url,
      thumbUrl: v.thumbUrl,
      previewUrl: v.previewUrl,
      kind: v.kind,
      grid: v.grid,
      width: v.width,
      height: v.height,
    })),
  };
}

/** Nombre d'entrées par valeur de chaque facette, pour un usage (ou tout le catalogue). */
export async function facets(db: Db, kind?: BackgroundKind): Promise<BackgroundFacets> {
  const scope = kind ? sql`where ${backgrounds.kind} = ${kind}` : sql``;
  const count = (column: SQL) =>
    db.execute<{ value: string | null; n: number }>(
      sql`select ${column} as value, count(*)::int as n from ${backgrounds} ${scope} group by 1`,
    );
  const [kinds, collections, covers, places, settings, times, moods, totals] = await Promise.all([
    db.execute<{ value: string | null; n: number }>(
      sql`select ${backgrounds.kind} as value, count(*)::int as n from ${backgrounds} group by 1`,
    ),
    count(sql`${backgrounds.collection}`),
    // Couverture : la vignette du premier fond fixe de la collection (ordre de la liste)
    db.execute<{ collection: string; thumb: string }>(
      sql`select distinct on (b.collection) b.collection, coalesce(v.thumb_url, v.url) as thumb
          from ${backgrounds} b join ${backgroundVariants} v on v.background_id = b.id
          where b.collection is not null and not b.animated and v.kind = 'image'
            ${kind ? sql`and b.kind = ${kind}` : sql``}
          order by b.collection, b.title_fr, b.id, v.position`,
    ),
    count(sql`${backgrounds.place}`),
    count(sql`${backgrounds.setting}`),
    count(sql`${backgrounds.timeOfDay}`),
    count(sql`unnest(${backgrounds.moods})`),
    db.execute<{ total: number; animated: number }>(
      sql`select count(*)::int as total, count(*) filter (where ${backgrounds.animated})::int as animated from ${backgrounds} ${scope}`,
    ),
  ]);
  const record = (rows: { value: string | null; n: number }[]) =>
    Object.fromEntries(rows.filter((r) => r.value !== null).map((r) => [r.value!, r.n]));
  return {
    kinds: record(kinds.rows),
    collections: record(collections.rows),
    covers: Object.fromEntries(covers.rows.map((r) => [r.collection, r.thumb])),
    places: record(places.rows),
    settings: record(settings.rows),
    times: record(times.rows),
    moods: record(moods.rows),
    animated: totals.rows[0]?.animated ?? 0,
    total: totals.rows[0]?.total ?? 0,
  };
}
