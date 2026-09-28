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
import { LEGACY_SOURCE, type ImportPlan, type ReportLine } from './transform.js';

export interface LoadCounters {
  assets: number;
  copied: number;
  playlists: number;
  channels: number;
  skipped: number;
  errors: number;
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
  try {
    for (const a of plan.assets.values()) {
      const [existing] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, a.id));
      if (existing) {
        counters.skipped += 1;
      } else {
        let originalKey: string | null = null;
        let sizeBytes: number | null = null;
        if (a.source === 'upload') {
          if (!o.storage) {
            counters.errors += 1;
            o.report({
              type: 'asset',
              legacy: a.legacy[0]!,
              status: 'error',
              detail: 'stockage S3 non configuré',
            });
            continue;
          }
          try {
            const body = await fetchFile(a.copyFrom!);
            const file = join(dir, a.id);
            await writeFile(file, body);
            originalKey = incomingKey(a.campaignId, a.id);
            await o.storage.upload(originalKey, file, 'application/octet-stream');
            sizeBytes = body.length;
            counters.copied += 1;
          } catch (e) {
            counters.errors += 1;
            o.report({
              type: 'asset',
              legacy: a.legacy[0]!,
              status: 'error',
              detail: `copie impossible : ${(e as Error).message}`,
            });
            continue;
          }
        }
        await db.transaction(async (tx) => {
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
              originalKey,
              sizeBytes,
              createdBy: null,
            })
            .onConflictDoNothing()
            .returning({ id: assets.id });
          if (row && a.source !== 'youtube')
            await tx.insert(jobs).values({ id: uuidv7(), assetId: a.id, kind: 'analyze' });
          if (row) counters.assets += 1;
        });
      }
      for (const legacyId of a.legacy)
        await db
          .insert(legacyIds)
          .values({ source: LEGACY_SOURCE, legacyId, targetType: 'asset', targetId: a.id })
          .onConflictDoNothing();
    }

    for (const p of plan.playlists) {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(playlists)
          .values({ id: p.id, campaignId: p.campaignId, name: p.name })
          .onConflictDoNothing()
          .returning({ id: playlists.id });
        if (!row) {
          counters.skipped += 1;
          return;
        }
        const live = p.assetIds.length
          ? (
              await tx.select({ id: assets.id }).from(assets).where(inArray(assets.id, p.assetIds))
            ).map((r) => r.id)
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
        counters.playlists += 1;
      });
    }

    for (const c of plan.channels) {
      const [asset] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.id, c.assetId), eq(assets.campaignId, c.campaignId)));
      if (!asset) {
        counters.errors += 1;
        o.report({
          type: 'channel',
          legacy: c.legacy,
          status: 'error',
          detail: 'piste non importée',
        });
        continue;
      }
      const [row] = await db
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
      if (row) counters.channels += 1;
      else counters.skipped += 1;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return counters;
}
