/**
 * Carte d'une salle de l'ancienne app → lignes des tables de carte (docs/map.md).
 * Fonction pure : les correspondances (campagne, personnages importés et
 * engagés, comptes) sont passées en paramètre ; ce qui ne peut pas être
 * migré devient un avertissement, jamais une exception.
 *
 * Sources :
 *  - Firestore `cartes/{r}/…` : cities, groups, settings, fog, characters
 *    (champs de carte), objects, lights, musicZones, portals, et les anciennes
 *    collections text/obstacles/drawings (recopiées depuis dans la RTDB) ;
 *  - Realtime Database `rooms/{r}` : positions (prioritaires), obstacles,
 *    drawings, notes, measurements (permanentes), music.
 * `cityId` absent ou nul désigne le fond global : la carte `is_default`.
 *
 * Identifiants stables : UUID (SHA-1, version 5) du chemin legacy, pour qu'un
 * import rejoué retrouve les mêmes lignes.
 */
import { createHash } from 'node:crypto';
import type {
  mapDrawings,
  mapFog,
  mapGroups,
  mapLights,
  mapMeasurements,
  mapMusicZones,
  mapNotes,
  mapObjects,
  mapObstacles,
  mapPortals,
  maps,
  mapSettings,
  MapPoint,
  mapTokens,
  ObjectVisibility,
  ObstacleKind,
  TokenVisibility,
} from '../../db/schema.js';
import { blocksFromDirection, legacyItems } from './legacy-model.js';
import { toText, type FirestoreDoc } from '../legacy.js';
import { compareCodeUnits } from '@vtt/contracts';

