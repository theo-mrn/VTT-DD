/**
 * Schéma Drizzle du service library : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/library/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const librarySchema = pgSchema('library');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** tsvector : généré par la base, jamais écrit. */
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const backgrounds = librarySchema.table('backgrounds', {
  id: uuid('id').primaryKey(),
  source: text('source').notNull(),
  sourceKey: text('source_key').notNull(),
  kind: text('kind', { enum: ['map', 'illustration'] })
    .notNull()
    .default('map'),
  collection: text('collection'),
  titleFr: text('title_fr').notNull(),
  titleEn: text('title_en').notNull(),
  descriptionFr: text('description_fr').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  keywordsFr: text('keywords_fr')
    .array()
    .notNull()
    .default(sql`'{}'`),
  keywordsEn: text('keywords_en')
    .array()
    .notNull()
    .default(sql`'{}'`),
  place: text('place'),
  setting: text('setting'),
  timeOfDay: text('time_of_day'),
  moods: text('moods')
    .array()
    .notNull()
    .default(sql`'{}'`),
  animated: boolean('animated').notNull().default(false),
  searchHeadFr: text('search_head_fr').notNull().default(''),
  searchBodyFr: text('search_body_fr').notNull().default(''),
  searchHeadEn: text('search_head_en').notNull().default(''),
  searchBodyEn: text('search_body_en').notNull().default(''),
  searchFr: tsvector('search_fr').generatedAlwaysAs(
    sql`setweight(to_tsvector('french', search_head_fr) || to_tsvector('simple', search_head_fr), 'A') || setweight(to_tsvector('french', search_body_fr) || to_tsvector('simple', search_body_fr), 'C')`,
  ),
  searchEn: tsvector('search_en').generatedAlwaysAs(
    sql`setweight(to_tsvector('english', search_head_en) || to_tsvector('simple', search_head_en), 'A') || setweight(to_tsvector('english', search_body_en) || to_tsvector('simple', search_body_en), 'C')`,
  ),
  describedBy: text('described_by'),
  describedAt: timestampTz('described_at'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const backgroundVariants = librarySchema.table('background_variants', {
  id: uuid('id').primaryKey(),
  backgroundId: uuid('background_id')
    .notNull()
    .references(() => backgrounds.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  url: text('url').notNull(),
  thumbUrl: text('thumb_url'),
  previewUrl: text('preview_url'),
  originalKey: text('original_key'),
  kind: text('kind', { enum: ['image', 'video'] }).notNull(),
  grid: boolean('grid').notNull().default(false),
  width: integer('width'),
  height: integer('height'),
  bytes: bigint('bytes', { mode: 'number' }),
});

export type BackgroundRow = typeof backgrounds.$inferSelect;
export type VariantRow = typeof backgroundVariants.$inferSelect;
