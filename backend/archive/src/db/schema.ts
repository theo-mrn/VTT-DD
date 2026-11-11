/** Schéma « archive » (db/changes), lu et écrit avec le rôle archive_svc. */
import type { ArchiveJobKind, ArchiveJobStatus, ArchiveJobStep } from '@vtt/contracts';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgSchema,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const archiveSchema = pgSchema('archive');
const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const jobs = archiveSchema.table('jobs', {
  id: uuid('id').primaryKey(),
  kind: text('kind').$type<ArchiveJobKind>().notNull(),
  userId: uuid('user_id').notNull(),
  sourceCampaignId: uuid('source_campaign_id'),
  campaignId: uuid('campaign_id'),
  campaignName: text('campaign_name'),
  keepProgress: boolean('keep_progress').notNull(),
  status: text('status').$type<ArchiveJobStatus>().notNull(),
  step: text('step').$type<ArchiveJobStep>(),
  progress: real('progress').notNull().default(0),
  objectKey: text('object_key'),
  size: bigint('size', { mode: 'number' }),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  runAfter: timestampTz('run_after').notNull().defaultNow(),
  lockedUntil: timestampTz('locked_until'),
  expiresAt: timestampTz('expires_at'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type JobRow = typeof jobs.$inferSelect;

export const outbox = archiveSchema.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  publishedAt: timestampTz('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = archiveSchema.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});