/** UUID version 5 (SHA-1) d'un chemin legacy : stable d'un import à l'autre. */
export function legacyUuid(key: string): string {
  const h = createHash('sha1').update(`vtt-map-import:${key}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Nœud `rooms/{r}` de la Realtime Database (sous-arbres utiles à la carte). */
export interface RtdbRoom {
  positions?: Record<string, unknown>;
  obstacles?: Record<string, unknown>;
  drawings?: Record<string, unknown>;
  notes?: Record<string, unknown>;
  measurements?: Record<string, unknown>;
  music?: Record<string, unknown>;
  /** `drawings_obstacles_notes: true` : les collections Firestore ont été recopiées ici. */
  _migrations?: Record<string, unknown>;
}

export interface RoomMappings {
  campaignId: string;
  /** MJ propriétaire : auteur des dessins et textes (l'ancienne app ne le gardait pas). */
  ownerId: string;
  /** `cartes/{r}/characters/{id}` → personnage importé, et s'il est engagé dans la campagne. */
  characters: ReadonlyMap<string, { id: string; engaged: boolean }>;
  /** UID Firebase → compte migré (auteur des gabarits), facultatif. */
  accounts?: ReadonlyMap<string, string>;
}

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export interface MigratedMaps {
  groups: Insert<typeof mapGroups>[];
  maps: Insert<typeof maps>[];
  settings: Insert<typeof mapSettings> | null;
  fog: Insert<typeof mapFog>[];
  tokens: Insert<typeof mapTokens>[];
  objects: Insert<typeof mapObjects>[];
  lights: Insert<typeof mapLights>[];
  obstacles: Insert<typeof mapObstacles>[];
  drawings: Insert<typeof mapDrawings>[];
  notes: Insert<typeof mapNotes>[];
  musicZones: Insert<typeof mapMusicZones>[];
  portals: Insert<typeof mapPortals>[];
  measurements: Insert<typeof mapMeasurements>[];
  warnings: string[];
}

// ─── Lectures tolérantes ─────────────────────────────────────────────────────

type Data = Record<string, unknown>;

const obj = (v: unknown): Data | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Data) : undefined;

/** Nombre fini, y compris écrit en chaîne. */
export function num(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

const LIMIT = 1_000_000;
const coord = (v: unknown) => {
  const n = num(v);
  return n !== undefined && Math.abs(n) <= LIMIT ? n : undefined;
};

/** Point `{x, y}` valide, ou undefined. */
export function point(v: unknown): MapPoint | undefined {
  const o = obj(v);
  const x = coord(o?.x);
  const y = coord(o?.y);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

const points = (v: unknown): MapPoint[] | undefined => {
  let list: unknown[] | undefined;
  if (Array.isArray(v)) list = v;
  else if (obj(v)) list = Object.values(v as Data);
  if (!list) return undefined;
  const out = list.map(point);
  return out.every(Boolean) ? (out as MapPoint[]) : undefined;
};

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

const text = (v: unknown, max: number) => {
  const t = typeof v === 'string' ? v : undefined;
  return t === undefined ? undefined : t.slice(0, max);
};

const bounded = (v: unknown, min: number, max: number, fallback: number) => {
  const n = num(v);
  return n !== undefined && n >= min && n <= max ? n : fallback;
};

const positive = (v: unknown, max: number, fallback: number) => {
  const n = num(v);
  return n !== undefined && n > 0 && n <= max ? n : fallback;
};

const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | undefined =>
  values.includes(v as T) ? (v as T) : undefined;

const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
const ROOM_MODES = ['room', 'individual'] as const;
const DRAWING_TOOLS = ['pen', 'brush', 'eraser', 'line', 'rectangle', 'circle'] as const;
const PORTAL_ICONS = ['stairs', 'door', 'portal', 'ladder'] as const;
const MEASUREMENT_SHAPES = ['line', 'cone', 'circle', 'cube'] as const;
const LAYER_IDS = [
  'lights',
  'obstacles',
  'notes',
  'drawings',
  'objects',
  'characters',
  'fog',
  'music',
] as const;

/** Visibilité d'un token (`public`/`gm_only` : anciennes valeurs). */
function tokenVisibility(v: unknown, player: boolean): TokenVisibility {
  switch (v) {
    case 'visible':
    case 'public':
      return 'visible';
    case 'hidden':
    case 'ally':
    case 'custom':
    case 'invisible':
      return v;
    case 'gm_only':
      return 'invisible';
    default:
      // Joueur sans champ : visible ; PNJ : caché (repli de l'ancienne carte)
      return player ? 'visible' : 'hidden';
  }
}

function objectVisibility(v: unknown): ObjectVisibility {
  if (v === 'custom') return 'custom';
  if (v === 'hidden' || v === 'invisible' || v === 'gm_only') return 'hidden';
  return 'visible';
}

/** Case de brouillard « cx,cy » (l'ancienne app ajoutait une espace finale). */
const cell = (key: string) => {
  const k = key.trim();
  return /^-?\d{1,7},-?\d{1,7}$/.test(k) ? k : undefined;
};

// ─── Transformation ──────────────────────────────────────────────────────────

export function transformRoom(
  code: string,
  docs: readonly FirestoreDoc[],
  rtdb: RtdbRoom | undefined,
  m: RoomMappings,
): MigratedMaps {
  const warnings: string[] = [];
  const r = roomContext(code, docs, rtdb, m, warnings);
  // ─── Dossiers et scènes ────────────────────────────────────────────────
  const groups = migrateGroups(r);
  migrateScenes(r);
  // Fond global : créé à la demande (fond, éléments ou joueurs sans scène)
  if (r.hasBackground) r.ensureDefault();
  const settings = migrateSettings(r);
  const fog = migrateFog(r);
  const tokens = migrateTokens(r);
  const objects = migrateObjects(r);
  const lights = migrateLights(r);
  const musicZones = migrateMusicZones(r);
  const portals = migratePortals(r);
  const obstacles = migrateObstacles(r);
  const drawings = migrateDrawings(r);
  const notes = migrateNotes(r);
  const measurements = migrateMeasurements(r);
  return {
    groups,
    maps: r.mapsOut,
    settings,
    fog,
    tokens,
    objects,
    lights,
    obstacles,
    drawings,
    notes,
    musicZones,
    portals,
    measurements,
    warnings,
  };
}

/** Ce que les sections de l'import d'une salle partagent : documents, correspondances, cartes. */
interface Room {
  code: string;
  prefix: string;
  campaignId: string;
  m: RoomMappings;
  rtdb: RtdbRoom | undefined;
  warn(w: string): void;
  collection(name: string): FirestoreDoc[];
  layersOf(id: string): Record<string, boolean>;
  general: Data;
  groupIds: Map<string, string>;
  /** cityId legacy → carte. */
  cityIds: Map<string, string>;
  mapsOut: MigratedMaps['maps'];
  /** La salle a un fond global : sa carte principale existe d'emblée. */
  hasBackground: boolean;
  /** Carte principale, créée à la demande ; renvoie son identifiant. */
  ensureDefault(): string;
  /** Carte d'un `cityId` legacy ; undefined (avec avertissement) si la scène n'existe plus. */
  mapOf(cityId: unknown, what: string): string | undefined;
  partyCity: string | undefined;
  /** Personnages visés (identifiants legacy) → personnages importés. */
  translateIds(v: unknown, what: string): string[];
  /** RTDB d'abord, puis les copies Firestore d'une salle jamais rouverte depuis la bascule. */
  merged(rt: unknown, fsName: string): Map<string, Data>;
}

function roomContext(
  code: string,
  docs: readonly FirestoreDoc[],
  rtdb: RtdbRoom | undefined,
  m: RoomMappings,
  warnings: string[],
): Room {
  const warn = (w: string) => {
    warnings.push(w);
  };
  const prefix = `cartes/${code}`;
  const campaignId = m.campaignId;

  // Documents par sous-collection directe : cartes/{r}/<collection>/{id}
  const { byCollection, ignored } = collectionsOf(code, docs);
  const collection = (name: string) => byCollection.get(name) ?? [];
  for (const name of ['games', 'scenario', 'combat'])
    if (collection(name).length) ignored.set(name, collection(name).length);
  for (const [key, n] of ignored) warn(`${n} document(s) ${key} non migré(s) (hors carte)`);

  const settingsDoc = (id: string) => collection('settings').find((d) => d.id === id)?.data;
  const general = settingsDoc('general') ?? {};
  const layersOf = (id: string): Record<string, boolean> => {
    const list = settingsDoc(id)?.layers;
    const out: Record<string, boolean> = {};
    if (Array.isArray(list))
      for (const l of list) {
        const o = obj(l);
        if (o && oneOf(o.id, LAYER_IDS) && typeof o.isVisible === 'boolean')
          out[o.id as string] = o.isVisible;
      }
    return out;
  };

  const groupIds = new Map<string, string>();
  const mapsOut: MigratedMaps['maps'] = [];
  const cityIds = new Map<string, string>();
  // Fond global : créé à la demande (fond, éléments ou joueurs sans scène)
  const fond = collection('fond').find((d) => d.id === 'fond1')?.data;
  const defaultId = legacyUuid(`${prefix}/fond/fond1`);
  const mapSize = obj(settingsDoc('map'));
  let defaultMap: MigratedMaps['maps'][number] | undefined;
  const ensureDefault = () => {
    if (!defaultMap) {
      const width = num(mapSize?.imageWidth);
      const height = num(mapSize?.imageHeight);
      const sized =
        width !== undefined &&
        height !== undefined &&
        width >= 1 &&
        height >= 1 &&
        width <= 100_000 &&
        height <= 100_000;
      defaultMap = {
        id: defaultId,
        campaignId,
        name: 'Carte principale',
        isDefault: true,
        backgroundUrl: toText(fond?.url) ?? null,
        weather: weather(general.weather),
        layers: layersOf('layers'),
        ...(sized ? { width: Math.round(width), height: Math.round(height) } : {}),
      };
      mapsOut.push(defaultMap);
    }
    return defaultId;
  };

  /** Carte d'un `cityId` legacy ; undefined (avec avertissement) si la scène n'existe plus. */
  const mapOf = (cityId: unknown, what: string): string | undefined => {
    const c = toText(cityId);
    if (!c) return ensureDefault();
    const id = cityIds.get(c);
    if (!id) warn(`${what} : scène ${c} supprimée, élément ignoré`);
    return id;
  };
  const partyCity = toText(general.currentCityId);
  const translateIds = (v: unknown, what: string) => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const legacyId of v) {
      const c = m.characters.get(`${prefix}/characters/${String(legacyId)}`);
      if (c) out.push(c.id);
      else warn(`${what} : personnage visé ${String(legacyId)} non importé`);
    }
    return [...new Set(out)];
  };

  // ─── RTDB (et anciennes collections Firestore recopiées) ───────────────
  /**
   * RTDB d'abord. Une fois la salle migrée (drapeau `_migrations`), les
   * documents Firestore sont des copies périmées (effacées depuis dans la RTDB) :
   * ils ne comptent que pour une salle jamais ouverte depuis la bascule.
   */
  const copied = obj(rtdb?._migrations)?.drawings_obstacles_notes === true;
  const merged = (rt: unknown, fsName: string) => {
    const out = new Map<string, Data>();
    if (!copied) for (const d of collection(fsName)) out.set(d.id, d.data ?? {});
    for (const [id, v] of Object.entries(obj(rt) ?? {})) {
      const o = obj(v);
      if (o) out.set(id, o);
    }
    return out;
  };

  return {
    code,
    prefix,
    campaignId,
    m,
    rtdb,
    warn,
    collection,
    layersOf,
    general,
    groupIds,
    cityIds,
    mapsOut,
    hasBackground: Boolean(toText(fond?.url)),
    ensureDefault,
    mapOf,
    partyCity,
    translateIds,
    merged,
  };
}

/** Documents par sous-collection directe, et sous-collections plus profondes ignorées. */
function collectionsOf(code: string, docs: readonly FirestoreDoc[]) {
  const byCollection = new Map<string, FirestoreDoc[]>();
  const ignored = new Map<string, number>();
  for (const d of docs) {
    const s = d.path.split('/');
    if (s[0] !== 'cartes' || s[1] !== code) continue;
    if (s.length === 4) {
      const list = byCollection.get(s[2]!) ?? [];
      list.push(d);
      byCollection.set(s[2]!, list);
    } else if (s.length > 4) {
      const key = s
        .slice(2)
        .filter((_, i) => i % 2 === 0)
        .join('/');
      if (key !== 'characters/customCompetences') ignored.set(key, (ignored.get(key) ?? 0) + 1);
    }
  }
  return { byCollection, ignored };
}

/** Météo d'une scène (type et intensité), ou aucune. */
function weather(v: unknown) {
  const o = obj(v);
  const type = toText(o?.type)?.slice(0, 50);
  return type ? { type, intensity: bounded(o?.intensity, 0, 10, 1) } : null;
}

function migrateGroups(r: Room): MigratedMaps['groups'] {
  const { campaignId, warn, collection, groupIds } = r;
  const groups: MigratedMaps['groups'] = [];
  for (const d of collection('groups')) {
    const name = toText(d.data?.name)?.slice(0, 100);
    if (!name) {
      warn(`Dossier ${d.path} sans nom : ignoré`);
      continue;
    }
    const id = legacyUuid(d.path);
    groupIds.set(d.id, id);
    const order = num(d.data?.order);
    groups.push({
      id,
      campaignId,
      name,
      sortOrder: order !== undefined && order >= 0 ? Math.floor(order) : 0,
    });
  }
  return groups;
}

function migrateScenes(r: Room): void {
  const { campaignId, warn, collection, groupIds, cityIds, mapsOut, layersOf } = r;
  for (const d of collection('cities')) {
    const c = d.data ?? {};
    const id = legacyUuid(d.path);
    cityIds.set(d.id, id);
    const spawnX = coord(c.spawnX);
    const spawnY = coord(c.spawnY);
    const groupId = toText(c.groupId);
    if (groupId && !groupIds.has(groupId)) warn(`Scène ${d.path} : dossier ${groupId} introuvable`);
    mapsOut.push({
      id,
      campaignId,
      groupId: groupId ? (groupIds.get(groupId) ?? null) : null,
      name: toText(c.name)?.slice(0, 100) ?? 'Scène sans nom',
      description: (text(c.description, 2000) ?? '').trim(),
      backgroundUrl: toText(c.backgroundUrl) ?? null,
      visibleToPlayers: bool(c.visibleToPlayers, true),
      spawn: spawnX !== undefined && spawnY !== undefined ? { x: spawnX, y: spawnY } : null,
      weather: weather(c.weather),
      layers: layersOf(`layers_${d.id}`),
    });
  }
}

function migrateSettings(r: Room): MigratedMaps['settings'] {
  const { campaignId, general, rtdb, cityIds, partyCity } = r;
  const music = obj(rtdb?.music);
  const settings: MigratedMaps['settings'] =
    Object.keys(general).length || music
      ? {
          campaignId,
          partyMapId: partyCity ? (cityIds.get(partyCity) ?? null) : null,
          tokenScale: positive(general.globalTokenScale, 100, 1),
          pixelsPerUnit: positive(general.pixelsPerUnit, 100_000, 50),
          unitName: toText(general.unitName)?.slice(0, 20) ?? 'm',
          shadowOpacity: bounded(general.shadowOpacity, 0, 1, 1),
          dungeonMode: bool(general.donjon, false),
          music: music
            ? Object.fromEntries(
                [
                  'videoId',
                  'videoTitle',
                  'templateId',
                  'isPlaying',
                  'type',
                  'lastUpdate',
                  'timestamp',
                ]
                  .filter((k) => music[k] !== undefined)
                  .map((k) => [k, music[k]]),
              )
            : null,
        }
      : null;
  return settings;
}

function migrateFog(r: Room): MigratedMaps['fog'] {
  const { campaignId, collection, ensureDefault, mapOf } = r;
  const fog: MigratedMaps['fog'] = [];
  for (const d of collection('fog')) {
    const f = d.data ?? {};
    const grid = obj(f.grid) ?? {};
    const cells = [
      ...new Set(
        Object.entries(grid)
          .filter(([, v]) => v)
          .map(([k]) => cell(k))
          .filter((k): k is string => !!k),
      ),
    ].sort(compareCodeUnits);
    const fullMap = bool(f.fullMapFog, false);
    if (!cells.length && !fullMap) continue;
    const mapId = d.id === 'fogData' ? ensureDefault() : fogMap(d.id, d.path, mapOf);
    if (!mapId) continue;
    fog.push({ mapId, campaignId, fullMap, cells });
  }
  return fog;
}

function migrateTokens(r: Room): MigratedMaps['tokens'] {
  const { warn, collection, m, rtdb } = r;
  const tokens: MigratedMaps['tokens'] = [];
  const positions = obj(rtdb?.positions) ?? {};
  let skippedPositions = 0;
  for (const d of collection('characters')) {
    const character = m.characters.get(d.path);
    if (!character) {
      warn(`Token ${d.path} : personnage non importé`);
      continue;
    }
    if (!character.engaged) {
      warn(`Token ${d.path} : personnage non engagé dans la campagne`);
      continue;
    }
    const placed = tokensOf(r, d, character.id, obj(positions[d.id]));
    tokens.push(...placed.tokens);
    skippedPositions += placed.skipped;
  }
  if (skippedPositions)
    warn(`${skippedPositions} position(s) mémorisée(s) sur des scènes supprimées : ignorée(s)`);
  return tokens;
}

/**
 * Tokens d'un personnage : un PNJ sur sa scène ; un joueur sur sa scène courante, et à sa
 * dernière position sur les autres scènes. `skipped` : positions sur des scènes supprimées.
 */
function tokensOf(
  r: Room,
  d: FirestoreDoc,
  characterId: string,
  rt: Data | undefined,
): { tokens: MigratedMaps['tokens']; skipped: number } {
  const { mapOf, cityIds, partyCity } = r;
  const c = d.data ?? {};
  const player = c.type === 'joueurs';
  const rtCities = obj(rt?.positions) ?? {};
  const fsCities = obj(c.positions) ?? {};
  /** Position sur une scène, avec la priorité de l'ancienne carte (RTDB d'abord). */
  const posOn = (city: string | undefined): MapPoint => {
    const rtCity = city ? point(rtCities[city]) : undefined;
    if (rtCity) return rtCity;
    const rtBase = point(rt);
    if (rtBase) return rtBase;
    const fsCity = city ? point(fsCities[city]) : undefined;
    return fsCity ?? { x: coord(c.x) ?? 0, y: coord(c.y) ?? 0 };
  };
  const look = tokenLook(r, d, characterId, player);
  const tokens: MigratedMaps['tokens'] = [];
  if (!player) {
    const mapId = mapOf(c.cityId, `Token ${d.path}`);
    if (mapId)
      tokens.push({
        ...look,
        id: legacyUuid(`${d.path}#${toText(c.cityId) ?? 'fond'}`),
        mapId,
        pos: posOn(toText(c.cityId)),
        present: true,
      });
    return { tokens, skipped: 0 };
  }
  // Joueur : sa scène courante, et sa dernière position sur les autres scènes
  const current = toText(c.currentSceneId) ?? partyCity;
  const currentMap = mapOf(current, `Token ${d.path}`);
  const seen = new Set<string>();
  if (currentMap) {
    seen.add(currentMap);
    tokens.push({
      ...look,
      id: legacyUuid(`${d.path}#${current ?? 'fond'}`),
      mapId: currentMap,
      pos: posOn(current),
      present: true,
    });
  }
  let skipped = 0;
  for (const city of new Set([...Object.keys(rtCities), ...Object.keys(fsCities)])) {
    const mapId = cityIds.get(city);
    if (!mapId) skipped++;
    if (!mapId || seen.has(mapId)) continue;
    seen.add(mapId);
    tokens.push({
      ...look,
      id: legacyUuid(`${d.path}#${city}`),
      mapId,
      pos: posOn(city),
      present: false,
    });
  }
  return { tokens, skipped };
}

