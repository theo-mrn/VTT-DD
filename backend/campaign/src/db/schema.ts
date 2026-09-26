/**
 * Schéma Drizzle du service campaign : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/campaign/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const campaignSchema = pgSchema('campaign');

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ROLES = ['gm', 'player', 'spectator'] as const;
export type Role = (typeof ROLES)[number];

export const SIDES = ['players', 'enemies', 'allies'] as const;
export type Side = (typeof SIDES)[number];

export const COMBAT_MODES = ['individual', 'slots'] as const;
export type CombatMode = (typeof COMBAT_MODES)[number];

export const campaigns = campaignSchema.table('campaigns', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  systemId: text('system_id').notNull(),
  systemVersion: text('system_version').notNull(),
  ownerId: uuid('owner_id').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  /** Code court de la campagne (6 caractères), unique. */
  code: text('code').notNull().unique(),
  imageUrl: text('image_url'),
  /** Joueurs au plus, MJ non compris. */
  maxPlayers: integer('max_players').notNull().default(4),
  isPublic: boolean('is_public').notNull().default(false),
  characterCreation: boolean('character_creation').notNull().default(true),
});

export const campaignMembers = campaignSchema.table(
  'campaign_members',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role').$type<Role>().notNull(),
    joinedAt: timestampTz('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

export const campaignInvitations = campaignSchema.table('campaign_invitations', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  createdBy: uuid('created_by').notNull(),
  expiresAt: timestampTz('expires_at').notNull(),
  maxUses: integer('max_uses').notNull(),
  uses: integer('uses').notNull().default(0),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
});

export const campaignCharacters = campaignSchema.table(
  'campaign_characters',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').notNull(),
    ownerId: uuid('owner_id').notNull(),
    side: text('side').$type<Side>().notNull(),
    addedBy: uuid('added_by').notNull(),
    addedAt: timestampTz('added_at').notNull().defaultNow(),
    /** Membre qui incarne ce personnage (un seul par campagne et par membre). */
    playedBy: uuid('played_by'),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.characterId] }),
    unique('campaign_characters_played_by').on(t.campaignId, t.playedBy),
  ],
);

/** Utilisateurs bannis d'une campagne. */
export const campaignBans = campaignSchema.table(
  'campaign_bans',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    bannedBy: uuid('banned_by').notNull(),
    bannedAt: timestampTz('banned_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

/** Sessions de jeu prévues. */
export const campaignSessions = campaignSchema.table('campaign_sessions', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  scheduledAt: timestampTz('scheduled_at').notNull(),
  title: text('title'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
});

/** Messages de discussion (id UUIDv7 : ordre chronologique). */
export const campaignMessages = campaignSchema.table('campaign_messages', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
});

/** Anciens identifiants Firebase → campagnes (imports rejouables). */
export const legacyIds = campaignSchema.table(
  'legacy_ids',
  {
    source: text('source').notNull(),
    legacyId: text('legacy_id').notNull(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.source, t.legacyId] })],
);

export const campaignCombats = campaignSchema.table('campaign_combats', {
  campaignId: uuid('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  id: uuid('id').notNull().unique(),
  mode: text('mode').$type<CombatMode>().notNull(),
  round: integer('round').notNull().default(1),
  currentIndex: integer('current_index').notNull().default(0),
  slots: jsonb('slots').$type<Side[] | null>(),
  initiativeRolled: boolean('initiative_rolled').notNull().default(false),
  version: integer('version').notNull().default(1),
  startedBy: uuid('started_by').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const campaignCombatParticipants = campaignSchema.table(
  'campaign_combat_participants',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaignCombats.campaignId, { onDelete: 'cascade' }),
    characterId: uuid('character_id').notNull(),
    turnOrder: integer('turn_order').notNull(),
    side: text('side').$type<Side>().notNull(),
    sortKeys: jsonb('sort_keys').$type<number[]>().notNull().default([]),
    hasActed: boolean('has_acted').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.characterId] })],
);

export const outbox = campaignSchema.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  publishedAt: timestampTz('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = campaignSchema.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: timestampTz('processed_at').notNull().defaultNow(),
});
