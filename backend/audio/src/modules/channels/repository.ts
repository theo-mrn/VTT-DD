/**
 * Canaux en base : verrou de ligne, application d'une transition de la
 * machine (machine.ts), enregistrement et événement `audio.channel_changed`
 * dans la même transaction. Utilisé par les commandes, le planificateur,
 * la suppression d'un asset et la modification d'une playlist.
 */
import {
  changesPayload,
  type Actor,
  type ChannelChangedPayload,
  type ChannelName,
  type ChannelState,
} from '@vtt/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  assets,
  channels,
  playlistItems,
  type AssetRow,
  type ChannelRow,
} from '../../db/schema.js';
import type { AudioStorage } from '../../storage/s3.js';
import { toPlaybackAsset } from '../assets/view.js';
import {
  autoNextIndex,
  INITIAL_STATE,
  sameState,
  type AssetInfo,
  type MachineContext,
  type MachineState,
} from './machine.js';

type Reader = Pick<Db, 'select'>;

export const toMachine = (r: ChannelRow): MachineState => ({
  status: r.status,
  assetId: r.assetId,
  playlistId: r.playlistId,
  queue: r.queue,
  queueIndex: r.queueIndex,
  repeat: r.repeat,
  shuffle: r.shuffle,
  positionMs: r.positionMs,
  anchorAtMs: r.anchorAt.getTime(),
  endsAtMs: r.endsAt ? r.endsAt.getTime() : null,
  volume: r.volume,
  crossfadeMs: r.crossfadeMs,
});

/** Assets de la file (supprimés compris) : ce que la machine et les clients doivent en savoir. */
export async function loadAssets(
  db: Reader,
  ids: Iterable<string>,
): Promise<{ rows: Map<string, AssetRow>; infos: Map<string, AssetInfo> }> {
  const list = [...new Set(ids)];
  const rows = new Map<string, AssetRow>();
  if (list.length) {
    for (const r of await db.select().from(assets).where(inArray(assets.id, list)))
      rows.set(r.id, r);
  }
  const infos = new Map<string, AssetInfo>();
  for (const r of rows.values())
    infos.set(r.id, {
      id: r.id,
      durationMs: r.durationMs,
      playable: r.status === 'ready' && r.deletedAt === null,
    });
  return { rows, infos };
}

/** Pistes d'une playlist dans leur ordre. */
export async function playlistOrder(db: Reader, playlistId: string): Promise<string[]> {
  const items = await db
    .select({ assetId: playlistItems.assetId })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.position));
  return items.map((i) => i.assetId);
}

/** Ligne du canal verrouillée (créée à la demande). */
export async function lockChannel(
  tx: Tx,
  campaignId: string,
  channel: ChannelName,
  nowMs: number,
): Promise<ChannelRow> {
  const init = INITIAL_STATE(nowMs, channel);
  await tx
    .insert(channels)
    .values({ campaignId, channel, repeat: init.repeat, anchorAt: new Date(nowMs) })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(channels)
    .where(and(eq(channels.campaignId, campaignId), eq(channels.channel, channel)))
    .for('update');
  return row!;
}