/** Apparence d'un token, commune à toutes ses scènes. */
function tokenLook(r: Room, d: FirestoreDoc, characterId: string, player: boolean) {
  const c = d.data ?? {};
  const image = toText(player ? (c.imageURLFinal ?? c.imageURL2) : c.imageURL2);
  return {
    campaignId: r.campaignId,
    characterId,
    scale: positive(c.scale, 100, 1),
    shape: c.shape === 'square' ? ('square' as const) : ('circle' as const),
    imageUrl: image && image !== toText(c.imageURL) ? image : null,
    visibility: tokenVisibility(c.visibility, player),
    visibleTo: r.translateIds(c.visibleToPlayerIds, `Token ${d.path}`),
    visionRadius: Math.min(2000, Math.max(0, num(c.visibilityRadius) ?? 100)),
    visionBoost: c.visionBoostActive === true,
    notes: text(c.notes, 10_000) ?? null,
    audio: tokenAudio(obj(c.audio)),
    interactions: Array.isArray(c.interactions)
      ? (c.interactions.filter((x) => obj(x)) as Record<string, unknown>[])
      : null,
  };
}

/** Son attaché à un token, s'il a une adresse. */
function tokenAudio(audio: Data | undefined) {
  const url = toText(audio?.url);
  if (!audio || !url) return null;
  const name = toText(audio.name);
  return {
    url,
    radius: bounded(audio.radius, 0, 100_000, 100),
    volume: bounded(audio.volume, 0, 1, 0.5),
    ...(typeof audio.loop === 'boolean' ? { loop: audio.loop } : {}),
    ...(name ? { name: name.slice(0, 200) } : {}),
  };
}

