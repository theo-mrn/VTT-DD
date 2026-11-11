/**
 * Tables de character dans l'archive d'une campagne (docs/export-campagne.md § 3), parents
 * d'abord. Personnages des joueurs compris : à l'import, ils deviennent des PNJ de qui importe
 * (décision du 2026-11-11). Hors liste : personnages supprimés, journal des applications du
 * combat, identifiants hérités.
 */
import type { ArchiveTable } from '@vtt/platform';
import { isNull } from 'drizzle-orm';
import {
  characters,
  npcTemplateCategories,
  npcTemplates,
  objectTemplates,
} from '../../db/schema.js';

/** Dernière migration de character (`db/changes`), vérifiée par `tables.test.ts`. */
export const ARCHIVE_SCHEMA_VERSION = '0014';

export const characterArchiveTables: ArchiveTable[] = [
  {
    table: npcTemplateCategories,
    scope: npcTemplateCategories.campaignId,
    users: ['createdBy'],
  },
  { table: npcTemplates, scope: npcTemplates.campaignId, users: ['createdBy'] },
  { table: objectTemplates, scope: objectTemplates.campaignId, users: ['createdBy'] },
  {
    table: characters,
    scope: characters.campaignId,
    users: ['ownerId'],
    skip: ['pendingRoll', 'deletedAt'],
    where: () => isNull(characters.deletedAt),
    // Personnage d'un joueur : un PNJ dans l'archive du MJ
    exportRow: (row, ctx) => (ctx.gmIds.has(String(row.ownerId)) ? row : { ...row, kind: 'npc' }),
  },
];
