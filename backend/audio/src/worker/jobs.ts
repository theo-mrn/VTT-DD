/**
 * Traitement des jobs du worker (table `jobs`, SKIP LOCKED) :
 * - `analyze` : sonde, loudness, transcodage si besoin, dépôt des fichiers,
 *   puis `ready` (`audio.asset_ready`) ou `rejected` (`audio.asset_rejected`) ;
 * - `purge` : fichiers d'un asset supprimé depuis PURGE_AFTER_DAYS.
 * 3 tentatives avec attente croissante ; un fichier refusé ne réessaie pas.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Actor } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { AudioConfig } from '../config.js';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import { assets, jobs, type AssetRow, type JobRow } from '../db/schema.js';
import { toAsset } from '../modules/assets/view.js';
import { FORMAT_MIME, sniffAudio } from '../storage/sniff.js';
import { assetFolder, type AudioStorage } from '../storage/s3.js';
import {
  loudness,
  needsTranscode,
  normalizationGain,
  probe,
  RejectError,
  transcode,
} from './ffmpeg.js';

export const MAX_ATTEMPTS = 3;
/** Attente avant la tentative suivante (après la 1re, la 2e). */
const BACKOFF_MS = [10_000, 60_000, 300_000];
/** Bail d'un job en cours : repris par un autre worker s'il n'est pas terminé à temps. */
const LEASE = '10 minutes';
const MINUTE = 60_000;

const SYSTEM: Actor = { userId: null, role: 'system', characterId: null };

export interface WorkerDeps {
  db: Db;
  storage: AudioStorage;
  config: Pick<
    AudioConfig,
    'FFMPEG_PATH' | 'FFPROBE_PATH' | 'WORKER_TMP_DIR' | 'AUDIO_LOUDNESS_TARGET_LUFS'
  >;
  /** Téléchargement d'une entrée du catalogue (tests : injectable). */
  fetch?: typeof globalThis.fetch;
  logger?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
}

/** Prend le prochain job échu (ou dont le bail a expiré) ; null s'il n'y en a pas. */
export async function claimJob(db: Db, onlyCampaign?: string): Promise<JobRow | null> {
  // Tests : seulement les jobs d'une campagne (la base de test est partagée)
  const scope = onlyCampaign
    ? sql`AND asset_id IN (SELECT id FROM ${assets} WHERE campaign_id = ${onlyCampaign})`
    : sql``;
  const r = await db.execute(sql`
    UPDATE ${jobs} SET status = 'running', attempts = attempts + 1,
      locked_until = now() + ${LEASE}::interval, updated_at = now()
    WHERE id = (
      SELECT id FROM ${jobs}
      WHERE ((status = 'pending' AND run_after <= now())
         OR (status = 'running' AND locked_until < now()))
      ${scope}
      ORDER BY run_after
      LIMIT 1
      FOR UPDATE SKIP LOCKED)
    RETURNING id`);
  const id = (r.rows[0] as { id: string } | undefined)?.id;
  if (!id) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return job ?? null;
}

const extOf = (format: string) => (format === 'aac' ? 'aac' : format);

async function download(deps: WorkerDeps, row: AssetRow, file: string) {
  if (row.source === 'upload') {
    await deps.storage.download(row.originalKey!, file);
    return;
  }
  // Catalogue : fichier servi par son origine (liste fermée côté serveur)
  const res = await (deps.fetch ?? globalThis.fetch)(row.playbackUrl!, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`catalogue : ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

/** Analyse d'un asset ; renvoie la ligne mise à jour. */
export async function analyze(deps: WorkerDeps, row: AssetRow): Promise<AssetRow> {
  const dir = await mkdtemp(join(deps.config.WORKER_TMP_DIR, 'audio-'));
  try {
    const input = join(dir, 'input');
    await download(deps, row, input);
    const maxDurationMs = (row.kind === 'sfx' ? 10 : 60) * MINUTE;
    const p = await probe(deps.config.FFPROBE_PATH, input, maxDurationMs);
    const l = await loudness(deps.config.FFMPEG_PATH, input);
    const gainDb = normalizationGain(l, deps.config.AUDIO_LOUDNESS_TARGET_LUFS);
    const metadata = {
      codec: p.codec,
      sampleRate: p.sampleRate,
      channels: p.channels,
      bitrate: p.bitrate,
      durationMs: p.durationMs,
      loudnessLufs: l.integrated,
      truePeakDbtp: l.truePeak,
      gainDb,
    };
    if (row.source !== 'upload') return { ...row, ...metadata };

    const format = sniffAudio((await readFile(input)).subarray(0, 4096));
    if (!format) throw new RejectError('Type de fichier non reconnu');
    const folder = assetFolder(row.campaignId, row.id);
    const originalKey = `${folder}original.${extOf(format)}`;
    await deps.storage.upload(originalKey, input, FORMAT_MIME[format]);
    let playbackKey = originalKey;
    let mimeType = FORMAT_MIME[format];
    if (needsTranscode(p)) {
      const out = join(dir, 'playback.m4a');
      await transcode(deps.config.FFMPEG_PATH, input, out);
      playbackKey = `${folder}playback.m4a`;
      mimeType = 'audio/mp4';
      await deps.storage.upload(playbackKey, out, mimeType);
    }
    if (row.originalKey && row.originalKey !== originalKey)
      await deps.storage.remove([row.originalKey]);
    return { ...row, ...metadata, originalKey, playbackKey, mimeType };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function finishAnalyze(deps: WorkerDeps, job: JobRow, updated: AssetRow) {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .update(assets)
      .set({
        status: 'ready',
        codec: updated.codec,
        sampleRate: updated.sampleRate,
        channels: updated.channels,
        bitrate: updated.bitrate,
        durationMs: updated.durationMs,
        loudnessLufs: updated.loudnessLufs,
        truePeakDbtp: updated.truePeakDbtp,
        gainDb: updated.gainDb,
        originalKey: updated.originalKey,
        playbackKey: updated.playbackKey,
        mimeType: updated.mimeType,
        rejectReason: null,
        version: sql`${assets.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(assets.id, updated.id))
      .returning();
    await tx
      .update(jobs)
      .set({ status: 'done', lockedUntil: null, updatedAt: sql`now()` })
      .where(eq(jobs.id, job.id));
    await appendEvent(
      tx,
      { correlationId: `worker:${job.id}` },
      {
        type: 'audio.asset_ready',
        actor: SYSTEM,
        aggregate: { type: 'audio_asset', id: updated.id },
        payload: { asset: toAsset(row!, deps.storage) },
        visibility: 'gm_only',
        campaignId: updated.campaignId,
      },
    );
  });
}