function migrateObjects(r: Room): MigratedMaps['objects'] {
  const { campaignId, warn, collection, mapOf, translateIds } = r;
  const objects: MigratedMaps['objects'] = [];
  for (const d of collection('objects')) {
    const o = d.data ?? {};
    const pos = point(o);
    const mapId = mapOf(o.cityId, `Objet ${d.path}`);
    if (!mapId) continue;
    if (!pos) {
      warn(`Objet ${d.path} sans position : ignoré`);
      continue;
    }
    if (toText(o.groupEntityId))
      warn(`Objet ${d.path} : entité de groupe non migrée (référence conservée)`);
    objects.push({
      id: legacyUuid(d.path),
      campaignId,
      mapId,
      name: text(o.name, 200) ?? '',
      kind: o.type === 'weapon' || o.type === 'item' ? o.type : 'decor',
      imageUrl: toText(o.imageUrl) ?? '',
      pos,
      width: positive(o.width, 100_000, 100),
      height: positive(o.height, 100_000, 100),
      rotation: num(o.rotation) ?? 0,
      isBackground: bool(o.isBackground, false),
      isLocked: bool(o.isLocked, false),
      visibility: objectVisibility(o.visibility),
      visibleTo: translateIds(o.visibleToPlayerIds, `Objet ${d.path}`),
      notes: text(o.notes, 10_000) ?? null,
      items: legacyItems(o.items),
      linkedId: toText(o.linkedId) ?? null,
      groupEntityId: toText(o.groupEntityId) ?? null,
    });
  }
  return objects;
}

