/**
 * Consommateur durable `audio-campaigns` : une campagne supprimée
 * (`campaign.deleted`) emporte sa bibliothèque. Suppression logique des
 * assets (fichiers purgés PURGE_AFTER_DAYS plus tard par le worker),
 * suppression des playlists, des effets et arrêt des canaux.
 *
 * Au moins une fois : l'inbox écarte un événement déjà traité (livré deux fois).
 */
import { consumeEvents, type Bus } from '@vtt/platform';
import { uuidv7, type EventEnvelope } from '@vtt/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assets, channels, cues, inbox, jobs, playlists, soundboards } from '../db/schema.js';

export const CONSUMER = 'audio-campaigns';

/** Traite une suppression de campagne ; false si déjà traitée (doublon). */
export async function handleCampaignDeleted(
  db: Db,
  event: Pick<EventEnvelope, 'id' | 'type' | 'roomId' | 'aggregate'>,
  o: { nowMs: number; purgeAfterDays: number },
): Promise<boolean> {
  if (event.type !== 'campaign.deleted') return false;
  const campaignId = event.roomId ?? event.aggregate.id;
  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: CONSUMER })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return false;
    const now = new Date(o.nowMs);
    const removed = await tx
      .update(assets)
      .set({ deletedAt: now, version: sql`${assets.version} + 1`, updatedAt: now })
      .where(and(eq(assets.campaignId, campaignId), isNull(assets.deletedAt)))
      .returning({ id: assets.id, source: assets.source });
    const purgeAt = new Date(o.nowMs + o.purgeAfterDays * 86_400_000);
    const uploads = removed.filter((a) => a.source === 'upload');
    if (uploads.length)
      await tx.insert(jobs).values(
        uploads.map((a) => ({
          id: uuidv7(),
          assetId: a.id,
          kind: 'purge' as const,
          runAfter: purgeAt,
        })),
      );
    await tx.delete(cues).where(eq(cues.campaignId, campaignId));
    await tx.delete(playlists).where(eq(playlists.campaignId, campaignId));
    await tx.delete(soundboards).where(eq(soundboards.campaignId, campaignId));
    await tx
      .update(channels)
      .set({ status: 'stopped', endsAt: null, positionMs: 0, deletedAt: now, updatedAt: now })
      .where(eq(channels.campaignId, campaignId));
    return true;
  });
}

export function startCampaignConsumer(o: {
  bus: Bus;
  db: Db;
  durable: string;
  purgeAfterDays: number;
  now: () => number;
  logger: NonNullable<Parameters<typeof consumeEvents>[1]['logger']>;
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: o.durable,
    subjects: ['vtt.*.campaign.deleted'],
    deliver: 'all',
    logger: o.logger,
    async handler(event) {
      const done = await handleCampaignDeleted(o.db, event, {
        nowMs: o.now(),
        purgeAfterDays: o.purgeAfterDays,
      });
      o.logger.info(
        { eventId: event.id, campaignId: event.roomId, done },
        'campagne supprimée : sons retirés',
      );
    },
  });
}
