/**
 * Schéma Drizzle du service audio : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/audio/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const audioSchema = pgSchema('audio');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ASSET_KINDS = ['music', 'ambience', 'sfx'] as const;
export const ASSET_SOURCES = ['upload', 'catalog', 'youtube'] as const;
export const ASSET_STATUSES = ['processing', 'ready', 'rejected'] as const;
export const CHANNELS = ['music', 'ambience'] as const;
export const CHANNEL_STATUSES = ['stopped', 'playing', 'paused'] as const;
export const REPEAT_MODES = ['off', 'track', 'all'] as const;
export const JOB_KINDS = ['analyze', 'purge'] as const;
export const JOB_STATUSES = ['pending', 'running', 'done', 'failed'] as const;

export const assets = audioSchema.table('assets', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  kind: text('kind', { enum: ASSET_KINDS }).notNull(),
  name: text('name').notNull(),
  source: text('source', { enum: ASSET_SOURCES }).notNull(),
  status: text('status', { enum: ASSET_STATUSES }).notNull(),
  catalogId: text('catalog_id'),
  originalKey: text('original_key'),
  youtubeId: text('youtube_id'),
  /** Clé S3 du fichier servi (envois) ; l'URL publique en est déduite. */
  playbackKey: text('playback_key'),
  /** URL absolue servie telle quelle (catalogue). */
  playbackUrl: text('playback_url'),
  mimeType: text('mime_type'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  codec: text('codec'),
  sampleRate: integer('sample_rate'),
  channels: smallint('channels'),
  bitrate: integer('bitrate'),
  durationMs: integer('duration_ms'),
  loudnessLufs: real('loudness_lufs'),
  truePeakDbtp: real('true_peak_dbtp'),
  gainDb: real('gain_db').notNull().default(0),
  volume: real('volume').notNull().default(1),
  rejectReason: text('reject_reason'),
  createdBy: uuid('created_by'),
  version: integer('version').notNull().default(1),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  deletedAt: timestampTz('deleted_at'),
});
export type AssetRow = typeof assets.$inferSelect;

export const playlists = audioSchema.table('playlists', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  name: text('name').notNull(),
  createdBy: uuid('created_by'),
  version: integer('version').notNull().default(1),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type PlaylistRow = typeof playlists.$inferSelect;

export const playlistItems = audioSchema.table(
  'playlist_items',
  {
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.playlistId, t.assetId] })],
);

export const legacyIds = audioSchema.table(
  'legacy_ids',
  {
    source: text('source').notNull(),
    legacyId: text('legacy_id').notNull(),
    targetType: text('target_type', { enum: ['asset', 'playlist', 'channel'] }).notNull(),
    targetId: uuid('target_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.legacyId] })],
);

export const channels = audioSchema.table(
  'channels',
  {
    campaignId: uuid('campaign_id').notNull(),
    channel: text('channel', { enum: CHANNELS }).notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    status: text('status', { enum: CHANNEL_STATUSES }).notNull().default('stopped'),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    playlistId: uuid('playlist_id').references(() => playlists.id, { onDelete: 'set null' }),
    queue: uuid('queue').array().notNull().default([]),
    queueIndex: integer('queue_index'),
    repeat: text('repeat', { enum: REPEAT_MODES }).notNull().default('all'),
    shuffle: boolean('shuffle').notNull().default(false),
    positionMs: bigint('position_ms', { mode: 'number' }).notNull().default(0),
    anchorAt: timestampTz('anchor_at').notNull().defaultNow(),
    endsAt: timestampTz('ends_at'),
    volume: real('volume').notNull().default(1),
    crossfadeMs: integer('crossfade_ms').notNull().default(1500),
    updatedBy: uuid('updated_by'),
    updatedAt: timestampTz('updated_at').notNull().defaultNow(),
    deletedAt: timestampTz('deleted_at'),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.channel] })],
);
export type ChannelRow = typeof channels.$inferSelect;

export const cues = audioSchema.table('cues', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  volume: real('volume').notNull().default(1),
  startedBy: uuid('started_by').notNull(),
  startAt: timestampTz('start_at').notNull(),
  stoppedAt: timestampTz('stopped_at'),
});

export const mixerPreferences = audioSchema.table('mixer_preferences', {
  userId: uuid('user_id').primaryKey(),
  volumes: jsonb('volumes').$type<Record<string, number>>().notNull(),
  muted: jsonb('muted').$type<Record<string, boolean>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const jobs = audioSchema.table('jobs', {
  id: uuid('id').primaryKey(),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: JOB_KINDS }).notNull(),
  status: text('status', { enum: JOB_STATUSES }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  runAfter: timestampTz('run_after').notNull().defaultNow(),
  lockedUntil: timestampTz('locked_until'),
  lastError: text('last_error'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type JobRow = typeof jobs.$inferSelect;

export const outbox = audioSchema.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  publishedAt: timestampTz('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = audioSchema.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});
