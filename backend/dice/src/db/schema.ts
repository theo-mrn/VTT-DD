/**
 * Schéma Drizzle du service dice : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/dice/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const diceSchema = pgSchema('dice');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const SOURCES = ['free', 'action', 'api', 'import'] as const;
export type Source = (typeof SOURCES)[number];

export const VISIBILITIES = ['public', 'private', 'gm', 'self'] as const;
export type RollVisibility = (typeof VISIBILITIES)[number];

export const INVENTORY_SOURCES = ['import', 'purchase', 'challenge', 'gift'] as const;
export type InventorySource = (typeof INVENTORY_SOURCES)[number];

/** Un dé numérique lancé : valeur, gardé ou écarté (`4d6k3`), relancé par explosion (`1d20!`). */
export interface DieValue {
  value: number;
  kept: boolean;
  exploded: boolean;
}

/** Un groupe de dés d'une même notation (`2d6`) : faces et valeurs tirées. */
export interface DiceGroup {
  faces: number;
  values: DieValue[];
}

/** Dés à symboles (Star Wars…) : chaque dé, les totaux par symbole et les résultats du système. */
export interface SymbolsResult {
  dice: { die: string; face: number; symbols: Record<string, number> }[];
  totals: Record<string, number>;
  results: Record<string, number>;
}

/** Issue du jet : `success` null quand il n'y a pas de seuil (jet libre). */
export interface Outcome {
  success: boolean | null;
  critical: boolean;
  fumble: boolean;
}

export const rolls = diceSchema.table('rolls', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id'),
  authorId: uuid('author_id'),
  authorName: text('author_name').notNull(),
  authorAvatarUrl: text('author_avatar_url'),
  characterId: uuid('character_id'),
  source: text('source', { enum: SOURCES }).notNull(),
  actionId: text('action_id'),
  label: text('label'),
  notation: text('notation'),
  systemId: text('system_id'),
  visibility: text('visibility', { enum: VISIBILITIES }).notNull().default('public'),
  dice: jsonb('dice').$type<DiceGroup[]>().notNull().default([]),
  symbols: jsonb('symbols').$type<SymbolsResult>(),
  diceCount: integer('dice_count').notNull().default(0),
  diceFaces: integer('dice_faces').notNull().default(0),
  total: doublePrecision('total'),
  output: text('output').notNull().default(''),
  symbolResult: text('symbol_result'),
  legacyType: text('legacy_type'),
  outcome: jsonb('outcome').$type<Outcome>().notNull(),
  explanations: jsonb('explanations').$type<string[]>().notNull().default([]),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
});
export type RollRow = typeof rolls.$inferSelect;

export const legacyIds = diceSchema.table(
  'legacy_ids',
  {
    source: text('source').notNull(),
    legacyId: text('legacy_id').notNull(),
    rollId: uuid('roll_id')
      .notNull()
      .references(() => rolls.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.source, t.legacyId] })],
);

export const preferences = diceSchema.table('preferences', {
  userId: uuid('user_id').primaryKey(),
  skinId: text('skin_id').notNull(),
  animation3d: boolean('animation_3d').notNull().default(true),
  sound: boolean('sound').notNull().default(true),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const inventory = diceSchema.table(
  'inventory',
  {
    userId: uuid('user_id').notNull(),
    skinId: text('skin_id').notNull(),
    source: text('source', { enum: INVENTORY_SOURCES }).notNull(),
    acquiredAt: timestampTz('acquired_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skinId] })],
);

export const outbox = diceSchema.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  publishedAt: timestampTz('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = diceSchema.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});