function migrateLights(r: Room): MigratedMaps['lights'] {
  const { campaignId, collection, mapOf } = r;
  const lights: MigratedMaps['lights'] = [];
  for (const d of collection('lights')) {
    const l = d.data ?? {};
    const pos = point(l);
    const mapId = mapOf(l.cityId, `Lumière ${d.path}`);
    if (!mapId || !pos) continue;
    lights.push({
      id: legacyUuid(d.path),
      campaignId,
      mapId,
      name: text(l.name, 200) ?? '',
      pos,
      radius: bounded(l.radius, 0, 100_000, 10),
      visible: bool(l.visible, true),
    });
  }
  return lights;
}

function migrateMusicZones(r: Room): MigratedMaps['musicZones'] {
  const { campaignId, collection, mapOf } = r;
  const musicZones: MigratedMaps['musicZones'] = [];
  for (const d of collection('musicZones')) {
    const z = d.data ?? {};
    const pos = point(z);
    const mapId = mapOf(z.cityId, `Zone sonore ${d.path}`);
    if (!mapId || !pos) continue;
    musicZones.push({
      id: legacyUuid(d.path),
      campaignId,
      mapId,
      name: text(z.name, 200) ?? '',
      pos,
      radius: bounded(z.radius, 0, 100_000, 100),
      url: toText(z.url)?.slice(0, 2048) ?? null,
      volume: bounded(z.volume, 0, 1, 0.5),
      color: toText(z.color)?.slice(0, 50) ?? null,
    });
  }
  return musicZones;
}