/** État public du canal (piste et suivante résolues en PlaybackAsset). */
export function buildState(
  row: ChannelRow,
  rows: ReadonlyMap<string, AssetRow>,
  infos: ReadonlyMap<string, AssetInfo>,
  storage: AudioStorage | undefined,
): ChannelState {
  const s = toMachine(row);
  const track = s.assetId ? rows.get(s.assetId) : undefined;
  const ctx: MachineContext = { assets: infos };
  const nextIdx = s.status === 'stopped' ? null : autoNextIndex(s, ctx);
  const next = nextIdx !== null ? rows.get(s.queue[nextIdx]!) : undefined;
  return {
    campaignId: row.campaignId,
    channel: row.channel,
    version: row.version,
    status: row.status,
    track: track ? toPlaybackAsset(track, storage) : null,
    next: next ? toPlaybackAsset(next, storage) : null,
    playlistId: row.playlistId,
    queueIndex: row.queueIndex,
    queueLength: row.queue.length,
    repeat: row.repeat,
    shuffle: row.shuffle,
    positionMs: row.positionMs,
    anchorAt: row.anchorAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    volume: row.volume,
    crossfadeMs: row.crossfadeMs,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** État d'un canal sans verrou (lecture). */
export async function readChannel(
  db: Reader,
  campaignId: string,
  channel: ChannelName,
  storage: AudioStorage | undefined,
  nowMs: number,
): Promise<ChannelState> {
  const [row] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.campaignId, campaignId), eq(channels.channel, channel)));
  const r: ChannelRow = row ?? {
    campaignId,
    channel,
    version: 0,
    ...rowFields(INITIAL_STATE(nowMs, channel)),
    updatedBy: null,
    updatedAt: new Date(nowMs),
    deletedAt: null,
  };
  const { rows, infos } = await loadAssets(db, r.queue.concat(r.assetId ?? []));
  return buildState(r, rows, infos, storage);
}

const rowFields = (s: MachineState) => ({
  status: s.status,
  assetId: s.assetId,
  playlistId: s.playlistId,
  queue: s.queue,
  queueIndex: s.queueIndex,
  repeat: s.repeat,
  shuffle: s.shuffle,
  positionMs: s.positionMs,
  anchorAt: new Date(s.anchorAtMs),
  endsAt: s.endsAtMs === null ? null : new Date(s.endsAtMs),
  volume: s.volume,
  crossfadeMs: s.crossfadeMs,
});

/** Résumé suivi dans `changes` (ce qu'on entend). */
const summary = (s: MachineState) => ({
  status: s.status,
  assetId: s.assetId,
  playlistId: s.playlistId,
  queueIndex: s.queueIndex,
  positionMs: s.positionMs,
  repeat: s.repeat,
  shuffle: s.shuffle,
  volume: s.volume,
  crossfadeMs: s.crossfadeMs,
});

export interface TransitionResult {
  state: ChannelState;
  changed: boolean;
}

/**
 * Enregistre `next` si l'état change : version + 1, mise à jour, événement
 * public dans l'outbox. Sinon, l'état courant, sans écriture (idempotence).
 */
export async function saveTransition(
  tx: Tx,
  o: {
    row: ChannelRow;
    next: MachineState;
    rows: ReadonlyMap<string, AssetRow>;
    infos: ReadonlyMap<string, AssetInfo>;
    storage: AudioStorage | undefined;
    cause: ChannelChangedPayload['cause'];
    actor: Actor;
    ctx: EventContext;
    nowMs: number;
    skipped?: number;
  },
): Promise<TransitionResult> {
  const before = toMachine(o.row);
  if (sameState(before, o.next))
    return { state: buildState(o.row, o.rows, o.infos, o.storage), changed: false };
  const [updated] = await tx
    .update(channels)
    .set({
      ...rowFields(o.next),
      version: sql`${channels.version} + 1`,
      updatedBy: o.actor.userId,
      updatedAt: new Date(o.nowMs),
      deletedAt: null,
    })
    .where(and(eq(channels.campaignId, o.row.campaignId), eq(channels.channel, o.row.channel)))
    .returning();
  const state = buildState(updated!, o.rows, o.infos, o.storage);
  const payload: ChannelChangedPayload = {
    state,
    cause: o.cause,
    changes: changesPayload(summary(before), summary(o.next)).changes,
    ...(o.skipped ? { skipped: o.skipped } : {}),
  };
  await appendEvent(tx, o.ctx, {
    type: 'audio.channel_changed',
    actor: o.actor,
    aggregate: { type: 'audio_channel', id: `${o.row.campaignId}:${o.row.channel}` },
    payload: payload as unknown as Record<string, unknown>,
    visibility: 'public',
    campaignId: o.row.campaignId,
  });
  return { state, changed: true };
}

export const SYSTEM_ACTOR: Actor = { userId: null, role: 'system', characterId: null };
