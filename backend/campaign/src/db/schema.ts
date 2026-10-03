/**
 * Schéma Drizzle du service campaign : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/campaign/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import {
  type AttackActor,
  type AttackAppliedTarget,
  type AttackTargetResult,
  type AttackTargetView,
  type CombatInitiative,
  type CombatSettings,
  type MapGrid,
  type MapWeather,
  type RollStep,
  MapBlocksFrom,
  MapDrawingTool,
  MapFogMode,
  MapFogShape,
  MapMeasurementShape,
  MapObjectKind,
  MapObjectVisibility,
  MapObstacleKind,
  MapPortalIcon,
  MapPortalKind,
  MapRoomMode,
  MapTokenShape,
  MapTokenVisibility,
  type MapObjectItem,
  type MapToken,
} from '@vtt/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  customType,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
  smallint,
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

/** Couleurs d'accent d'une campagne (le front les traduit en thème). */
export const ACCENTS = ['gold', 'ember', 'arcane', 'sylvan', 'frost', 'blood'] as const;
export type Accent = (typeof ACCENTS)[number];

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
  isPublic: boolean('is_public').notNull().default(false),
  characterCreation: boolean('character_creation').notNull().default(true),
  /** Accroche d'une ligne (160 caractères au plus). */
  pitch: text('pitch').notNull().default(''),
  accent: text('accent').$type<Accent>().notNull().default('gold'),
  /** Genres (10 au plus). */
  tags: text('tags').array().notNull().default([]),
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

/** Invitations nominatives en attente : l'invité rejoint sans code, même une campagne privée. */
export const campaignInvitees = campaignSchema.table(
  'campaign_invitees',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    invitedBy: uuid('invited_by').notNull(),
    invitedAt: timestampTz('invited_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

/** Réglages de table d'une campagne (document validé par le service, version propre). */
export const campaignSettings = campaignSchema.table('campaign_settings', {
  campaignId: uuid('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').notNull(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
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

/**
 * Messages de discussion (id UUIDv7 : ordre chronologique). Chuchotement : `whisperRecipients`
 * non nul (membres destinataires), aux MJ aussi si `whisperGm` (0016-message-whispers.sql).
 */
export const campaignMessages = campaignSchema.table('campaign_messages', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull(),
  body: text('body').notNull(),
  whisperRecipients: uuid('whisper_recipients').array(),
  whisperGm: boolean('whisper_gm').notNull().default(false),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  editedAt: timestampTz('edited_at'),
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
  /** Début du combat (`startedAt` de l'API). */
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  /** Réglages du MJ ; `{}` (combat d'avant 0023) : les défauts. */
  settings: jsonb('settings').$type<Partial<CombatSettings>>().notNull().default({}),
  /** Acteur désigné du créneau courant (mode slots), sinon null. */
  currentActorId: uuid('current_actor_id'),
  /** Compteur des passages de tour (journal). */
  turn: integer('turn').notNull().default(0),
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
    visibleToPlayers: boolean('visible_to_players').notNull().default(true),
    initiative: jsonb('initiative').$type<CombatInitiative | null>(),
    initiativePending: boolean('initiative_pending').notNull().default(false),
    joinedRound: integer('joined_round').notNull().default(1),
    defeated: boolean('defeated').notNull().default(false),
    surprised: boolean('surprised').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.characterId] })],
);

/** Raison d'un passage de tour enregistré dans le journal (« Précédent » le dépile). */
export const TURN_LOG_REASONS = ['next', 'new_round', 'slot_actor', 'turn_set'] as const;
export type TurnLogReason = (typeof TURN_LOG_REASONS)[number];

/** État d'avant un passage : participants par identité (l'ordre a pu changer depuis). */
export interface TurnSnapshot {
  round: number;
  currentIndex: number;
  /** Participant dont c'était le tour (individual), sinon null. */
  currentId: string | null;
  currentActorId: string | null;
  turn: number;
  /** Participants qui avaient déjà agi pendant ce round. */
  acted: string[];
}

/** Journal des passages de tour (0023-combat-turns.sql). */
export const campaignCombatTurns = campaignSchema.table('campaign_combat_turns', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaignCombats.campaignId, { onDelete: 'cascade' }),
  combatId: uuid('combat_id').notNull(),
  reason: text('reason').$type<TurnLogReason>().notNull(),
  before: jsonb('before').$type<TurnSnapshot>().notNull(),
  tickId: text('tick_id'),
  /** Entrées expirées par personnage lors du décompte de ce passage. */
  expired: jsonb('expired').$type<Record<string, string[]>>(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
});

