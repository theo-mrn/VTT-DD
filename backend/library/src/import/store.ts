/** Écritures de l'import : lieux, variantes, descriptions. Rejouables sans doublon. */
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { backgrounds, backgroundVariants } from '../db/schema.js';
import { searchTexts } from '../search.js';
import type { Description } from './describe.js';
import { provisionalTitle, type SourceEntry, type SourceId } from './sources.js';

export interface StoredEntry {
  id: string;
  /** `<modèle>#<gabarit>` de la description, ou null si le lieu n'est pas encore décrit. */
  describedBy: string | null;
}

/** Lieu existant (même source, même clé) ou nouveau, au titre provisoire tiré du prompt. */
export async function upsertEntry(
  db: Db,
  source: SourceId,
  entry: { sourceKey: string; collection: string | null; hint: string },
  o: { animated: boolean; kind: 'map' | 'illustration' },
): Promise<StoredEntry> {
  const [found] = await db
    .select({ id: backgrounds.id, describedBy: backgrounds.describedBy })
    .from(backgrounds)
    .where(and(eq(backgrounds.source, source), eq(backgrounds.sourceKey, entry.sourceKey)))
    .limit(1);
  if (found) {
    await db
      .update(backgrounds)
      .set({ collection: entry.collection, animated: o.animated, kind: o.kind })
      .where(eq(backgrounds.id, found.id));
    return found;
  }
  const title = provisionalTitle(entry.hint);
  const search = searchTexts({
    title,
    keywords: [],
    description: '',
    collection: entry.collection,
  });
  const id = crypto.randomUUID();
  await db.insert(backgrounds).values({
    id,
    source,
    sourceKey: entry.sourceKey,
    collection: entry.collection,
    titleFr: title,
    titleEn: title,
    animated: o.animated,
    kind: o.kind,
    searchHeadFr: search.head,
    searchHeadEn: search.head,
  });
  return { id, describedBy: null };
}

export interface VariantInput {
  position: number;
  url: string;
  thumbUrl: string | null;
  previewUrl?: string | null;
  originalKey: string | null;
  kind?: 'image' | 'video';
  grid?: boolean;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

export async function upsertVariant(db: Db, backgroundId: string, v: VariantInput) {
  await db
    .insert(backgroundVariants)
    .values({ id: crypto.randomUUID(), backgroundId, ...v, kind: v.kind ?? 'image' })
    .onConflictDoUpdate({
      target: backgroundVariants.url,
      set: {
        backgroundId,
        position: v.position,
        thumbUrl: v.thumbUrl,
        previewUrl: v.previewUrl ?? null,
        originalKey: v.originalKey,
        kind: v.kind ?? 'image',
        grid: v.grid ?? false,
        width: v.width,
        height: v.height,
        bytes: v.bytes,
      },
    });
}

/** Écrit la description d'un lieu et ses formes de recherche. */
export async function saveDescription(
  db: Db,
  id: string,
  collection: string | null,
  d: Description,
  describedBy: string,
) {
  const fr = searchTexts({
    title: d.titleFr,
    keywords: d.keywordsFr,
    description: d.descriptionFr,
    collection,
  });
  const en = searchTexts({
    title: d.titleEn,
    keywords: d.keywordsEn,
    description: d.descriptionEn,
    collection,
  });
  await db
    .update(backgrounds)
    .set({
      titleFr: d.titleFr,
      titleEn: d.titleEn,
      descriptionFr: d.descriptionFr,
      descriptionEn: d.descriptionEn,
      keywordsFr: d.keywordsFr,
      keywordsEn: d.keywordsEn,
      place: d.place,
      setting: d.setting,
      timeOfDay: d.timeOfDay,
      moods: d.moods,
      searchHeadFr: fr.head,
      searchBodyFr: fr.body,
      searchHeadEn: en.head,
      searchBodyEn: en.body,
      describedBy,
      describedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(backgrounds.id, id));
}
