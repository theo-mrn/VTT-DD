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
  /** Suppression demandée : purge 7 jours plus tard, annulée par une reconnexion. */
  deletionRequestedAt: horodatage('deletion_requested_at'),
  /** Dernière visite, au plus une mise à jour par jour (comptes inactifs). */
  lastSeenAt: horodatage('last_seen_at'),
  inactivityWarnedAt: horodatage('inactivity_warned_at'),
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
  /** Abonnement premium, posé par le service billing (route interne). */
  premium: boolean('premium').notNull().default(false),
  timeSpentMinutes: bigint('time_spent_minutes', { mode: 'number' }).notNull().default(0),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  /** Langue de l'interface choisie (`LOCALES` de @vtt/contracts) ; null : le navigateur décide. */
  locale: text('locale'),
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

/**
 * Lien du bot de dés Discord, distinct de la connexion (docs/discord.md) : user_id NULL = délié
 * par /unlink. Sans ligne, le bot suit le compte connecté avec Discord (oauth_accounts).
 */
export const discordBotLinks = identity.table('discord_bot_links', {
  discordUserId: text('discord_user_id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});

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

/** Événements du bus déjà traités, par consommateur (dédoublonnage « au moins une fois »). */
export const inbox = identity.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: horodatage('processed_at').notNull().defaultNow(),
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

/** Compteurs des titres à paliers (jets, critiques, messages), tenus par identity-titles. */
export const titleProgress = identity.table(
  'title_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    counter: text('counter').notNull(),
    value: bigint('value', { mode: 'number' }).notNull().default(0),
    updatedAt: horodatage('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.counter] })],
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

/** Dernière version des droits reçue de billing, par compte. */
export const billingRights = identity.table('billing_rights', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  version: bigint('version', { mode: 'number' }).notNull(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});

/** Disposition de la barre d'outils de la carte, par compte (docs/carte.md § 6). */
export const mapToolbarLayouts = identity.table('map_toolbar_layouts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  layout: jsonb('layout').$type<{ order: string[]; hidden: string[] }>().notNull(),
  version: bigint('version', { mode: 'number' }).notNull(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});

/** Raccourcis clavier de l'utilisateur (docs/raccourcis.md § 4). */
export const shortcutPreferences = identity.table('shortcut_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  preferences: jsonb('preferences')
    .$type<{ bindings: Record<string, string | null>; custom: unknown[] }>()
    .notNull(),
  version: bigint('version', { mode: 'number' }).notNull(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});
