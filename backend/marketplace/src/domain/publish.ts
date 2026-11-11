/**
 * Mise en ligne d'une version (docs/marketplace.md § 5) : la version devient la courante de sa
 * fiche, la fiche entre au catalogue à sa première version. Appelée par l'approbation d'un
 * modérateur, et par la soumission quand la revue préalable est désactivée (publication directe,
 * modération après coup : signalements, retrait).
 */
import { MARKETPLACE_EVENTS, type Actor } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import { appendEvent, type EventContext, type Tx } from '../db/outbox.js';
import { listings, listingVersions, type ListingRow, type VersionRow } from '../db/schema.js';

export async function publishVersion(
  tx: Tx,
  ctx: EventContext,
  o: {
    version: VersionRow;
    listing: ListingRow;
    actor: Actor;
    /** Modérateur qui l'a approuvée ; null : publication directe. */
    reviewedBy: string | null;
  },
): Promise<VersionRow> {
  const { version, listing } = o;
  const [published] = await tx
    .update(listingVersions)
    .set({
      status: 'published',
      // Publication directe : la date de mise en ligne, sans modérateur (contrainte du schéma)
      reviewedAt: sql`now()`,
      reviewedBy: o.reviewedBy,
      publishedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(listingVersions.id, version.id))
    .returning();
  const first = listing.status === 'draft';
  const counts = version.counts!;
  await tx
    .update(listings)
    .set({
      currentVersionId: version.id,
      kinds: [
        ...(counts.scenes ? ['scenes'] : []),
        ...(counts.npcTemplates ? ['npcs'] : []),
        ...(counts.objectTemplates ? ['objects'] : []),
      ],
      ...(version.systemId ? { systemId: version.systemId } : {}),
      ...(first ? { status: 'published' as const, publishedAt: sql`now()` } : {}),
      // Revue faite (ou publication directe) : la fiche est vue telle qu'elle est
      needsRecheck: false,
      updatedAt: sql`now()`,
      version: sql`${listings.version} + 1`,
    })
    .where(eq(listings.id, listing.id));
  await appendEvent(tx, ctx, {
    type: MARKETPLACE_EVENTS.versionPublished,
    actor: o.actor,
    aggregate: { type: 'marketplace_version', id: version.id },
    payload: { listingId: listing.id, versionId: version.id, number: version.number, first },
  });
  return published!;
}