function migratePortals(r: Room): MigratedMaps['portals'] {
  const { campaignId, warn, collection, mapOf, cityIds } = r;
  const portals: MigratedMaps['portals'] = [];
  for (const d of collection('portals')) {
    const p = d.data ?? {};
    const pos = point(p);
    const mapId = mapOf(p.cityId, `Portail ${d.path}`);
    if (!mapId || !pos) continue;
    const targetCity = toText(p.targetSceneId);
    const targetMapId = targetCity ? cityIds.get(targetCity) : undefined;
    if (targetCity && !targetMapId) warn(`Portail ${d.path} : scène cible supprimée`);
    const tx = coord(p.targetX);
    const ty = coord(p.targetY);
    const sceneChange = p.portalType !== 'same-map';
    // Changement de scène vers (0, 0) : l'ancienne app y lisait « le point d'arrivée de la scène »
    const spawn = sceneChange && tx === 0 && ty === 0;
    portals.push({
      id: legacyUuid(d.path),
      campaignId,
      mapId,
      name: text(p.name, 200) ?? '',
      pos,
      radius: bounded(p.radius, 0, 100_000, 50),
      kind: sceneChange ? 'scene_change' : 'same_map',
      targetMapId: targetMapId ?? null,
      target: tx !== undefined && ty !== undefined && !spawn ? { x: tx, y: ty } : null,
      icon: oneOf(p.iconType, PORTAL_ICONS) ?? null,
      color: toText(p.color)?.slice(0, 50) ?? null,
      visible: bool(p.visible, true),
    });
  }
  return portals;
}