// ─── Attaques (0024-combat-attacks.sql, docs/combat.md § 5 à § 7) ───────────

export type AttackStatusValue =
  | 'awaiting_reactions'
  | 'awaiting_dice'
  | 'pending'
  | 'applied'
  | 'dismissed'
  | 'cancelled'
  | 'failed';
export type AttackTargetStatusValue = 'awaiting_reaction' | 'awaiting_dice' | 'resolved' | 'failed';
export type AttackDecisionValue = 'pending' | 'applied' | 'skipped' | 'reverted';
export type ParamValue = number | string | boolean;

export const campaignAttacks = campaignSchema.table('campaign_attacks', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  combatId: uuid('combat_id'),
  round: integer('round'),
  turn: integer('turn'),
  attackerId: uuid('attacker_id').notNull(),
  actionId: text('action_id').notNull(),
  actionName: text('action_name').notNull(),
  params: jsonb('params').$type<Record<string, ParamValue>>().notNull().default({}),
  rollMode: text('roll_mode').$type<'per_target' | 'shared'>().notNull(),
  dice: text('dice').$type<'physical' | 'server'>().notNull(),
  visibility: text('visibility').$type<'public' | 'private' | 'gm'>().notNull(),
  status: text('status').$type<AttackStatusValue>().notNull(),
  outOfTurn: boolean('out_of_turn').notNull().default(false),
  selfTarget: boolean('self_target').notNull().default(false),
  origin: text('origin').$type<'map' | 'selection' | 'measurement' | 'sheet' | 'turns'>(),
  presetId: text('preset_id'),
  adjustments: jsonb('adjustments').$type<{
    dice?: { die: string; count: number }[];
    bonus?: number;
  } | null>(),
  actor: jsonb('actor').$type<AttackActor | null>(),
  /** Instantané opaque de character, réservé au serveur, effacé à la résolution. */
  snapshot: jsonb('snapshot').$type<unknown>(),
  faces: jsonb('faces')
    .$type<{ id: string; value: number; source?: string }[]>()
    .notNull()
    .default([]),
  pendingSteps: jsonb('pending_steps').$type<RollStep[]>().notNull().default([]),
  /** Résolution en cours chez character depuis ce moment (null : aucune). */
  resolvingSince: timestampTz('resolving_since'),
  /** Les étapes de dés s'enchaînent seules, tirées par le serveur (lot du MJ). */
  autoRoll: boolean('auto_roll').notNull().default(false),
  note: text('note'),
  idempotencyKey: text('idempotency_key'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  resolvedAt: timestampTz('resolved_at'),
  decidedAt: timestampTz('decided_at'),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
});

