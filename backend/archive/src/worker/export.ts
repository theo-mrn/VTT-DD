/**
 * Export d'une campagne (docs/export-campagne.md § 5.2) : instantanés de campaign, character et
 * audio, adresses des fichiers remplacées par leurs clés, puis archive écrite en flux sur R2.
 */
import {
  ARCHIVE_FORMAT,
  fileOwner,
  rowIds,
  toFileRefs,
  type ArchiveManifest,
  type ArchiveOptions,
  type ArchiveRows,
  type ArchiveService,
} from '@vtt/contracts';
import type { ArchiveServices } from '../clients/services.js';
import type { ArchiveStore } from '../storage/store.js';
import { writeArchive, type ArchiveFileInput, type ArchiveTableInput } from '../zip/write.js';
import { ArchiveError } from '../zip/read.js';
import { safeContentType } from './files.js';

export interface Progress {
  (step: 'collect' | 'files' | 'write', progress: number): void;
}

export interface ExportResult {
  manifest: ArchiveManifest;
  size: number;
  name: string;
}

export async function exportCampaign(
  deps: { store: ArchiveStore; services: ArchiveServices; now: () => Date },
  campaignId: string,
  options: ArchiveOptions,
  key: string,
  progress: Progress,
): Promise<ExportResult> {
  const { store, services } = deps;
  progress('collect', 0);
  const campaign = await services.campaignSnapshot(campaignId, options);
  const [row] = campaign.tables.campaigns ?? [];
  if (!row) throw new ArchiveError('campaign_not_found', 'Campagne introuvable');
  progress('collect', 0.05);
  const character = await services.snapshot('character', campaignId, options, campaign.gmIds);
  const audio = await services.snapshot('audio', campaignId, options, campaign.gmIds);
  progress('collect', 0.1);

  // Fichiers de la campagne et de ses personnages ; les autres restent des adresses
  const owners = new Set([campaignId, ...rowIds([character.tables.characters ?? []])]);
  const accept = (key: string) => {
    const owner = fileOwner(key);
    return !!owner && owners.has(owner.ownerId.toLowerCase());
  };
  const snapshots: [ArchiveService, typeof campaign | typeof character][] = [
    ['campaign', campaign],
    ['character', character],
    ['audio', audio],
  ];
  const keys = new Set<string>();
  const tables: ArchiveTableInput[] = [];
  for (const [service, snap] of snapshots) {
    const { value, keys: found } = toFileRefs(snap.tables, store.publicBase, accept);
    found.forEach((k) => keys.add(k));
    snap.files.filter(accept).forEach((k) => keys.add(k));
    for (const [table, rows] of Object.entries(value as Record<string, ArchiveRows>))
      tables.push({ service, table, rows });
  }

  progress('files', 0);
  const files: ArchiveFileInput[] = [];
  let i = 0;
  for (const key of [...keys].sort()) {
    const head = await store.head(key);
    progress('files', ++i / keys.size);
    // Fichier disparu ou d'un type qu'on ne reprendrait pas : il ne part pas
    const contentType = head && safeContentType(key, head.contentType);
    if (!head || !contentType) continue;
    files.push({ key, size: head.size, contentType, open: () => store.read(key) });
  }

  const name = String(row.name ?? 'Campagne');
  const { manifest, size } = await writeArchive(
    store,
    key,
    {
      head: {
        format: ARCHIVE_FORMAT,
        kind: 'campaign',
        exportedAt: deps.now().toISOString(),
        campaign: {
          id: campaignId,
          name: name.slice(0, 200),
          systemId: String(row.systemId),
          systemVersion: String(row.systemVersion),
        },
        options,
      },
      schemaVersions: {
        campaign: campaign.schemaVersion,
        character: character.schemaVersion,
        audio: audio.schemaVersion,
      },
      tables,
      files,
    },
    (p) => progress('write', p),
  );
  return { manifest, size, name };
}
