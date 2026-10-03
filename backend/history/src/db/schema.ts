/**
 * Schéma Drizzle du service history : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/history/db) ; ce
 * fichier doit lui correspondre colonne pour colonne. Les partitions
 * mensuelles de `events` sont invisibles ici : on passe toujours par `events`.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const historySchema = pgSchema('history');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** bytea : Buffer côté Node (driver pg). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const ACTOR_ROLES = ['gm', 'player', 'user', 'system'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const VISIBILITIES = ['public', 'gm_only', 'owner'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/**
 * Valeur envoyée à l'insertion : le trigger `events_hash` la remplace toujours
 * par sha256(prev_hash || JSON canonique). Le service ne choisit jamais le hash.
 */
export const HASH_PLACEHOLDER = Buffer.alloc(32);

export const events = historySchema.table(
  'events',
  {
    id: uuid('id').notNull(),
    occurredAt: timestampTz('occurred_at').notNull(),
    recordedAt: timestampTz('recorded_at')
      .notNull()
      .default(sql`clock_timestamp()`),
    campaignId: uuid('campaign_id'),
    seq: bigint('seq', { mode: 'number' }),
    type: text('type').notNull(),
    version: integer('version').notNull(),
    actorId: uuid('actor_id'),
    actorRole: text('actor_role', { enum: ACTOR_ROLES }).notNull(),
    actorCharacterId: uuid('actor_character_id'),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    /** Colonne générée : agrégat personnage, sinon personnage incarné par l'auteur. */
    characterId: uuid('character_id').generatedAlwaysAs(
      sql`CASE WHEN aggregate_type = 'character' AND aggregate_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN aggregate_id::uuid ELSE actor_character_id END`,
    ),
    visibility: text('visibility', { enum: VISIBILITIES }).notNull().default('public'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    correlationId: text('correlation_id').notNull(),
    causationId: text('causation_id'),
    traceparent: text('traceparent'),
    prevHash: bytea('prev_hash'),
    hash: bytea('hash')
      .notNull()
      .$defaultFn(() => HASH_PLACEHOLDER),
  },
  (t) => [primaryKey({ columns: [t.id, t.occurredAt] })],
);
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;

export const campaignHeads = historySchema.table('campaign_heads', {
  campaignId: uuid('campaign_id').primaryKey(),
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull(),
  lastHash: bytea('last_hash'),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const inbox = historySchema.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  /** `history` (bus) ou `import` (ancien Historique). */
  consumer: text('consumer').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});
