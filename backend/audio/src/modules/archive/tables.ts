/**
 * Tables d'audio dans l'archive d'une campagne (docs/export-campagne.md § 3), parents d'abord.
 * Sons prêts seulement (ni en cours d'analyse, ni refusés, ni supprimés). Hors liste : canaux
 * et déclenchements en cours (lecture du moment), préférences du mixeur (personnelles), tâches
 * du worker, identifiants hérités.
 */
import type { ArchiveTable } from '@vtt/platform';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { assets, playlistItems, playlists, soundboards } from '../../db/schema.js';

/** Dernière migration d'audio (`db/changes`), vérifiée par `tables.test.ts`. */
export const ARCHIVE_SCHEMA_VERSION = '0005';

export const audioArchiveTables: ArchiveTable[] = [
  {
    table: assets,
    scope: assets.campaignId,
    users: ['createdBy'],
    skip: ['deletedAt'],
    where: () => and(isNull(assets.deletedAt), eq(assets.status, 'ready')),
  },
  { table: playlists, scope: playlists.campaignId, users: ['createdBy'] },
  {
    // Table de liaison, sans colonne de campagne : ses deux identifiants doivent être dans
    // l'archive pour être réimportés
    table: playlistItems,
    where: (ctx) =>
      sql`${playlistItems.playlistId} in (select ${playlists.id} from ${playlists} where ${playlists.campaignId} = ${ctx.campaignId})`,
    orderBy: [playlistItems.playlistId, playlistItems.position],
  },
  { table: soundboards, scope: soundboards.campaignId, users: ['updatedBy'] },
];
