/**
 * Schéma Drizzle du service campaign : sert uniquement à typer les requêtes.
 * La source de vérité est le changelog Liquibase (backend/campaign/db) ; ce
 * fichier doit lui correspondre colonne pour colonne.
 */
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
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

// ─── Carte (PostGIS, SRID 0, coordonnées en pixels) ─────────────────────────

/** Point de la carte, en pixels de l'image de fond. */
export interface MapPoint {
  x: number;
  y: number;
}

/** Lit un point ou une ligne 2D en EWKB hexadécimal (sortie texte de PostGIS). */
export function parseEwkb(hex: string): MapPoint[] {
  const bytes = Buffer.from(hex, 'hex');
  const little = bytes[0] === 1;
  const u32 = (o: number) => (little ? bytes.readUInt32LE(o) : bytes.readUInt32BE(o));
  const f64 = (o: number) => (little ? bytes.readDoubleLE(o) : bytes.readDoubleBE(o));
  const type = u32(1);
  let offset = 5 + (type & 0x20000000 ? 4 : 0); // SRID facultatif
  const read = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      x: f64(offset + i * 16),
      y: f64(offset + i * 16 + 8),
    }));
  switch (type & 0xffff) {
    case 1:
      return read(1);
    case 2: {
      const count = u32(offset);
      offset += 4;
      return read(count);
    }
    default:
      throw new Error(`Géométrie non prise en charge (type ${type & 0xffff})`);
  }
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

export const TOKEN_VISIBILITIES = ['visible', 'hidden', 'ally', 'custom', 'invisible'] as const;
export type TokenVisibility = (typeof TOKEN_VISIBILITIES)[number];
export const OBJECT_VISIBILITIES = ['visible', 'hidden', 'custom'] as const;
export type ObjectVisibility = (typeof OBJECT_VISIBILITIES)[number];
export const TOKEN_SHAPES = ['circle', 'square'] as const;
export const OBJECT_KINDS = ['decor', 'weapon', 'item'] as const;
export const OBSTACLE_KINDS = ['wall', 'one_way_wall', 'door', 'window'] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];
export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export const ROOM_MODES = ['room', 'individual'] as const;
export const DRAWING_TOOLS = ['pen', 'brush', 'eraser', 'line', 'rectangle', 'circle'] as const;
export const PORTAL_KINDS = ['scene_change', 'same_map'] as const;
export const PORTAL_ICONS = ['stairs', 'door', 'portal', 'ladder'] as const;
export const MEASUREMENT_SHAPES = ['line', 'cone', 'circle', 'cube'] as const;

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
  weather: jsonb('weather').$type<{ type: string; intensity: number } | null>(),
  layers: jsonb('layers').$type<Record<string, boolean>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
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
    pos: point('pos').notNull(),
    /** La carte où se trouve le personnage (une seule) ; sinon sa dernière position ici. */
    present: boolean('present').notNull().default(true),
    scale: real('scale').notNull().default(1),
    shape: text('shape').$type<(typeof TOKEN_SHAPES)[number]>().notNull().default('circle'),
    imageUrl: text('image_url'),
    visibility: text('visibility').$type<TokenVisibility>().notNull().default('visible'),
    visibleTo: uuid('visible_to').array().notNull().default([]),
    visionRadius: real('vision_radius').notNull().default(100),
    visionBoost: boolean('vision_boost').notNull().default(false),
    notes: text('notes'),
    audio: jsonb('audio').$type<Record<string, unknown> | null>(),
    interactions: jsonb('interactions').$type<unknown[] | null>(),
  },
  (t) => [
    unique('map_tokens_map_character').on(t.mapId, t.characterId),
    index('map_tokens_map_pos').using('gist', t.mapId, t.pos),
  ],
);

export const mapObjects = campaignSchema.table('map_objects', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  kind: text('kind').$type<(typeof OBJECT_KINDS)[number]>().notNull().default('decor'),
  imageUrl: text('image_url').notNull().default(''),
  pos: point('pos').notNull(),
  width: real('width').notNull().default(100),
  height: real('height').notNull().default(100),
  rotation: real('rotation').notNull().default(0),
  isBackground: boolean('is_background').notNull().default(false),
  isLocked: boolean('is_locked').notNull().default(false),
  visibility: text('visibility').$type<ObjectVisibility>().notNull().default('visible'),
  visibleTo: uuid('visible_to').array().notNull().default([]),
  notes: text('notes'),
  items: jsonb('items').$type<unknown[]>().notNull().default([]),
  linkedId: text('linked_id'),
  groupEntityId: text('group_entity_id'),
});

export const mapLights = campaignSchema.table('map_lights', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  pos: point('pos').notNull(),
  /** En unités de la carte (× pixels_per_unit). */
  radius: real('radius').notNull().default(10),
  visible: boolean('visible').notNull().default(true),
});

export const mapObstacles = campaignSchema.table('map_obstacles', {
  ...mapElement(),
  kind: text('kind').$type<ObstacleKind>().notNull().default('wall'),
  geom: lineString('geom').notNull(),
  direction: text('direction').$type<(typeof DIRECTIONS)[number] | null>(),
  isOpen: boolean('is_open').notNull().default(false),
  isLocked: boolean('is_locked').notNull().default(false),
  color: text('color'),
  opacity: real('opacity'),
  roomMode: text('room_mode').$type<(typeof ROOM_MODES)[number] | null>(),
});

export const mapDrawings = campaignSchema.table('map_drawings', {
  ...mapElement(),
  createdBy: uuid('created_by').notNull(),
  tool: text('tool').$type<(typeof DRAWING_TOOLS)[number]>().notNull().default('pen'),
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
  text: text('text').notNull(),
  pos: point('pos').notNull(),
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
  volume: real('volume').notNull().default(0.5),
  color: text('color'),
});

export const mapPortals = campaignSchema.table('map_portals', {
  ...mapElement(),
  name: text('name').notNull().default(''),
  pos: point('pos').notNull(),
  radius: real('radius').notNull().default(50),
  kind: text('kind').$type<(typeof PORTAL_KINDS)[number]>().notNull().default('scene_change'),
  targetMapId: uuid('target_map_id'),
  target: point('target'),
  icon: text('icon').$type<(typeof PORTAL_ICONS)[number] | null>(),
  color: text('color'),
  visible: boolean('visible').notNull().default(true),
});

export const mapMeasurements = campaignSchema.table('map_measurements', {
  ...mapElement(),
  createdBy: uuid('created_by').notNull(),
  shape: text('shape').$type<(typeof MEASUREMENT_SHAPES)[number]>().notNull(),
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

/**
 * Notes privées (`shared` faux : l'auteur seul) et partagées (`sharedWith` null :
 * tous les membres ; sinon les joueurs de ces personnages). Voir docs/api-notes.md.
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
    title: text('title').notNull().default(''),
    content: text('content').notNull().default(''),
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
    version: integer('version').notNull().default(1),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
    updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('notes_owner').on(t.campaignId, t.ownerUserId)],
);
