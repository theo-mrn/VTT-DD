/**
 * Schéma Drizzle du service identity : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/identity/db) ; ce
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
  emailNotifications: boolean('email_notifications').notNull().default(true),
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

export const emailTokens = identity.table('email_tokens', {
  tokenHash: bytea('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose', { enum: ['password_reset', 'email_verification'] }).notNull(),
  email: text('email').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  expiresAt: horodatage('expires_at').notNull(),
  usedAt: horodatage('used_at'),
});

export const titles = identity.table('titles', {
  slug: text('slug').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  condition: jsonb('condition').$type<
    { type: 'time'; minutes: number } | Record<string, unknown> | null
  >(),
  defaultUnlocked: boolean('default_unlocked').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const userTitles = identity.table(
  'user_titles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug')
      .notNull()
      .references(() => titles.slug, { onDelete: 'cascade' }),
    unlockedAt: horodatage('unlocked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slug] })],
);

export const friendRequests = identity.table(
  'friend_requests',
  {
    fromUser: uuid('from_user')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUser: uuid('to_user')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: horodatage('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fromUser, t.toUser] })],
);

/** Paire ordonnée : user_a < user_b (contrainte SQL). */
export const friendships = identity.table(
  'friendships',
  {
    userA: uuid('user_a')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userB: uuid('user_b')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: horodatage('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userA, t.userB] })],
);

export const apiKeys = identity.table('api_keys', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: bytea('key_hash').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  lastUsedAt: horodatage('last_used_at'),
  revokedAt: horodatage('revoked_at'),
});
