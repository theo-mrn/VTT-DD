/**
 * Import d'une archive en nouvelle campagne (docs/export-campagne.md § 5.3) : archive validée,
 * identifiants renouvelés partout, fichiers recopiés sous leurs nouvelles clés, puis tables
 * importées service par service. Tout ou rien : un échec retire la campagne et les fichiers.
 */
import {
  ARCHIVE_ERRORS,
  ARCHIVE_SERVICES,
  DEFAULT_CAMPAIGN_STORAGE_QUOTA,
  STORAGE_ERRORS,
  fileOwner,
  fromFileRefs,
  remapIds,
  rowIds,
  uuidv7,
  type ArchiveOptions,
  type ArchiveRows,
  type ArchiveService,
} from '@vtt/contracts';
import type { ArchiveServices } from '../clients/services.js';
import type { ArchiveStore } from '../storage/store.js';
import { ArchiveError, openArchive } from '../zip/read.js';
import { safeContentType } from './files.js';

export interface ImportProgress {
  (step: 'read' | 'files' | 'create', progress: number): void;
}

export interface ImportResult {
  campaignId: string;
  name: string;
}

export async function importArchive(
  deps: { store: ArchiveStore; services: ArchiveServices },
  key: string,
  ownerId: string,
  progress: ImportProgress,
  /** Options de la duplication ; sinon celles de l'archive. */
  override?: { options?: ArchiveOptions; name?: (name: string) => string },
): Promise<ImportResult> {
  const { store, services } = deps;
  progress('read', 0);
  const archive = await openArchive(store, key);
  try {
    const { manifest } = archive;
    const options = override?.options ?? manifest.options;
    const tables = {} as Record<ArchiveService, Record<string, ArchiveRows>>;
    for (const service of ARCHIVE_SERVICES) {
      tables[service] = {};
      for (const table of Object.keys(manifest.services[service]?.tables ?? {}))
        tables[service][table] = await archive.rows(service, table);
    }
    if ((tables.campaign.campaigns ?? []).length !== 1)
      throw new ArchiveError(ARCHIVE_ERRORS.invalid, 'Campagne absente de l’archive');
    progress('read', 1);

    // Nouveaux identifiants pour chaque ligne, campagne comprise
    const ids = new Map<string, string>();
    for (const id of [
      manifest.campaign.id.toLowerCase(),
      ...rowIds(ARCHIVE_SERVICES.flatMap((s) => Object.values(tables[s]))),
    ])
      ids.set(id, uuidv7());
    const campaignId = ids.get(manifest.campaign.id.toLowerCase())!;
    for (const service of ARCHIVE_SERVICES) tables[service] = remapIds(tables[service], ids);
    const campaignRow = tables.campaign.campaigns![0]!;
    if (campaignRow.id !== campaignId)
      throw new ArchiveError(ARCHIVE_ERRORS.invalid, 'Campagne de l’archive incohérente');
    const name = override?.name
      ? override.name(String(campaignRow.name ?? ''))
      : String(campaignRow.name ?? '');
    campaignRow.name = name;

    // Fichiers : seulement sous la nouvelle campagne ou ses nouveaux personnages, types sûrs
    const owners = new Set([campaignId, ...rowIds([tables.character.characters ?? []])]);
    const files = manifest.files.flatMap((f) => {
      const newKey = remapIds(f.key, ids);
      const owner = fileOwner(newKey);
      const contentType = safeContentType(newKey, f.contentType);
      return owner && owners.has(owner.ownerId) && contentType ? [{ f, newKey, contentType }] : [];
    });
    const bytes = files.reduce((n, x) => n + x.f.size, 0);
    if (bytes > DEFAULT_CAMPAIGN_STORAGE_QUOTA)
      throw new ArchiveError(STORAGE_ERRORS.quotaExceeded, 'Fichiers au-delà du quota');

    const written: string[] = [];
    let created = false;
    try {
      progress('files', 0);
      let done = 0;
      for (const { f, newKey, contentType } of files) {
        await store.write(newKey, await archive.file(f), contentType);
        written.push(newKey);
        done += f.size;
        progress('files', bytes ? done / bytes : 1);
      }

      progress('create', 0);
      const all = ARCHIVE_SERVICES.map((s) => fromFileRefs(tables[s], store.publicBase));
      for (const [i, service] of ARCHIVE_SERVICES.entries()) {
        const foreignIds = [
          ...rowIds(all.filter((_, j) => j !== i).flatMap((t) => Object.values(t))),
        ];
        await services.importInto(service, campaignId, {
          schemaVersion: manifest.services[service]?.schemaVersion ?? '0',
          tables: all[i]!,
          ownerId,
          options,
          foreignIds,
        });
        if (service === 'campaign') created = true;
        progress('create', (i + 1) / ARCHIVE_SERVICES.length);
      }
      return { campaignId, name };
    } catch (error) {
      if (created) await services.removeCampaign(campaignId, ownerId).catch(() => {});
      await store.remove(written).catch(() => {});
      throw error;
    }
  } finally {
    archive.close();
  }
}