const obstacleKind = (t: unknown): ObstacleKind | undefined => OBSTACLE_KINDS[String(t)];

/** Murs d'un polygone ou d'un rectangle legacy, un par côté (type et sens par côté). */
function ringWalls(
  key: string,
  o: Data,
  pts: MapPoint[],
  base: Omit<MigratedMaps['obstacles'][number], 'id' | 'kind' | 'geom'>,
): MigratedMaps['obstacles'] {
  const [a, b] = pts;
  const ring = o.type === 'rectangle' ? [a!, { x: b!.x, y: a!.y }, b!, { x: a!.x, y: b!.y }] : pts;
  if (ring.length < 3) return [];
  const edges = Array.isArray(o.edges) ? o.edges : [];
  return ring.map((p, i) => {
    const edge = obj(edges[i]);
    const kind = (o.type === 'polygon' && obstacleKind(edge?.type)) || 'wall';
    const geom = [p, ring[(i + 1) % ring.length]!];
    const direction = oneOf(edge?.direction, DIRECTIONS) ?? null;
    return {
      ...base,
      id: legacyUuid(`${key}_e${i}`),
      kind,
      geom,
      direction,
      blocksFrom: kind === 'one_way_wall' ? blocksFromDirection(geom, direction) : null,
      isOpen: bool(edge?.isOpen, false),
    };
  });
}

function migrateObstacles(r: Room): MigratedMaps['obstacles'] {
  const { campaignId, warn, code, rtdb, mapOf, merged } = r;
  const obstacles: MigratedMaps['obstacles'] = [];
  for (const [id, o] of merged(rtdb?.obstacles, 'obstacles')) {
    const key = `rooms/${code}/obstacles/${id}`;
    const mapId = mapOf(o.cityId, `Obstacle ${key}`);
    const pts = points(o.points);
    if (!mapId) continue;
    if (!pts || pts.length < 2) {
      warn(`Obstacle ${key} sans points : ignoré`);
      continue;
    }
    const common = { campaignId, mapId };
    const extra = {
      color: toText(o.color)?.slice(0, 50) ?? null,
      opacity: num(o.opacity) !== undefined ? bounded(o.opacity, 0, 1, 1) : 1,
      roomMode: oneOf(o.roomMode, ROOM_MODES) ?? null,
    };
    // Polygones et rectangles : éclatés en murs, comme la migration de l'ancienne carte
    if (o.type === 'polygon' || o.type === 'rectangle') {
      obstacles.push(...ringWalls(key, o, pts, { ...common, ...extra }));
      continue;
    }
    const kind = obstacleKind(o.type);
    if (!kind) {
      warn(`Obstacle ${key} de type inconnu : ignoré`);
      continue;
    }
    const direction = oneOf(o.direction, DIRECTIONS) ?? null;
    obstacles.push({
      ...common,
      ...extra,
      id: legacyUuid(key),
      kind,
      geom: pts,
      direction,
      blocksFrom: kind === 'one_way_wall' ? blocksFromDirection(pts, direction) : null,
      isOpen: bool(o.isOpen, false),
      isLocked: bool(o.isLocked, false),
    });
  }
  return obstacles;
}

