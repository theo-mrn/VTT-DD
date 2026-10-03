/**
 * Playlists en base : pistes ordonnées, version, événements (gm_only), et
 * répercussion sur les canaux qui les jouent (file recalculée autour de la
 * piste courante, cause `playlist_updated`).
 */
import { changesPayload, type Actor, type Playlist } from '@vtt/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { channels, playlistItems, playlists, type PlaylistRow } from '../../db/schema.js';
import type { AudioStorage } from '../../storage/s3.js';
import { replaceQueue } from '../channels/machine.js';
import { loadAssets, lockChannel, saveTransition, toMachine } from '../channels/repository.js';

type Reader = Pick<Db, 'select'>;

export async function playlistView(db: Reader, row: PlaylistRow): Promise<Playlist> {
  const items = await db
    .select({ assetId: playlistItems.assetId })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, row.id))
    .orderBy(asc(playlistItems.position));
  return {
    id: row.id,
    name: row.name,
    assetIds: items.map((i) => i.assetId),
    version: row.version,
  };
}

export async function listPlaylists(db: Reader, campaignId: string): Promise<Playlist[]> {
  const rows = await db
    .select()
    .from(playlists)
    .where(eq(playlists.campaignId, campaignId))
    .orderBy(asc(playlists.name), asc(playlists.id));
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(playlistItems)
    .where(
      inArray(
        playlistItems.playlistId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(playlistItems.position));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    version: r.version,
    assetIds: items.filter((i) => i.playlistId === r.id).map((i) => i.assetId),
  }));
}

/** Remplace l'ordre des pistes (unicité des positions différée jusqu'au COMMIT). */
export async function setItems(tx: Tx, playlistId: string, assetIds: string[]) {
  await tx.delete(playlistItems).where(eq(playlistItems.playlistId, playlistId));
  if (assetIds.length)
    await tx
      .insert(playlistItems)
      .values(assetIds.map((assetId, position) => ({ playlistId, assetId, position })));
}

export function playlistEvent(
  tx: Tx,
  ctx: EventContext,
  type: 'audio.playlist_created' | 'audio.playlist_updated' | 'audio.playlist_deleted',
  campaignId: string,
  playlistId: string,
  actor: Actor,
  payload: Record<string, unknown>,
) {
  return appendEvent(tx, ctx, {
    type,
    actor,
    aggregate: { type: 'audio_playlist', id: playlistId },
    payload,
    visibility: 'gm_only',
    campaignId,
  });
}

/** Canaux qui jouent cette playlist : file recalculée autour de la piste courante. */
export async function syncChannelsWithPlaylist(
  tx: Tx,
  o: {
    campaignId: string;
    playlistId: string;
    assetIds: string[];
    storage: AudioStorage | undefined;
    ctx: EventContext;
    actor: Actor;
    nowMs: number;
  },
) {
  const holders = await tx
    .select({ channel: channels.channel })
    .from(channels)
    .where(and(eq(channels.campaignId, o.campaignId), eq(channels.playlistId, o.playlistId)));
  for (const h of holders) {
    const ch = await lockChannel(tx, o.campaignId, h.channel, o.nowMs);
    const { rows, infos } = await loadAssets(tx, [
      ...ch.queue,
      ...o.assetIds,
      ...(ch.assetId ? [ch.assetId] : []),
    ]);
    const next = replaceQueue(toMachine(ch), o.assetIds, o.nowMs, { assets: infos });
    await saveTransition(tx, {
      row: ch,
      next,
      rows,
      infos,
      storage: o.storage,
      cause: 'playlist_updated',
      actor: o.actor,
      ctx: o.ctx,
      nowMs: o.nowMs,
    });
  }
}

/**
 * Asset supprimé : il sort de toutes les playlists (version + 1, événement).
 * Les canaux sont traités à part (deleteAsset), une seule transition par canal.
 */
export async function removeAssetFromPlaylists(
  tx: Tx,
  ctx: EventContext,
  campaignId: string,
  assetId: string,
  actor: Actor,
) {
  const holding = await tx
    .select({ id: playlistItems.playlistId })
    .from(playlistItems)
    .where(eq(playlistItems.assetId, assetId));
  for (const { id } of holding) {
    const [row] = await tx.select().from(playlists).where(eq(playlists.id, id)).for('update');
    if (!row) continue;
    const before = await playlistView(tx, row);
    await setItems(
      tx,
      id,
      before.assetIds.filter((a) => a !== assetId),
    );
    const [updated] = await tx
      .update(playlists)
      .set({ version: sql`${playlists.version} + 1`, updatedAt: sql`now()` })
      .where(eq(playlists.id, id))
      .returning();
    const after = await playlistView(tx, updated!);
    await playlistEvent(tx, ctx, 'audio.playlist_updated', campaignId, id, actor, {
      playlist: after,
      ...changesPayload({ assetIds: before.assetIds }, { assetIds: after.assetIds }),
    });
  }
}
