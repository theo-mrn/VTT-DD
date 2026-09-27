/**
 * Schéma Drizzle du service character : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/character/db) ; ce
 * fichier doit lui correspondre colonne pour colonne. Le schéma SQL s'appelle
 * « characters » (CHARACTER est un mot réservé).
 */
import type { EtatEntite } from '@vtt/rules';
import {
  foreignKey,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const schemaCharacters = pgSchema('characters');

/** Présentation libre d'un personnage, écrite par son joueur (champs absents : vides). */
export interface CharacterDetails {
  concept?: string;
  appearance?: string;
  backstory?: string;
}

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
  details: jsonb('details').$type<CharacterDetails>().notNull().default({}),
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

/** Action d'un modèle de PNJ (legacy `Actions` : Nom, Description, Toucher). */
export interface NpcTemplateAction {
  name: string;
  description: string;
  toHit: number;
}

/** Catégories de la bibliothèque de PNJ du MJ, par campagne. */
export const npcTemplateCategories = schemaCharacters.table(
  'npc_template_categories',
  {
    id: uuid('id').primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    name: text('name').notNull(),
    color: text('color'),
    createdBy: uuid('created_by'),
    version: integer('version').notNull().default(1),
    createdAt: horodatage('created_at').notNull().defaultNow(),
    updatedAt: horodatage('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('npc_template_categories_campaign_id').on(t.campaignId, t.id)],
);

/** Modèles de PNJ : un EtatEntite du système de la campagne, instanciable en personnage. */
export const npcTemplates = schemaCharacters.table(
  'npc_templates',
  {
    id: uuid('id').primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    categoryId: uuid('category_id'),
    name: text('name').notNull(),
    imageUrl: text('image_url'),
    tokenUrl: text('token_url'),
    systemId: text('system_id').notNull(),
    systemVersion: text('system_version').notNull(),
    type: text('type').notNull(),
    etat: jsonb('etat').$type<EtatEntite>().notNull(),
    actions: jsonb('actions').$type<NpcTemplateAction[]>().notNull().default([]),
    createdBy: uuid('created_by'),
    version: integer('version').notNull().default(1),
    createdAt: horodatage('created_at').notNull().defaultNow(),
    updatedAt: horodatage('updated_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'npc_templates_category',
      columns: [t.campaignId, t.categoryId],
      foreignColumns: [npcTemplateCategories.campaignId, npcTemplateCategories.id],
    }).onDelete('set null'),
  ],
);

/** Modèles d'objets : décors à poser sur la carte (nom, image, catégorie). */
export const objectTemplates = schemaCharacters.table('object_templates', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  category: text('category'),
  createdBy: uuid('created_by'),
  version: integer('version').notNull().default(1),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});

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
