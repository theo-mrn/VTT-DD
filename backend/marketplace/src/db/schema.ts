/**
 * Schéma Drizzle du service marketplace : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/marketplace/db) ; ce
 * fichier doit lui correspondre colonne pour colonne (la colonne générée `search`
 * des fiches n'est lue que par des requêtes SQL).
 */
import type { PackCounts } from '@vtt/contracts';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const marketplaceSchema = pgSchema('marketplace');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const LISTING_STATUSES = ['draft', 'published', 'unlisted', 'removed'] as const;
export const VERSION_STATUSES = ['draft', 'in_review', 'published', 'rejected'] as const;
export const ACQUISITION_SOURCES = ['free', 'purchase', 'gift'] as const;
export const REVOKE_REASONS = ['refund', 'dispute'] as const;
export const INSTALL_STATUSES = ['started', 'done'] as const;
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;

export const creators = marketplaceSchema.table('creators', {
  userId: uuid('user_id').primaryKey(),
  slug: text('slug').notNull(),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  payoutsReady: boolean('payouts_ready').notNull().default(false),
  payoutsVersion: bigint('payouts_version', { mode: 'number' }).notNull().default(0),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
});
export type CreatorRow = typeof creators.$inferSelect;

export const listings = marketplaceSchema.table('listings', {
  id: uuid('id').primaryKey(),
  creatorId: uuid('creator_id').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  description: text('description').notNull().default(''),
  systemId: text('system_id'),
  license: text('license').notNull().default('personal'),
  attribution: text('attribution').notNull().default(''),
  priceCents: integer('price_cents').notNull().default(0),
  currency: text('currency').notNull().default('eur'),
  tags: text('tags').array().notNull().default([]),
  contentWarnings: text('content_warnings').array().notNull().default([]),
  coverUrl: text('cover_url'),
  gallery: text('gallery').array().notNull().default([]),
  status: text('status', { enum: LISTING_STATUSES }).notNull().default('draft'),
  kinds: text('kinds').array().notNull().default([]),
  currentVersionId: uuid('current_version_id'),
  acquisitionsCount: integer('acquisitions_count').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  ratingSum: integer('rating_sum').notNull().default(0),
  searchText: text('search_text').notNull().default(''),
  needsRecheck: boolean('needs_recheck').notNull().default(false),
  removedReason: text('removed_reason'),
  removedAt: timestampTz('removed_at'),
  publishedAt: timestampTz('published_at'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
});
export type ListingRow = typeof listings.$inferSelect;

export const listingVersions = marketplaceSchema.table('listing_versions', {
  id: uuid('id').primaryKey(),
  listingId: uuid('listing_id').notNull(),
  number: text('number').notNull(),
  notes: text('notes').notNull().default(''),
  status: text('status', { enum: VERSION_STATUSES }).notNull().default('draft'),
  contentKey: text('content_key'),
  contentSha256: text('content_sha256'),
  contentBytes: integer('content_bytes'),
  counts: jsonb('counts').$type<PackCounts>(),
  systemId: text('system_id'),
  rightsAttestedAt: timestampTz('rights_attested_at'),
  submittedAt: timestampTz('submitted_at'),
  reviewedAt: timestampTz('reviewed_at'),
  reviewedBy: uuid('reviewed_by'),
  reviewReason: text('review_reason'),
  reviewNote: text('review_note'),
  publishedAt: timestampTz('published_at'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
export type VersionRow = typeof listingVersions.$inferSelect;

export const listingAssets = marketplaceSchema.table(
  'listing_assets',
  {
    listingId: uuid('listing_id').notNull(),
    sourceKey: text('source_key').notNull(),
    key: text('key').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    contentType: text('content_type').notNull(),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.sourceKey] })],
);

export const acquisitions = marketplaceSchema.table(
  'acquisitions',
  {
    userId: uuid('user_id').notNull(),
    listingId: uuid('listing_id').notNull(),
    source: text('source', { enum: ACQUISITION_SOURCES }).notNull(),
    saleId: uuid('sale_id'),
    acquiredAt: timestampTz('acquired_at').notNull().defaultNow(),
    revokedAt: timestampTz('revoked_at'),
    revokeReason: text('revoke_reason', { enum: REVOKE_REASONS }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);
export type AcquisitionRow = typeof acquisitions.$inferSelect;

export const installs = marketplaceSchema.table('installs', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  listingId: uuid('listing_id').notNull(),
  versionId: uuid('version_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  status: text('status', { enum: INSTALL_STATUSES }).notNull().default('started'),
  created: jsonb('created').$type<Record<string, number>>(),
  startedAt: timestampTz('started_at').notNull().defaultNow(),
  completedAt: timestampTz('completed_at'),
});
export type InstallRow = typeof installs.$inferSelect;

export const reviews = marketplaceSchema.table(
  'reviews',
  {
    listingId: uuid('listing_id').notNull(),
    userId: uuid('user_id').notNull(),
    rating: smallint('rating').notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
    updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.userId] })],
);
export type ReviewRow = typeof reviews.$inferSelect;

export const reports = marketplaceSchema.table('reports', {
  id: uuid('id').primaryKey(),
  listingId: uuid('listing_id').notNull(),
  reporterId: uuid('reporter_id'),
  reason: text('reason').notNull(),
  details: text('details').notNull().default(''),
  status: text('status', { enum: REPORT_STATUSES }).notNull().default('open'),
  outcome: text('outcome'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  resolvedAt: timestampTz('resolved_at'),
  resolvedBy: uuid('resolved_by'),
});
export type ReportRow = typeof reports.$inferSelect;

export const outbox = marketplaceSchema.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  publishedAt: timestampTz('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = marketplaceSchema.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});
