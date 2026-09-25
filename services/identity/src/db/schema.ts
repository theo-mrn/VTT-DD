/**
 * Schéma Drizzle du service identity : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (services/identity/db) ; ce
 * fichier doit lui correspondre colonne pour colonne (vérifié en CI).
 */
import {
  bigint,
  boolean,
  customType,
  inet,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
  integer,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const identity = pgSchema('identity');

const horodatage = (nom: string) => timestamp(nom, { withTimezone: true, mode: 'date' });

export const users = identity.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
  disabledAt: horodatage('disabled_at'),
});

export const profiles = identity.table('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  title: text('title'),
  bio: text('bio'),
  bannerUrl: text('banner_url'),
  borderType: text('border_type').notNull().default('none'),
  showPremiumBadge: boolean('show_premium_badge').notNull().default(true),
  timeSpentMinutes: bigint('time_spent_minutes', { mode: 'number' }).notNull().default(0),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});

export const credentials = identity.table('credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  algorithm: text('algorithm', { enum: ['argon2id', 'firebase-scrypt'] }).notNull(),
  hash: text('hash').notNull(),
  salt: text('salt'),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});

export const oauthAccounts = identity.table(
  'oauth_accounts',
  {
    provider: text('provider', { enum: ['google', 'discord'] }).notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    createdAt: horodatage('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const legacyIds = identity.table(
  'legacy_ids',
  {
    kind: text('kind').notNull(),
    legacyId: text('legacy_id').notNull(),
    id: uuid('id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.legacyId] })],
);

export const sessions = identity.table('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  familyId: uuid('family_id').notNull(),
  tokenHash: bytea('token_hash').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  expiresAt: horodatage('expires_at').notNull(),
  rotatedAt: horodatage('rotated_at'),
  revokedAt: horodatage('revoked_at'),
  userAgent: text('user_agent'),
  ip: inet('ip'),
});

export const outbox = identity.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  publishedAt: horodatage('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});
