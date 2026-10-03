/** Lignes `assets` → vues de l'API (PlaybackAsset pour tous, Asset pour le MJ). */
import type { Asset, PlaybackAsset } from '@vtt/contracts';
import type { AssetRow } from '../../db/schema.js';
import type { AudioStorage } from '../../storage/s3.js';

/** URL absolue servie : fichier traité sur notre stockage, ou entrée du catalogue. */
export function playbackUrlOf(row: AssetRow, storage: AudioStorage | undefined): string | null {
  if (row.source === 'youtube' || row.status !== 'ready') return null;
  if (row.playbackKey) return storage ? storage.publicUrl(row.playbackKey) : null;
  return row.playbackUrl;
}

export function toPlaybackAsset(row: AssetRow, storage: AudioStorage | undefined): PlaybackAsset {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    source: row.source,
    status: row.status,
    url: playbackUrlOf(row, storage),
    youtubeId: row.youtubeId,
    durationMs: row.durationMs,
    gainDb: row.gainDb,
    volume: row.volume,
    deleted: row.deletedAt !== null,
  };
}

export function toAsset(row: AssetRow, storage: AudioStorage | undefined): Asset {
  return {
    ...toPlaybackAsset(row, storage),
    sections: row.sections ?? [],
    catalogId: row.catalogId,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    loudnessLufs: row.loudnessLufs,
    rejectReason: row.rejectReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Champs suivis dans `changes` d'un asset_updated. */
export const trackedFields = (a: Asset) => ({
  name: a.name,
  kind: a.kind,
  sections: a.sections,
  volume: a.volume,
  durationMs: a.durationMs,
  status: a.status,
});