function migrateDrawings(r: Room): MigratedMaps['drawings'] {
  const { campaignId, warn, code, m, rtdb, mapOf, merged } = r;
  const drawings: MigratedMaps['drawings'] = [];
  for (const [id, o] of merged(rtdb?.drawings, 'drawings')) {
    const key = `rooms/${code}/drawings/${id}`;
    const mapId = mapOf(o.cityId, `Dessin ${key}`);
    const pts = points(o.points ?? o.paths);
    if (!mapId) continue;
    if (!pts?.length || pts.length > 20_000) {
      warn(`Dessin ${key} sans points exploitables : ignoré`);
      continue;
    }
    drawings.push({
      id: legacyUuid(key),
      campaignId,
      mapId,
      createdBy: m.ownerId,
      tool: oneOf(o.type, DRAWING_TOOLS) ?? 'pen',
      geom: pts.length === 1 ? [pts[0]!, pts[0]!] : pts,
      color: toText(o.color)?.slice(0, 50) ?? '#000000',
      width: positive(o.width, 1000, 5),
      fill: toText(o.fill)?.slice(0, 50) ?? null,
      closed: bool(o.closed, false),
      smooth: bool(o.smooth, false),
    });
  }
  return drawings;
}

function migrateNotes(r: Room): MigratedMaps['notes'] {
  const { campaignId, code, m, rtdb, mapOf, merged } = r;
  const notes: MigratedMaps['notes'] = [];
  for (const [id, o] of merged(rtdb?.notes, 'text')) {
    const key = `rooms/${code}/notes/${id}`;
    const mapId = mapOf(o.cityId, `Texte ${key}`);
    const pos = point(o);
    if (!mapId || !pos) continue;
    notes.push({
      id: legacyUuid(key),
      campaignId,
      mapId,
      createdBy: m.ownerId,
      text: text(o.content ?? o.text, 5000) ?? '',
      pos,
      color: toText(o.color)?.slice(0, 50) ?? 'yellow',
      fontSize: positive(o.fontSize, 1000, 16),
      fontFamily: toText(o.fontFamily)?.slice(0, 100) ?? null,
    });
  }
  return notes;
}

function migrateMeasurements(r: Room): MigratedMaps['measurements'] {
  const { campaignId, warn, code, m, rtdb, mapOf } = r;
  const measurements: MigratedMaps['measurements'] = [];
  let transient = 0;
  for (const [id, o] of Object.entries(obj(rtdb?.measurements) ?? {})) {
    const g = obj(o);
    const key = `rooms/${code}/measurements/${id}`;
    const start = point(g?.start);
    const end = point(g?.end);
    const shape = oneOf(g?.type, MEASUREMENT_SHAPES);
    if (g?.permanent !== true || !start || !end || !shape) {
      transient++;
      continue;
    }
    const mapId = mapOf(g.cityId, `Gabarit ${key}`);
    if (!mapId) continue;
    const owner = toText(g.ownerId);
    measurements.push({
      id: legacyUuid(key),
      campaignId,
      mapId,
      createdBy: (owner && m.accounts?.get(owner)) || m.ownerId,
      shape,
      geom: [start, end],
      color: toText(g.color)?.slice(0, 50) ?? '#ffffff',
      skin: toText(g.skin)?.slice(0, 200) ?? null,
      options: Object.fromEntries(
        [
          'coneWidth',
          'coneAngle',
          'coneShape',
          'coneMode',
          'fixedLength',
          'unitName',
          'sourceObjectId',
        ]
          .filter((k) => g[k] !== undefined && g[k] !== null)
          .map((k) => [k, g[k]]),
      ),
    });
  }
  if (transient) warn(`${transient} mesure(s) éphémère(s) ou incomplète(s) non migrée(s)`);
  return measurements;
}

/** Genre d'obstacle de l'ancienne app → genre actuel (inconnu : undefined). */
const OBSTACLE_KINDS: Partial<Record<string, 'wall' | 'one_way_wall' | 'door' | 'window'>> = {
  wall: 'wall',
  'one-way-wall': 'one_way_wall',
  door: 'door',
  window: 'window',
};

/** Brouillard d'une carte nommée (`fog_<id>`) ; autre document : undefined. */
function fogMap<T>(
  id: string,
  path: string,
  mapOf: (legacyId: string, name: string) => T,
): T | undefined {
  return id.startsWith('fog_') ? mapOf(id.slice(4), `Brouillard ${path}`) : undefined;
}
