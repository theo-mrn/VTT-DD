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

export const schemaCampaign = pgSchema('campaign');

const horodatage = (nom: string) => timestamp(nom, { withTimezone: true, mode: 'date' });

export const ROLES = ['mj', 'joueur', 'spectateur'] as const;
export type Role = (typeof ROLES)[number];

export const CAMPS = ['joueurs', 'adversaires', 'allies'] as const;
export type Camp = (typeof CAMPS)[number];

export const MODES = ['individuel', 'creneaux'] as const;
export type Mode = (typeof MODES)[number];

export const rooms = schemaCampaign.table('rooms', {
  id: uuid('id').primaryKey(),
  nom: text('nom').notNull(),
  description: text('description').notNull().default(''),
  systemId: text('system_id').notNull(),
  systemVersion: text('system_version').notNull(),
  ownerId: uuid('owner_id').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
  /** Code court de la salle (6 caractères), unique. */
  code: text('code').notNull().unique(),
  imageUrl: text('image_url'),
  /** Joueurs au plus, MJ non compris. */
  maxJoueurs: integer('max_joueurs').notNull().default(4),
  publique: boolean('publique').notNull().default(false),
  creationPersonnages: boolean('creation_personnages').notNull().default(true),
});

export const roomMembers = schemaCampaign.table(
  'room_members',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role').$type<Role>().notNull(),
    joinedAt: horodatage('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })],
);

export const invitations = schemaCampaign.table('invitations', {
  id: uuid('id').primaryKey(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  creePar: uuid('cree_par').notNull(),
  expireLe: horodatage('expire_le').notNull(),
  utilisationsMax: integer('utilisations_max').notNull(),
  utilisations: integer('utilisations').notNull().default(0),
  createdAt: horodatage('created_at').notNull().defaultNow(),
});

export const roomCharacters = schemaCampaign.table(
  'room_characters',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').notNull(),
    ownerId: uuid('owner_id').notNull(),
    camp: text('camp').$type<Camp>().notNull(),
    ajoutePar: uuid('ajoute_par').notNull(),
    ajouteLe: horodatage('ajoute_le').notNull().defaultNow(),
    /** Membre qui incarne ce personnage (un seul par salle et par membre). */
    incarnePar: uuid('incarne_par'),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.characterId] }),
    unique('room_characters_incarne_par').on(t.roomId, t.incarnePar),
  ],
);

/** Utilisateurs bannis d'une salle. */
export const roomBans = schemaCampaign.table(
  'room_bans',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    banniPar: uuid('banni_par').notNull(),
    banniLe: horodatage('banni_le').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })],
);

/** Sessions de jeu prévues. */
export const roomSessions = schemaCampaign.table('room_sessions', {
  id: uuid('id').primaryKey(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  prevueLe: horodatage('prevue_le').notNull(),
  titre: text('titre'),
  creePar: uuid('cree_par').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
});

/** Messages de discussion (id UUIDv7 : ordre chronologique). */
export const roomMessages = schemaCampaign.table('room_messages', {
  id: uuid('id').primaryKey(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  auteurId: uuid('auteur_id').notNull(),
  texte: text('texte').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
});

/** Anciens identifiants Firebase → salles (imports rejouables). */
export const legacyIds = schemaCampaign.table(
  'legacy_ids',
  {
    source: text('source').notNull(),
    legacyId: text('legacy_id').notNull(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.source, t.legacyId] })],
);

export const combats = schemaCampaign.table('combats', {
  roomId: uuid('room_id')
    .primaryKey()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  id: uuid('id').notNull().unique(),
  mode: text('mode').$type<Mode>().notNull(),
  round: integer('round').notNull().default(1),
  courant: integer('courant').notNull().default(0),
  creneaux: jsonb('creneaux').$type<Camp[] | null>(),
  initiative: boolean('initiative').notNull().default(false),
  version: integer('version').notNull().default(1),
  demarrePar: uuid('demarre_par').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  updatedAt: horodatage('updated_at').notNull().defaultNow(),
});

export const combatParticipants = schemaCampaign.table(
  'combat_participants',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => combats.roomId, { onDelete: 'cascade' }),
    characterId: uuid('character_id').notNull(),
    rang: integer('rang').notNull(),
    camp: text('camp').$type<Camp>().notNull(),
    cles: jsonb('cles').$type<number[]>().notNull().default([]),
    aAgi: boolean('a_agi').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.characterId] })],
);

export const outbox = schemaCampaign.table('outbox', {
  id: uuid('id').primaryKey(),
  subject: text('subject').notNull(),
  envelope: jsonb('envelope').notNull(),
  createdAt: horodatage('created_at').notNull().defaultNow(),
  publishedAt: horodatage('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const inbox = schemaCampaign.table('inbox', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  processedAt: horodatage('processed_at').notNull().defaultNow(),
});