export const campaignAttackTargets = campaignSchema.table(
  'campaign_attack_targets',
  {
    attackId: uuid('attack_id')
      .notNull()
      .references(() => campaignAttacks.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').notNull(),
    position: integer('position').notNull(),
    status: text('status').$type<AttackTargetStatusValue>().notNull(),
    decision: text('decision').$type<AttackDecisionValue>().notNull().default('pending'),
    reactionParams: jsonb('reaction_params').$type<string[]>().notNull().default([]),
    reaction: jsonb('reaction').$type<{
      params: Record<string, ParamValue>;
      skipped: boolean;
      answeredBy: string | null;
    } | null>(),
    view: jsonb('view').$type<AttackTargetView | null>(),
    result: jsonb('result').$type<AttackTargetResult | null>(),
    applied: jsonb('applied').$type<AttackAppliedTarget | null>(),
    error: text('error'),
  },
  (t) => [primaryKey({ columns: [t.attackId, t.characterId] })],
);

/**
 * Décision d'une application : une cible (ou les coûts de l'attaquant), appliquée ou non, les
 * fiches qu'elle écrit et ce qui est appliqué. Assez pour finir l'application après une panne.
 */
export interface ApplicationDecision {
  /** Cible décidée ; null : coûts de l'attaquant. */
  targetId: string | null;
  apply: boolean;
  /** Fiches écrites par cette décision (cible ou réattribution, attaquant). */
  characterIds: string[];
  /** Ce qui est appliqué (`defeated` complété à la réponse de character). */
  applied: AttackAppliedTarget | null;
  reverted: boolean;
}

export const campaignAttackApplications = campaignSchema.table('campaign_attack_applications', {
  id: uuid('id').primaryKey(),
  attackId: uuid('attack_id')
    .notNull()
    .references(() => campaignAttacks.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull(),
  status: text('status').$type<'applying' | 'applied' | 'reverted'>().notNull(),
  decisions: jsonb('decisions').$type<ApplicationDecision[]>().notNull(),
  items: jsonb('items').$type<unknown[]>().notNull(),
  result: jsonb('result').$type<unknown>(),
  note: text('note'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  appliedAt: timestampTz('applied_at'),
  revertedAt: timestampTz('reverted_at'),
  revertedBy: uuid('reverted_by'),
});

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

// ─── Carte (PostGIS, SRID 0, coordonnées en pixels) ─────────────────────────

/** Point de la carte, en pixels de l'image de fond. */
export interface MapPoint {
  x: number;
  y: number;
}

/**
 * Lit un point, une ligne ou un polygone 2D en EWKB hexadécimal (sortie texte de PostGIS).
 * Polygone : ses anneaux, le contour d'abord, chacun fermé (dernier point = premier).
 */
export function parseEwkbRings(hex: string): MapPoint[][] {
  const bytes = Buffer.from(hex, 'hex');
  const little = bytes[0] === 1;
  const u32 = (o: number) => (little ? bytes.readUInt32LE(o) : bytes.readUInt32BE(o));
  const f64 = (o: number) => (little ? bytes.readDoubleLE(o) : bytes.readDoubleBE(o));
  const type = u32(1);
  let offset = 5 + (type & 0x20000000 ? 4 : 0); // SRID facultatif
  const read = (count: number) => {
    const points = Array.from({ length: count }, (_, i) => ({
      x: f64(offset + i * 16),
      y: f64(offset + i * 16 + 8),
    }));
    offset += count * 16;
    return points;
  };
  const counted = () => {
    const count = u32(offset);
    offset += 4;
    return read(count);
  };
  switch (type & 0xffff) {
    case 1:
      return [read(1)];
    case 2:
      return [counted()];
    case 3: {
      const rings = u32(offset);
      offset += 4;
      return Array.from({ length: rings }, counted);
    }
    default:
      throw new Error(`Géométrie non prise en charge (type ${type & 0xffff})`);
  }
}

/** Lit un point ou une ligne 2D en EWKB hexadécimal (sortie texte de PostGIS). */
export function parseEwkb(hex: string): MapPoint[] {
  return parseEwkbRings(hex)[0] ?? [];
}

const coords = (p: MapPoint) => `${p.x} ${p.y}`;

/** geometry(Point, 0) ⇄ { x, y }. */
const point = customType<{ data: MapPoint; driverData: string }>({
  dataType: () => 'geometry(Point, 0)',
  toDriver: (p) => `POINT(${coords(p)})`,
  fromDriver: (hex) => parseEwkb(hex)[0]!,
});

/** geometry(LineString, 0) ⇄ [{ x, y }, …] (deux points au moins). */
const lineString = customType<{ data: MapPoint[]; driverData: string }>({
  dataType: () => 'geometry(LineString, 0)',
  toDriver: (points) => `LINESTRING(${points.map(coords).join(', ')})`,
  fromDriver: (hex) => parseEwkb(hex),
});

/**
 * geometry(Polygon, 0) ⇄ contour [{ x, y }, …] sans répéter le premier point (trois points
 * au moins). Les trous éventuels ne sont pas lus : pièces et zones n'en ont pas.
 */
const polygon = customType<{ data: MapPoint[]; driverData: string }>({
  dataType: () => 'geometry(Polygon, 0)',
  toDriver: (points) => {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const closed = first.x === last.x && first.y === last.y ? points : [...points, first];
    return `POLYGON((${closed.map(coords).join(', ')}))`;
  },
  fromDriver: (hex) => {
    const ring = parseEwkbRings(hex)[0] ?? [];
    return ring.slice(0, -1);
  },
});

export const TOKEN_VISIBILITIES = MapTokenVisibility.options;
export type TokenVisibility = MapTokenVisibility;
export const OBJECT_VISIBILITIES = MapObjectVisibility.options;
export type ObjectVisibility = MapObjectVisibility;
export type ObstacleKind = MapObstacleKind;
/** Ancien côté bloquant d'un mur à sens unique (colonne obsolète depuis 0017, voir blocks_from). */
export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;

/** Colonnes communes aux éléments d'une carte. */
const mapElement = () => ({
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  mapId: uuid('map_id').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const mapGroups = campaignSchema.table('map_groups', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: bigint('sort_order', { mode: 'number' }).notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

/**
 * Élément rangé dans un calque du MJ (0018) : sans valeur à l'insertion, le déclencheur de la
 * base choisit le calque par défaut de sa sorte et le haut de sa pile (pas de valeur par défaut
 * en base : `default(NULL)` ne sert qu'à rendre la colonne facultative à l'insertion).
 */
const layered = () => ({
  layerId: uuid('layer_id')
    .notNull()
    .default(sql`NULL`),
  z: doublePrecision('z')
    .notNull()
    .default(sql`NULL`),
});
/** Dessins et textes : calque facultatif (null : annotation au-dessus de l'ombre). */
const annotation = () => ({
  layerId: uuid('layer_id'),
  z: doublePrecision('z')
    .notNull()
    .default(sql`NULL`),
});

/** Scènes ; `isDefault` : le fond global de l'ancienne app (aucune scène). */
export const maps = campaignSchema.table('maps', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  backgroundUrl: text('background_url'),
  isDefault: boolean('is_default').notNull().default(false),
  visibleToPlayers: boolean('visible_to_players').notNull().default(true),
  spawn: point('spawn'),
  width: integer('width'),
  height: integer('height'),
  /** Météo de la scène (`MapWeather`, @vtt/contracts) ; `wind` facultatif, sans changeset. */
  weather: jsonb('weather').$type<MapWeather | null>(),
  layers: jsonb('layers').$type<Record<string, boolean>>().notNull().default({}),
  /** Toute la carte sous le brouillard au départ (0017) ; les zones s'appliquent ensuite. */
  fogFull: boolean('fog_full').notNull().default(false),
  /** Quadrillages (0021), grille de jeu comprise (`MapGrid`, @vtt/contracts). */
  grids: jsonb('grids').$type<MapGrid[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

/** Calques du MJ (0018) : pile ordonnée par carte ; une carte naît avec Sol, Objets, Personnages. */
export const mapLayers = campaignSchema.table('map_layers', {
  ...mapElement(),
  name: text('name').notNull(),
  sortOrder: doublePrecision('sort_order').notNull().default(0),
  visibleToPlayers: boolean('visible_to_players').notNull().default(true),
  locked: boolean('locked').notNull().default(false),
  opacity: real('opacity').notNull().default(1),
  /** Calque par défaut d'une sorte (un par carte et par rôle). */
  role: text('role').$type<'ground' | 'objects' | 'tokens' | null>(),
});

export const mapSettings = campaignSchema.table('map_settings', {
  campaignId: uuid('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  partyMapId: uuid('party_map_id'),
  tokenScale: real('token_scale').notNull().default(1),
  pixelsPerUnit: real('pixels_per_unit').notNull().default(50),
  unitName: text('unit_name').notNull().default('m'),
  shadowOpacity: real('shadow_opacity').notNull().default(1),
  dungeonMode: boolean('dungeon_mode').notNull().default(false),
  music: jsonb('music').$type<Record<string, unknown> | null>(),
  version: integer('version').notNull().default(1),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

/** Obsolète (0017) : converti en `mapFogZones` et `maps.fogFull`, plus lu ni écrit. */
export const mapFog = campaignSchema.table('map_fog', {
  mapId: uuid('map_id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  fullMap: boolean('full_map').notNull().default(false),
  cells: text('cells').array().notNull().default([]),
  version: integer('version').notNull().default(1),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});

export const mapTokens = campaignSchema.table(
  'map_tokens',
  {
    ...mapElement(),
    characterId: uuid('character_id').notNull(),
    ...layered(),
    pos: point('pos').notNull(),
    /** La carte où se trouve le personnage (une seule) ; sinon sa dernière position ici. */
    present: boolean('present').notNull().default(true),
    scale: real('scale').notNull().default(1),
    shape: text('shape').$type<MapTokenShape>().notNull().default('circle'),
    imageUrl: text('image_url'),
    visibility: text('visibility').$type<TokenVisibility>().notNull().default('visible'),
    visibleTo: uuid('visible_to').array().notNull().default([]),
    visionRadius: real('vision_radius').notNull().default(100),
    visionBoost: boolean('vision_boost').notNull().default(false),
    notes: text('notes'),
    audio: jsonb('audio').$type<MapToken['audio']>(),
    interactions: jsonb('interactions').$type<MapToken['interactions']>(),
  },
  (t) => [
    unique('map_tokens_map_character').on(t.mapId, t.characterId),
    unique('map_tokens_id_map').on(t.id, t.mapId),
    index('map_tokens_map_pos').using('gist', t.mapId, t.pos),
  ],
);

export const mapObjects = campaignSchema.table('map_objects', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  kind: text('kind').$type<MapObjectKind>().notNull().default('decor'),
  imageUrl: text('image_url').notNull().default(''),
  pos: point('pos').notNull(),
  width: real('width').notNull().default(100),
  height: real('height').notNull().default(100),
  rotation: real('rotation').notNull().default(0),
  /** Legacy : décor d'arrière-plan ; ne sert plus qu'au calque par défaut (Sol) à l'insertion. */
  isBackground: boolean('is_background').notNull().default(false),
  ...layered(),
  isLocked: boolean('is_locked').notNull().default(false),
  visibility: text('visibility').$type<ObjectVisibility>().notNull().default('visible'),
  visibleTo: uuid('visible_to').array().notNull().default([]),
  notes: text('notes'),
  items: jsonb('items').$type<MapObjectItem[]>().notNull().default([]),
  linkedId: text('linked_id'),
  groupEntityId: text('group_entity_id'),
  searchable: boolean('searchable').notNull().default(false),
  /** En unités de la carte (× pixels_per_unit), depuis le rectangle de l'objet. */
  searchRadius: real('search_radius').notNull().default(1.5),
});

export const mapLights = campaignSchema.table('map_lights', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  pos: point('pos').notNull(),
  /** En unités de la carte (× pixels_per_unit). */
  radius: real('radius').notNull().default(10),
  visible: boolean('visible').notNull().default(true),
  color: text('color').notNull().default('#ffd08a'),
  intensity: real('intensity').notNull().default(1),
  falloff: real('falloff').notNull().default(0.5),
  /** Token suivi (torche), sur la même carte ; null : lumière fixe. */
  attachedTokenId: uuid('attached_token_id'),
});

export const mapObstacles = campaignSchema.table('map_obstacles', {
  ...mapElement(),
  kind: text('kind').$type<ObstacleKind>().notNull().default('wall'),
  geom: lineString('geom').notNull(),
  /** Obsolète (0017) : remplacée par `blocksFrom`, plus lue ni écrite. */
  direction: text('direction').$type<(typeof DIRECTIONS)[number] | null>(),
  /** Mur à sens unique : côté du tracé d'où la vue est bloquée. */
  blocksFrom: text('blocks_from').$type<MapBlocksFrom | null>(),
  isOpen: boolean('is_open').notNull().default(false),
  isLocked: boolean('is_locked').notNull().default(false),
  color: text('color'),
  opacity: real('opacity').notNull().default(1),
  roomMode: text('room_mode').$type<MapRoomMode | null>(),
});

/** Pièces : polygones fermés, sans effet de mur par eux-mêmes (0017). */
export const mapRooms = campaignSchema.table('map_rooms', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  geom: polygon('geom').notNull(),
});

/**
 * Zones de brouillard (0017), appliquées par `seq` croissant à partir de `maps.fogFull`.
 * Cercle : `center` et `radius` font foi, `geom` en est l'approximation (index, bbox).
 */
export const mapFogZones = campaignSchema.table('map_fog_zones', {
  ...mapElement(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  shape: text('shape').$type<MapFogShape>().notNull(),
  mode: text('mode').$type<MapFogMode>().notNull().default('fog'),
  geom: polygon('geom').notNull(),
  center: point('center'),
  radius: doublePrecision('radius'),
  createdBy: uuid('created_by').notNull(),
});

export const mapDrawings = campaignSchema.table('map_drawings', {
  ...mapElement(),
  createdBy: uuid('created_by').notNull(),
  /** Calque du MJ ; null : annotation au-dessus de l'ombre. */
  ...annotation(),
  tool: text('tool').$type<MapDrawingTool>().notNull().default('pen'),
  geom: lineString('geom').notNull(),
  color: text('color').notNull().default('#000000'),
  width: real('width').notNull().default(5),
  fill: text('fill'),
  closed: boolean('closed').notNull().default(false),
  smooth: boolean('smooth').notNull().default(false),
});

export const mapNotes = campaignSchema.table('map_notes', {
  ...mapElement(),
  createdBy: uuid('created_by').notNull(),
  /** Calque du MJ ; null : annotation au-dessus de l'ombre. */
  ...annotation(),
  text: text('text').notNull(),
  pos: point('pos').notNull(),
  /** Degrés, autour de `pos` (début de la ligne de base). */
  rotation: real('rotation').notNull().default(0),
  color: text('color').notNull().default('yellow'),
  fontSize: real('font_size').notNull().default(16),
  fontFamily: text('font_family'),
});

export const mapMusicZones = campaignSchema.table('map_music_zones', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  pos: point('pos').notNull(),
  radius: real('radius').notNull().default(100),
  url: text('url'),
  /** Son de la bibliothèque du service audio (0027). */
  assetId: uuid('asset_id'),
  volume: real('volume').notNull().default(0.5),
  color: text('color'),
  /** Arrêtée : pas envoyée aux joueurs (0027). */
  active: boolean('active').notNull().default(true),
});

export const mapPortals = campaignSchema.table('map_portals', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  pos: point('pos').notNull(),
  radius: real('radius').notNull().default(50),
  kind: text('kind').$type<MapPortalKind>().notNull().default('scene_change'),
  targetMapId: uuid('target_map_id'),
  target: point('target'),
  icon: text('icon').$type<MapPortalIcon | null>(),
  color: text('color'),
  visible: boolean('visible').notNull().default(true),
  /** Franchi dès qu'un joueur y lâche son token (0022). */
  auto: boolean('auto').notNull().default(false),
  /** Retour relié, même campagne (0022) ; lien symétrique tenu par le service. */
  linkedPortalId: uuid('linked_portal_id'),
});

export const mapMeasurements = campaignSchema.table('map_measurements', {
  ...mapElement(),
  createdBy: uuid('created_by').notNull(),
  shape: text('shape').$type<MapMeasurementShape>().notNull(),
  geom: lineString('geom').notNull(),
  color: text('color').notNull().default('#ffffff'),
  skin: text('skin'),
  options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
});

// ─── Notes (legacy Notes et SharedNotes) ────────────────────────────────────

export const NOTE_TYPES = ['character', 'location', 'item', 'quest', 'journal', 'other'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];
export const QUEST_TYPES = ['main', 'side'] as const;
export type QuestType = (typeof QUEST_TYPES)[number];
export const QUEST_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export interface NoteTag {
  id: string;
  label: string;
}

export interface NoteSubQuest {
  id: string;
  title: string;
  description: string;
  status: QuestStatus;
}

/** Vecteur de recherche (généré par la base, jamais écrit par le service). */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/**
 * Notes d'une campagne : privées (`shared` faux : l'auteur seul) ou partagées
 * (`sharedWith` null : tous les membres ; sinon les joueurs de ces personnages,
 * et les MJ si `sharedWithGm`). Voir docs/api-notes.md.
 */
export const notes = campaignSchema.table(
  'notes',
  {
    id: uuid('id').primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').notNull(),
    /** Personnage incarné par l'auteur quand il l'a écrite. */
    characterId: uuid('character_id'),
    shared: boolean('shared').notNull().default(false),
    sharedWith: uuid('shared_with').array(),
    /** Partagée aussi avec les MJ de la campagne (sharedWith vide : avec eux seulement). */
    sharedWithGm: boolean('shared_with_gm').notNull().default(false),
    title: text('title').notNull().default(''),
    /** HTML assaini par le service (modules/notes/html.ts). */
    content: text('content').notNull().default(''),
    /** Un emoji ; null : celui du type. */
    icon: text('icon'),
    type: text('type').$type<NoteType>().notNull().default('other'),
    tags: jsonb('tags').$type<NoteTag[]>().notNull().default([]),
    imageUrl: text('image_url'),
    race: text('race'),
    class: text('class'),
    region: text('region'),
    itemType: text('item_type'),
    questType: text('quest_type').$type<QuestType | null>(),
    questStatus: text('quest_status').$type<QuestStatus | null>(),
    subQuests: jsonb('sub_quests').$type<NoteSubQuest[]>().notNull().default([]),
    /** Texte brut de `content` (recherche, extraits). */
    plainText: text('plain_text').notNull().default(''),
    /** Aperçu des listes : texte sans les intertitres. */
    preview: text('preview').notNull().default(''),
    /** Forme de recherche (minuscules, sans accents) du titre, des étiquettes et du texte. */
    searchText: text('search_text').notNull().default(''),
    /** Version de l'assainisseur qui a écrit `content` (0 : importée, à réassainir). */
    sanitizerVersion: smallint('sanitizer_version').notNull().default(0),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('french', search_text) || to_tsvector('simple', search_text)`,
    ),
    version: integer('version').notNull().default(1),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
    updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('notes_owner').on(t.campaignId, t.ownerUserId),
    index('notes_author').on(t.ownerUserId),
  ],
);

/** Épingles : préférence de chaque lecteur, sans effet pour les autres. */
export const notePins = campaignSchema.table(
  'note_pins',
  {
    userId: uuid('user_id').notNull(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    pinnedAt: timestampTz('pinned_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.noteId] }), index('note_pins_note').on(t.noteId)],
);

// ─── Stockage (docs/stockage.md) ─────────────────────────────────────────────

export type StorageFileState = 'pending' | 'stored';

/** Fichiers d'une campagne sur le stockage : réservés à l'envoi, puis vus par l'inventaire. */
export const campaignStorageFiles = campaignSchema.table('campaign_storage_files', {
  key: text('key').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  contentType: text('content_type'),
  usage: text('usage'),
  state: text('state').$type<StorageFileState>().notNull().default('pending'),
  usedBy: text('used_by').array().notNull().default([]),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  seenAt: timestampTz('seen_at'),
});

export const campaignStorageInventories = campaignSchema.table('campaign_storage_inventories', {
  campaignId: uuid('campaign_id').primaryKey(),
  inventoriedAt: timestampTz('inventoried_at').notNull(),
});

// ─── Projection et documents (docs/projection.md) ────────────────────────────

export const campaignHandouts = campaignSchema.table('campaign_handouts', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  contentType: text('content_type').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
});

export const campaignHandoutShares = campaignSchema.table('campaign_handout_shares', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  handoutId: uuid('handout_id').notNull(),
  mode: text('mode').$type<'show' | 'send'>().notNull(),
  /** Destinataires (utilisateurs) ; null : toute la table. */
  recipients: uuid('recipients').array(),
  sharedBy: uuid('shared_by').notNull(),
  sharedAt: timestampTz('shared_at').notNull().defaultNow(),
  startsAt: timestampTz('starts_at').notNull(),
  stoppedAt: timestampTz('stopped_at'),
});