async function reject(deps: WorkerDeps, job: JobRow, row: AssetRow, reason: string) {
  if (row.source === 'upload' && row.originalKey)
    await deps.storage.remove([row.originalKey]).catch(() => undefined);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({
        status: 'rejected',
        rejectReason: reason.slice(0, 200),
        version: sql`${assets.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(assets.id, row.id));
    await tx
      .update(jobs)
      .set({
        status: 'failed',
        lastError: reason.slice(0, 500),
        lockedUntil: null,
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, job.id));
    await appendEvent(
      tx,
      { correlationId: `worker:${job.id}` },
      {
        type: 'audio.asset_rejected',
        actor: SYSTEM,
        aggregate: { type: 'audio_asset', id: row.id },
        payload: { assetId: row.id, reason },
        visibility: 'gm_only',
        campaignId: row.campaignId,
      },
    );
  });
}

async function purge(deps: WorkerDeps, job: JobRow, row: AssetRow | undefined) {
  // Ranimé entre-temps : rien à effacer
  if (row && row.deletedAt) {
    const keys = [row.originalKey, row.playbackKey].filter((k): k is string => !!k);
    await deps.storage.remove([...new Set(keys)]);
  }
  await deps.db
    .update(jobs)
    .set({ status: 'done', lockedUntil: null, updatedAt: sql`now()` })
    .where(eq(jobs.id, job.id));
}

/** Exécute un job pris ; les erreurs passagères replanifient, les refus sont définitifs. */
export async function runJob(
  deps: WorkerDeps,
  job: JobRow,
): Promise<'done' | 'rejected' | 'retry' | 'failed'> {
  const [row] = job.assetId
    ? await deps.db.select().from(assets).where(eq(assets.id, job.assetId))
    : [];
  try {
    if (job.kind === 'purge') {
      await purge(deps, job, row);
      return 'done';
    }
    if (!row || row.status !== 'processing') {
      await deps.db
        .update(jobs)
        .set({ status: 'done', lockedUntil: null, updatedAt: sql`now()` })
        .where(eq(jobs.id, job.id));
      return 'done';
    }
    await finishAnalyze(deps, job, await analyze(deps, row));
    deps.logger?.info({ jobId: job.id, assetId: row.id }, 'son analysé');
    return 'done';
  } catch (error) {
    const message = (error as Error).message;
    if (error instanceof RejectError && row) {
      await reject(deps, job, row, message);
      deps.logger?.info({ jobId: job.id, assetId: row.id, reason: message }, 'son refusé');
      return 'rejected';
    }
    deps.logger?.warn({ jobId: job.id, error: message, attempt: job.attempts }, 'job en échec');
    if (job.attempts >= MAX_ATTEMPTS) {
      if (row && job.kind === 'analyze')
        await reject(deps, job, row, 'Traitement impossible, réessayez l’envoi');
      else
        await deps.db
          .update(jobs)
          .set({
            status: 'failed',
            lastError: message.slice(0, 500),
            lockedUntil: null,
            updatedAt: sql`now()`,
          })
          .where(eq(jobs.id, job.id));
      return 'failed';
    }
    const wait = BACKOFF_MS[job.attempts - 1] ?? BACKOFF_MS.at(-1)!;
    await deps.db
      .update(jobs)
      .set({
        status: 'pending',
        lastError: message.slice(0, 500),
        lockedUntil: null,
        runAfter: new Date(Date.now() + wait),
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, job.id));
    return 'retry';
  }
}
