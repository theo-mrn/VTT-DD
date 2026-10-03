/**
 * Chargement d'un plan d'import (transform.ts) en base, rejouable : ids
 * déterministes et `ON CONFLICT DO NOTHING` ; un asset supprimé depuis n'est
 * pas recréé (sa ligne existe encore) ; un envoi n'est copié dans le bucket
 * que la première fois. Aucun événement : l'import précède la bascule.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv7 } from '@vtt/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assets, channels, jobs, legacyIds, playlistItems, playlists } from '../db/schema.js';
import { incomingKey, type AudioStorage } from '../storage/s3.js';
import { LEGACY_SOURCE, type ImportPlan, type PlannedAsset, type ReportLine } from './transform.js';

export interface LoadCounters {
  assets: number;
  copied: number;
  playlists: number;
  channels: number;
  skipped: number;
  errors: number;
}

/** Ce que partagent les étapes du chargement d'un plan. */
interface LoadContext {
  db: Db;
  storage: AudioStorage | undefined;
  fetchFile: (url: string) => Promise<Buffer>;
  report: (line: ReportLine) => void;
  counters: LoadCounters;
  /** Dossier temporaire des fichiers copiés. */
  dir: string;
}

/**
 * Copie d'un envoi dans le bucket ; null (erreur rapportée) si le stockage manque ou si la
 * copie échoue.
 */
async function copyUpload(
  l: LoadContext,
  a: PlannedAsset,
): Promise<{ originalKey: string; sizeBytes: number } | null> {
  if (!l.storage) {
    l.counters.errors += 1;
    l.report({
      type: 'asset',
      legacy: a.legacy[0]!,
      status: 'error',
      detail: 'stockage S3 non configuré',
    });
    return null;
  }
  try {
    const body = await l.fetchFile(a.copyFrom!);
    const file = join(l.dir, a.id);
    await writeFile(file, body);
    const originalKey = incomingKey(a.campaignId, a.id);
    await l.storage.upload(originalKey, file, 'application/octet-stream');
    l.counters.copied += 1;
    return { originalKey, sizeBytes: body.length };
  } catch (e) {
    l.counters.errors += 1;
    l.report({
      type: 'asset',
      legacy: a.legacy[0]!,
      status: 'error',
      detail: `copie impossible : ${(e as Error).message}`,
    });
    return null;
  }
}

/** Ligne de l'asset, et sa tâche d'analyse pour un fichier. */
async function insertAsset(
  l: LoadContext,
  a: PlannedAsset,
  stored: { originalKey: string | null; sizeBytes: number | null },
): Promise<void> {
  await l.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(assets)
      .values({
        id: a.id,
        campaignId: a.campaignId,
        kind: a.kind,
        name: a.name,
        source: a.source,
        status: a.source === 'youtube' ? 'ready' : 'processing',
        youtubeId: a.youtubeId ?? null,
        catalogId: a.catalogId ?? null,
        playbackUrl: a.playbackUrl ?? null,
        originalKey: stored.originalKey,
        sizeBytes: stored.sizeBytes,
        createdBy: null,
      })
      .onConflictDoNothing()
      .returning({ id: assets.id });
    if (row && a.source !== 'youtube')
      await tx.insert(jobs).values({ id: uuidv7(), assetId: a.id, kind: 'analyze' });
    if (row) l.counters.assets += 1;
  });
}

/**
 * Asset d'un plan : déjà là (ligne existante, même supprimée), ou copié puis créé. Faux si
 * la copie a échoué : ses identifiants legacy ne sont pas enregistrés.
 */
async function loadAsset(l: LoadContext, a: PlannedAsset): Promise<boolean> {
  const [existing] = await l.db.select({ id: assets.id }).from(assets).where(eq(assets.id, a.id));
  if (existing) {
    l.counters.skipped += 1;
    return true;
  }
  let stored: { originalKey: string | null; sizeBytes: number | null } = {
    originalKey: null,
    sizeBytes: null,
  };
  if (a.source === 'upload') {
    const copied = await copyUpload(l, a);
    if (!copied) return false;
    stored = copied;
  }
  await insertAsset(l, a, stored);
  return true;
}

/** Playlist et ses pistes encore présentes ; ignorée si elle existe déjà. */
async function loadPlaylist(l: LoadContext, p: ImportPlan['playlists'][number]): Promise<void> {
  await l.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(playlists)
      .values({ id: p.id, campaignId: p.campaignId, name: p.name })
      .onConflictDoNothing()
      .returning({ id: playlists.id });
    if (!row) {
      l.counters.skipped += 1;
      return;
    }
    const live = p.assetIds.length
      ? (await tx.select({ id: assets.id }).from(assets).where(inArray(assets.id, p.assetIds))).map(
          (r) => r.id,
        )
      : [];
    const ids = p.assetIds.filter((id) => live.includes(id));
    if (ids.length)
      await tx
        .insert(playlistItems)
        .values(ids.map((assetId, position) => ({ playlistId: p.id, assetId, position })));
    await tx
      .insert(legacyIds)
      .values({
        source: LEGACY_SOURCE,
        legacyId: p.legacy,
        targetType: 'playlist',
        targetId: p.id,
      })
      .onConflictDoNothing();
    l.counters.playlists += 1;
  });
}

/** Canal de musique en pause sur sa piste ; erreur si la piste n'a pas été importée. */
async function loadChannel(l: LoadContext, c: ImportPlan['channels'][number]): Promise<void> {
  const [asset] = await l.db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, c.assetId), eq(assets.campaignId, c.campaignId)));
  if (!asset) {
    l.counters.errors += 1;
    l.report({
      type: 'channel',
      legacy: c.legacy,
      status: 'error',
      detail: 'piste non importée',
    });
    return;
  }
  const [row] = await l.db
    .insert(channels)
    .values({
      campaignId: c.campaignId,
      channel: 'music',
      version: 1,
      status: 'paused',
      assetId: c.assetId,
      queue: [c.assetId],
      queueIndex: 0,
      repeat: 'all',
      positionMs: c.positionMs,
    })
    .onConflictDoNothing()
    .returning({ id: channels.campaignId });
  if (row) l.counters.channels += 1;
  else l.counters.skipped += 1;
}

export async function loadPlan(
  db: Db,
  plan: ImportPlan,
  o: {
    storage: AudioStorage | undefined;
    fetchFile?: (url: string) => Promise<Buffer>;
    report: (line: ReportLine) => void;
  },
): Promise<LoadCounters> {
  const counters: LoadCounters = {
    assets: 0,
    copied: 0,
    playlists: 0,
    channels: 0,
    skipped: 0,
    errors: 0,
  };
  const fetchFile =
    o.fetchFile ??
    (async (url: string) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    });
  const dir = await mkdtemp(join(tmpdir(), 'audio-import-'));
  const l: LoadContext = { db, storage: o.storage, fetchFile, report: o.report, counters, dir };
  try {
    for (const a of plan.assets.values()) {
      if (!(await loadAsset(l, a))) continue;
      for (const legacyId of a.legacy)
        await db
          .insert(legacyIds)
          .values({ source: LEGACY_SOURCE, legacyId, targetType: 'asset', targetId: a.id })
          .onConflictDoNothing();
    }
    for (const p of plan.playlists) await loadPlaylist(l, p);
    for (const c of plan.channels) await loadChannel(l, c);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return counters;
}
