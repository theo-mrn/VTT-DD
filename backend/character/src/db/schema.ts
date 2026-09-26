/**
 * Schéma Drizzle du service character : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/character/db) ; ce
 * fichier doit lui correspondre colonne pour colonne. Le schéma SQL s'appelle
 * « characters » (CHARACTER est un mot réservé).
 */
import type { EtatEntite } from '@vtt/rules';
import { integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const schemaCharacters = pgSchema('characters');

const horodatage = (nom: string) => timestamp(nom, { withTimezone: true, mode: 'date' });

export const characters = schemaCharacters.table('characters', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  nom: text('nom').notNull(),
  avatarUrl: text('avatar_url'),
  systemId: text('system_id').notNull(),
  systemVersion: text('system_version').notNull(),
  type: text('type').notNull(),
  etat: jsonb('etat').$type<EtatEntite>().notNull(),
  version: integer('version').notNull().default(1),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
  deletedAt: horodatage('deleted_at'),
});

/** Anciens identifiants Firebase → personnages (imports rejouables). */
export const legacyIds = schemaCharacters.table(
  'legacy_ids',
  {
    source: text('source').notNull(),
    legacyId: text('legacy_id').notNull(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.source, t.legacyId] })],
);

export const outbox = schemaCharacters.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  publishedAt: horodatage('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = schemaCharacters.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: horodatage('processed_at').notNull().defaultNow(),
});
