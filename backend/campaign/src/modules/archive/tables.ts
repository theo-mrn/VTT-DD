/**
 * Tables de campaign dans l'archive d'une campagne (docs/export-campagne.md § 3), dans l'ordre
 * d'insertion (parents d'abord). Hors liste, jamais exportées : membres, invitations, bannis,
 * sessions, messages, combats, attaques, journaux et files d'automatismes, épingles et
 * rangements personnels, partages de documents, identifiants hérités, tables obsolètes.
 */
import type { ArchiveTable } from '@vtt/platform';
import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import {
  automationRules,
  automations,
  campaignCharacters,
  campaignHandouts,
  campaignMediaFolders,
  campaigns,
  campaignSettings,
  campaignStorageFiles,
  mapDrawings,
  mapExplorations,
  mapFogZones,
  mapGroups,
  mapLayers,
  mapLights,
  mapMeasurements,
  mapMusicZones,
  mapNotes,
  mapObjects,
  mapObstacles,
  mapPortals,
  mapRooms,
  maps,
  mapSettings,
  mapTokens,
  notes,
  tableStates,
} from '../../db/schema.js';

/**
 * Dernière migration de campaign (`db/changes`) : forme des lignes de l'archive. À monter avec
 * chaque migration (vérifié par `tables.test.ts`).
 */
export const ARCHIVE_SCHEMA_VERSION = '0040';

const byGm = (column: Parameters<typeof inArray>[0]) => (gmIds: ReadonlySet<string>) =>
  inArray(column, [...gmIds]);

export interface CampaignArchiveHooks {
  /** Campagne importée : code neuf, privée (le reste vient de l'archive). */
  campaignRow: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Note importée : HTML réassaini, champs de recherche recalculés. */
  noteRow: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Clé de fichier qui appartient à la nouvelle campagne ou à un de ses personnages. */
  ownsKey: (key: string, known: ReadonlySet<string>) => boolean;
}

export function campaignArchiveTables(hooks: CampaignArchiveHooks): ArchiveTable[] {
  return [
    {
      table: campaigns,
      scope: campaigns.id,
      users: ['ownerId'],
      importRow: hooks.campaignRow,
    },
    { table: campaignSettings, scope: campaignSettings.campaignId },
    { table: mapSettings, scope: mapSettings.campaignId },
    {
      // Personnages engagés, joueurs compris : ils deviennent ceux du MJ qui importe
      table: campaignCharacters,
      scope: campaignCharacters.campaignId,
      users: ['ownerId', 'addedBy'],
      importRow: (row) => ({ ...row, playedBy: null }),
    },
    {
      table: campaignMediaFolders,
      scope: campaignMediaFolders.campaignId,
      users: ['ownerId'],
      parent: 'parentId',
      where: (ctx) => byGm(campaignMediaFolders.ownerId)(ctx.gmIds),
    },
    {
      // Inventaire de la médiathèque : rangement et visibilité des fichiers envoyés par le MJ
      table: campaignStorageFiles,
      scope: campaignStorageFiles.campaignId,
      users: ['uploadedBy'],
      skip: ['usedBy', 'seenAt'],
      where: (ctx): SQL | undefined =>
        or(
          isNull(campaignStorageFiles.uploadedBy),
          inArray(campaignStorageFiles.uploadedBy, [...ctx.gmIds]),
        ),
      importRow: (row, ctx) =>
        typeof row.key === 'string' && hooks.ownsKey(row.key, ctx.known) ? row : null,
    },
    { table: mapGroups, scope: mapGroups.campaignId },
    { table: maps, scope: maps.campaignId },
    {
      table: mapLayers,
      scope: mapLayers.campaignId,
      // Une carte insérée reçoit ses calques par défaut (déclencheur maps_default_layers) :
      // ceux de l'archive les remplacent
      beforeInsert: async (tx, rows, ctx) => {
        const mapIds = [...new Set(rows.map((r) => r.mapId as string))];
        if (mapIds.length)
          await tx
            .delete(mapLayers)
            .where(and(eq(mapLayers.campaignId, ctx.campaignId), inArray(mapLayers.mapId, mapIds)));
      },
    },
    { table: mapObstacles, scope: mapObstacles.campaignId, skip: ['direction'] },
    { table: mapRooms, scope: mapRooms.campaignId },
    { table: mapObjects, scope: mapObjects.campaignId },
    { table: mapTokens, scope: mapTokens.campaignId, progress: true },
    // Après les jetons : une lumière peut suivre un jeton (coupée s'il n'est pas exporté)
    { table: mapLights, scope: mapLights.campaignId },
    {
      table: mapFogZones,
      scope: mapFogZones.campaignId,
      progress: true,
      users: ['createdBy'],
      orderBy: [mapFogZones.seq],
    },
    { table: mapExplorations, scope: mapExplorations.campaignId, progress: true },
    { table: mapDrawings, scope: mapDrawings.campaignId, users: ['createdBy'] },
    { table: mapNotes, scope: mapNotes.campaignId, users: ['createdBy'] },
    { table: mapMusicZones, scope: mapMusicZones.campaignId },
    { table: mapPortals, scope: mapPortals.campaignId },
    {
      table: mapMeasurements,
      scope: mapMeasurements.campaignId,
      progress: true,
      users: ['createdBy'],
    },
    {
      // Notes du MJ seulement : celles des joueurs leur appartiennent
      table: notes,
      scope: notes.campaignId,
      users: ['ownerUserId'],
      userLists: ['sharedWith'],
      where: (ctx) => byGm(notes.ownerUserId)(ctx.gmIds),
      importRow: hooks.noteRow,
    },
    { table: campaignHandouts, scope: campaignHandouts.campaignId, users: ['createdBy'] },
    { table: automationRules, scope: automationRules.campaignId, skip: ['lastRunAt'] },
    { table: automations, scope: automations.campaignId },
    { table: tableStates, scope: tableStates.campaignId, progress: true },
  ];
}
