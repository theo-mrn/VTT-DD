/** Lectures communes aux modules : fiche, version, possession. */
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/outbox.js';
import {
  acquisitions,
  creators,
  listings,
  listingVersions,
  type ListingRow,
  type VersionRow,
} from '../db/schema.js';
import { notFound } from '../modules/common.js';
import { searchTextOf } from './views.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listingById(db: Db | Tx, id: string): Promise<ListingRow | undefined> {
  const [row] = await db.select().from(listings).where(eq(listings.id, id));
  return row;
}

/** Fiche par adresse ou identifiant. */
export async function listingBySlugOrId(db: Db, key: string): Promise<ListingRow | undefined> {
  const [row] = await db
    .select()
    .from(listings)
    .where(
      UUID.test(key)
        ? or(eq(listings.id, key.toLowerCase()), eq(listings.slug, key))
        : eq(listings.slug, key),
    );
  return row;
}

/** Fiche de l'appelant (verrouillée si `forUpdate`) ; celle d'un autre : 404. */
export async function ownListing(
  db: Db | Tx,
  id: string,
  userId: string,
  forUpdate = false,
): Promise<ListingRow> {
  const q = db
    .select()
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.creatorId, userId)));
  const [row] = forUpdate ? await q.for('update') : await q;
  if (!row) throw notFound();
  return row;
}

/** Version et sa fiche, si la fiche est à `userId`. */
export async function ownVersion(
  db: Db | Tx,
  versionId: string,
  userId: string,
  forUpdate = false,
): Promise<{ version: VersionRow; listing: ListingRow }> {
  const q = db.select().from(listingVersions).where(eq(listingVersions.id, versionId));
  const [version] = forUpdate ? await q.for('update') : await q;
  if (!version) throw notFound('Version introuvable');
  const listing = await ownListing(db, version.listingId, userId, forUpdate);
  return { version, listing };
}

export async function versionsOf(db: Db | Tx, listingId: string): Promise<VersionRow[]> {
  return db
    .select()
    .from(listingVersions)
    .where(eq(listingVersions.listingId, listingId))
    .orderBy(desc(listingVersions.createdAt));
}

export async function versionById(db: Db | Tx, id: string): Promise<VersionRow | undefined> {
  const [row] = await db.select().from(listingVersions).where(eq(listingVersions.id, id));
  return row;
}

/** Acquisition active (non révoquée). */
export async function owns(db: Db | Tx, userId: string, listingId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(acquisitions)
    .where(
      and(
        eq(acquisitions.userId, userId),
        eq(acquisitions.listingId, listingId),
        isNull(acquisitions.revokedAt),
      ),
    );
  return Boolean(row);
}

/** Recalcule le texte de recherche d'une fiche (titre, étiquettes ou nom du créateur changés). */
export async function refreshSearch(tx: Db | Tx, listing: ListingRow): Promise<void> {
  const [creator] = await tx
    .select({ displayName: creators.displayName })
    .from(creators)
    .where(eq(creators.userId, listing.creatorId));
  await tx
    .update(listings)
    .set({ searchText: searchTextOf(listing, creator?.displayName ?? null) })
    .where(eq(listings.id, listing.id));
}
