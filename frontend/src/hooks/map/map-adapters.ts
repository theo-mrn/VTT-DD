/**
 * Conversions entre le contrat de la carte (lib/maps.ts) et les formes de
 * données de l'ancienne carte (types.ts, visibility.ts, measurements.ts) que
 * le code repris manipule tel quel : `x`/`y` au lieu de `pos`, `type` au lieu
 * de `kind`, `cityId` pour le filtrage par scène…
 *
 * Dans l'autre sens, un changement écrit sous la forme de l'ancienne app
 * (`updateDoc(… 'objects', id, { x, y })`) est traduit en corps de requête.
 * Les champs sans équivalent côté serveur sont ignorés et signalés.
 */
import type { CampaignCharacter } from '@/lib/campaigns';
import type {
  GameMap,
  LayerInput,
  MapDrawing,
  MapFog,
  MapLight,
  MapMeasurement,
  MapMusicZone,
  MapNote,
  MapObjectItem,
  MapObstacle,
  MapPoint,
  MapPortal,
  MapToken,
  ObstacleKind,
  TokenFields,
  TokenVisibility,
} from '@/lib/maps';
import type { Obstacle } from '@/lib/visibility';
import type {
  Character,
  Layer,
  LightSource,
  MapObject,
  MapText,
  MusicZone,
  Portal,
  SavedDrawing,
  Scene,
} from '@/app/(campaigns)/campaigns/[id]/play/map/types';
import type { SharedMeasurement } from '@/app/(campaigns)/campaigns/[id]/play/map/measurements';

type Legacy = Record<string, unknown>;

const has = (o: Legacy, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

// ─── Calques (liste de l'ancienne carte, réglage MJ par scène) ───────────────

export const LOCAL_LAYERS_DEF: Layer[] = [
  { id: 'lights', label: 'Lumières', isVisible: true, order: 0 },
  { id: 'obstacles', label: 'Obstacles', isVisible: true, order: 1 },
  { id: 'notes', label: 'Notes', isVisible: true, order: 2 },
  { id: 'drawings', label: 'Dessins', isVisible: true, order: 3 },
  { id: 'objects', label: 'Objets', isVisible: true, order: 4 },
  { id: 'characters', label: 'Personnages', isVisible: true, order: 5 },
  { id: 'fog', label: 'Brouillard', isVisible: true, order: 6 },
  { id: 'music', label: 'Musique (Zones)', isVisible: true, order: 7 },
];

export function toLegacyLayers(layers: Record<string, boolean> | null | undefined): Layer[] {
  return LOCAL_LAYERS_DEF.map((local) => ({
    ...local,
    isVisible: layers?.[local.id] ?? local.isVisible,
  }));
}

export function fromLegacyLayers(layers: Layer[]): Record<string, boolean> {
  return Object.fromEntries(
    layers.filter((l) => /^[a-z_]{1,30}$/.test(l.id)).map((l) => [l.id, l.isVisible] as const),
  );
}

// ─── Scènes ──────────────────────────────────────────────────────────────────

export function toLegacyScene(m: GameMap): Scene & Legacy {
  return {
    id: m.id,
    name: m.name,
    description: m.description ?? undefined,
    visibleToPlayers: m.visibleToPlayers,
    backgroundUrl: m.backgroundUrl ?? undefined,
    groupId: m.groupId ?? undefined,
    spawnX: m.spawn?.x,
    spawnY: m.spawn?.y,
    weather: m.weather ?? undefined,
  };
}

/** Champs d'une scène (`cities/{id}`) vers une carte. */
export function fromLegacyScene(data: Legacy): Partial<GameMap> {
  const out: Legacy = {};
  if (has(data, 'name')) out.name = data.name;
  if (has(data, 'description')) out.description = (data.description as string) || null;
  if (has(data, 'visibleToPlayers')) out.visibleToPlayers = !!data.visibleToPlayers;
  if (has(data, 'backgroundUrl')) out.backgroundUrl = (data.backgroundUrl as string) || null;
  if (has(data, 'groupId')) out.groupId = (data.groupId as string) || null;
  if (has(data, 'spawnX') || has(data, 'spawnY')) {
    const x = data.spawnX;
    const y = data.spawnY;
    out.spawn = typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
  }
  if (has(data, 'weather')) {
    const w = data.weather as { type?: string; intensity?: number } | null;
    out.weather =
      w && typeof w.type === 'string' && w.type !== 'none'
        ? { type: w.type, intensity: num(w.intensity, 1) }
        : null;
  }
  return out as Partial<GameMap>;
}

// ─── Personnages (tokens) ────────────────────────────────────────────────────

const LEGACY_TOKEN_VISIBILITY: Record<string, TokenVisibility> = {
  visible: 'visible',
  public: 'visible',
  hidden: 'hidden',
  gm_only: 'hidden',
  ally: 'ally',
  custom: 'custom',
  invisible: 'invisible',
};

/** Image affichée du token : la sienne, sinon l'avatar du personnage. */
export function tokenImage(t: MapToken, info: CampaignCharacter | undefined): string {
  return t.imageUrl || info?.avatarUrl || '';
}

/**
 * Token + personnage engagé → personnage de l'ancienne carte. `id` reste
 * l'identifiant du personnage (comme l'ancienne app : persoId, visibleTo…),
 * `tokenId` porte celui du token pour les écritures.
 */
export function toLegacyCharacter(
  t: MapToken,
  info: CampaignCharacter | undefined,
  cityId: string | null,
): Character {
  const imageUrl = tokenImage(t, info);
  let image: HTMLImageElement | undefined;
  if (typeof Image !== 'undefined') {
    image = new Image();
    if (imageUrl) image.src = imageUrl;
  }
  return {
    id: t.characterId,
    tokenId: t.id,
    tokenVersion: t.version,
    mapId: t.mapId,
    currentSceneId: cityId,
    cityId: cityId ?? undefined,
    niveau: 1,
    name: info?.name ?? '',
    x: t.pos.x,
    y: t.pos.y,
    image: image as unknown as Character['image'],
    imageUrl,
    visibility: t.visibility,
    visibilityRadius: Math.min(num(t.visionRadius, 100), 2000),
    visionBoostActive: t.visionBoost,
    visibleToPlayerIds: t.visibleTo?.length ? t.visibleTo : undefined,
    type: info?.side === 'players' ? 'joueurs' : 'pnj',
    conditions: [],
    scale: t.scale || 1,
    Actions: [],
    audio: t.audio ?? undefined,
    interactions: (t.interactions as unknown as Character['interactions']) ?? undefined,
    shape: t.shape || 'circle',
    notes: t.notes ?? undefined,
  };
}

/**
 * Champs de l'ancienne fiche de carte à ignorer sans rien signaler : identifiants et valeurs
 * dérivées que toLegacyCharacter ajoute (image affichée, carte, scène…). Les autres champs sans
 * équivalent (stats, nom, états) sont signalés « Bientôt disponible ».
 */
export const IGNORED_CHARACTER_FIELDS = new Set([
  'id',
  'type',
  'tokenId',
  'tokenVersion',
  'mapId',
  'currentSceneId',
  'cityId',
  'positions',
  'niveau',
  'name',
  'image',
  'imageUrl',
  'Actions',
  'Race',
]);

/**
 * Changement d'un personnage de l'ancienne carte (`cartes/{r}/characters/{id}`)
 * vers un PATCH de token. `ignored` : champs sans équivalent (stats, états).
 */
export function fromLegacyCharacter(data: Legacy): {
  body: Partial<TokenFields>;
  ignored: string[];
} {
  const body: Partial<TokenFields> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    switch (key) {
      case 'x':
      case 'y':
        break;
      case 'visibility':
        body.visibility = LEGACY_TOKEN_VISIBILITY[String(value)] ?? 'visible';
        break;
      case 'visibleToPlayerIds':
        body.visibleTo = Array.isArray(value) ? (value as string[]) : [];
        break;
      case 'visibilityRadius': {
        const r = typeof value === 'string' ? parseFloat(value) : Number(value);
        if (Number.isFinite(r)) body.visionRadius = r;
        break;
      }
      case 'visionBoostActive':
        body.visionBoost = !!value;
        break;
      case 'scale':
        body.scale = num(value, 1);
        break;
      case 'shape':
        body.shape = value === 'square' ? 'square' : 'circle';
        break;
      case 'notes':
        body.notes = (value as string) || null;
        break;
      case 'audio':
        body.audio = (value as TokenFields['audio']) ?? null;
        break;
      case 'interactions':
        body.interactions = (value as TokenFields['interactions']) ?? null;
        break;
      case 'imageURL':
      case 'imageURL2':
      case 'imageURLFinal':
        body.imageUrl = (value as string) || null;
        break;
      default:
        ignored.push(key);
    }
  }
  if (has(data, 'x') && has(data, 'y')) body.pos = { x: Number(data.x), y: Number(data.y) };
  return { body, ignored };
}

// ─── Objets ──────────────────────────────────────────────────────────────────

const OBJECT_KIND: Record<string, MapObjectItem['kind']> = {
  decors: 'decor',
  decor: 'decor',
  weapon: 'weapon',
  item: 'item',
};

export function toLegacyObject(o: MapObjectItem, cityId: string | null): MapObject {
  return {
    id: o.id,
    x: o.pos.x,
    y: o.pos.y,
    width: o.width || 100,
    height: o.height || 100,
    rotation: o.rotation || 0,
    imageUrl: o.imageUrl || '',
    name: o.name ?? '',
    cityId,
    isBackground: o.isBackground || false,
    isLocked: o.isLocked || false,
    visibility: o.visibility || undefined,
    type: o.kind === 'decor' ? 'decors' : o.kind,
    visibleToPlayerIds: o.visibleTo?.length ? o.visibleTo : undefined,
    notes: o.notes ?? undefined,
    items: (o.items as unknown as MapObject['items']) || [],
    linkedId: o.linkedId ?? undefined,
    groupEntityId: o.groupEntityId ?? undefined,
  };
}

const OBJECT_VISIBILITY: Record<string, MapObjectItem['visibility']> = {
  visible: 'visible',
  public: 'visible',
  hidden: 'hidden',
  gm_only: 'hidden',
  invisible: 'hidden',
  custom: 'custom',
};

export function fromLegacyObject(data: Legacy): LayerInput<'objects'> {
  const out: LayerInput<'objects'> = {};
  if (has(data, 'x') || has(data, 'y')) out.pos = { x: num(data.x, 0), y: num(data.y, 0) };
  if (has(data, 'width')) out.width = num(data.width, 100);
  if (has(data, 'height')) out.height = num(data.height, 100);
  if (has(data, 'rotation')) out.rotation = num(data.rotation, 0);
  if (has(data, 'imageUrl')) out.imageUrl = (data.imageUrl as string) || '';
  if (has(data, 'name')) out.name = (data.name as string) ?? null;
  if (has(data, 'isBackground')) out.isBackground = !!data.isBackground;
  if (has(data, 'isLocked')) out.isLocked = !!data.isLocked;
  if (has(data, 'visibility') && data.visibility)
    out.visibility = OBJECT_VISIBILITY[String(data.visibility)] ?? 'visible';
  if (has(data, 'type')) out.kind = OBJECT_KIND[String(data.type)] ?? 'decor';
  if (has(data, 'visibleToPlayerIds'))
    out.visibleTo = Array.isArray(data.visibleToPlayerIds)
      ? (data.visibleToPlayerIds as string[])
      : [];
  if (has(data, 'notes')) out.notes = (data.notes as string) || null;
  if (has(data, 'items')) out.items = (data.items as Legacy[]) || [];
  if (has(data, 'linkedId')) out.linkedId = (data.linkedId as string) || null;
  if (has(data, 'groupEntityId')) out.groupEntityId = (data.groupEntityId as string) || null;
  return out;
}

// ─── Lumières ────────────────────────────────────────────────────────────────

export function toLegacyLight(l: MapLight, cityId: string | null): LightSource {
  return {
    id: l.id,
    x: l.pos.x,
    y: l.pos.y,
    name: l.name || 'Lumière',
    radius: l.radius || 10,
    visible: l.visible ?? true,
    cityId,
  };
}

export function fromLegacyLight(data: Legacy): LayerInput<'lights'> {
  const out: LayerInput<'lights'> = {};
  if (has(data, 'x') || has(data, 'y')) out.pos = { x: num(data.x, 0), y: num(data.y, 0) };
  if (has(data, 'name')) out.name = (data.name as string) ?? null;
  if (has(data, 'radius')) out.radius = num(data.radius, 10);
  if (has(data, 'visible')) out.visible = data.visible !== false;
  return out;
}

// ─── Obstacles ───────────────────────────────────────────────────────────────

const toLegacyKind = (k: ObstacleKind): Obstacle['type'] =>
  k === 'one_way_wall' ? 'one-way-wall' : k;

export function toLegacyObstacle(o: MapObstacle): Obstacle {
  return {
    id: o.id,
    type: toLegacyKind(o.kind || 'wall'),
    points: o.points || [],
    color: o.color ?? undefined,
    opacity: o.opacity ?? undefined,
    direction: o.direction ?? undefined,
    isOpen: o.isOpen,
    isLocked: o.isLocked,
    roomMode: o.roomMode ?? undefined,
  };
}

export function fromLegacyObstacle(data: Legacy): LayerInput<'obstacles'> {
  const out: LayerInput<'obstacles'> = {};
  if (has(data, 'type')) {
    const t = String(data.type);
    out.kind = (t === 'one-way-wall' ? 'one_way_wall' : t) as ObstacleKind;
    if (!['wall', 'one_way_wall', 'door', 'window'].includes(out.kind)) out.kind = 'wall';
  }
  if (has(data, 'points')) out.points = (data.points as MapPoint[]) || [];
  if (has(data, 'direction')) out.direction = (data.direction as MapObstacle['direction']) ?? null;
  if (has(data, 'isOpen')) out.isOpen = !!data.isOpen;
  if (has(data, 'isLocked')) out.isLocked = !!data.isLocked;
  if (has(data, 'color')) out.color = (data.color as string) ?? null;
  if (has(data, 'opacity'))
    out.opacity = typeof data.opacity === 'number' ? (data.opacity as number) : null;
  if (has(data, 'roomMode')) out.roomMode = (data.roomMode as MapObstacle['roomMode']) ?? null;
  return out;
}

// ─── Dessins ─────────────────────────────────────────────────────────────────

export function toLegacyDrawing(d: MapDrawing): SavedDrawing {
  return {
    id: d.id,
    points: d.points,
    color: d.color || '#000000',
    width: d.width || 5,
    type: d.tool || 'pen',
  };
}

export function fromLegacyDrawing(data: Legacy): LayerInput<'drawings'> {
  const out: LayerInput<'drawings'> = {};
  const points = (data.points ?? data.paths) as MapPoint[] | undefined;
  if (points) out.points = points;
  if (has(data, 'type')) out.tool = (data.type as MapDrawing['tool']) || 'pen';
  if (has(data, 'color')) out.color = (data.color as string) || '#000000';
  if (has(data, 'width')) out.width = num(data.width, 5);
  if (has(data, 'fill')) out.fill = (data.fill as string) ?? null;
  if (has(data, 'closed')) out.closed = !!data.closed;
  if (has(data, 'smooth')) out.smooth = !!data.smooth;
  return out;
}

// ─── Textes ──────────────────────────────────────────────────────────────────

export function toLegacyNote(n: MapNote): MapText {
  return {
    id: n.id,
    text: n.text ?? '',
    x: n.pos.x || 0,
    y: n.pos.y || 0,
    color: n.color || 'yellow',
    fontSize: n.fontSize,
    fontFamily: n.fontFamily ?? undefined,
  };
}

export function fromLegacyNote(data: Legacy): LayerInput<'notes'> {
  const out: LayerInput<'notes'> = {};
  if (has(data, 'content') || has(data, 'text')) out.text = String(data.content ?? data.text ?? '');
  if (has(data, 'x') || has(data, 'y')) out.pos = { x: num(data.x, 0), y: num(data.y, 0) };
  if (has(data, 'color')) out.color = (data.color as string) || 'yellow';
  if (has(data, 'fontSize')) out.fontSize = num(data.fontSize, 16);
  if (has(data, 'fontFamily')) out.fontFamily = (data.fontFamily as string) || null;
  return out;
}

// ─── Zones sonores ───────────────────────────────────────────────────────────

export function toLegacyMusicZone(z: MapMusicZone, cityId: string | null): MusicZone {
  return {
    id: z.id,
    x: z.pos.x,
    y: z.pos.y,
    radius: z.radius,
    volume: z.volume,
    name: z.name ?? undefined,
    color: z.color ?? undefined,
    url: z.url,
    cityId,
  };
}

export function fromLegacyMusicZone(data: Legacy): LayerInput<'music-zones'> {
  const out: LayerInput<'music-zones'> = {};
  if (has(data, 'x') || has(data, 'y')) out.pos = { x: num(data.x, 0), y: num(data.y, 0) };
  if (has(data, 'name')) out.name = (data.name as string) ?? null;
  if (has(data, 'radius')) out.radius = num(data.radius, 200);
  if (has(data, 'url') || has(data, 'trackId'))
    out.url = ((data.url ?? data.trackId) as string) || null;
  if (has(data, 'volume')) out.volume = Math.min(1, Math.max(0, num(data.volume, 0.5)));
  if (has(data, 'color')) out.color = (data.color as string) ?? null;
  return out;
}

// ─── Portails ────────────────────────────────────────────────────────────────

export function toLegacyPortal(p: MapPortal, cityId: string | null): Portal {
  return {
    id: p.id,
    x: p.pos.x,
    y: p.pos.y,
    radius: p.radius,
    portalType: p.kind === 'same_map' ? 'same-map' : 'scene-change',
    targetSceneId: p.targetMapId ?? undefined,
    targetX: p.target?.x,
    targetY: p.target?.y,
    name: p.name ?? '',
    iconType: p.icon ?? undefined,
    visible: p.visible,
    color: p.color ?? undefined,
    cityId,
  };
}

export function fromLegacyPortal(data: Legacy): LayerInput<'portals'> {
  const out: LayerInput<'portals'> = {};
  if (has(data, 'x') || has(data, 'y')) out.pos = { x: num(data.x, 0), y: num(data.y, 0) };
  if (has(data, 'radius')) out.radius = num(data.radius, 50);
  if (has(data, 'portalType'))
    out.kind = data.portalType === 'same-map' ? 'same_map' : 'scene_change';
  if (has(data, 'targetSceneId')) out.targetMapId = (data.targetSceneId as string) || null;
  if (has(data, 'targetX') || has(data, 'targetY')) {
    const x = data.targetX;
    const y = data.targetY;
    out.target = typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
  }
  if (has(data, 'name')) out.name = (data.name as string) ?? null;
  if (has(data, 'iconType')) out.icon = (data.iconType as MapPortal['icon']) ?? null;
  if (has(data, 'visible')) out.visible = data.visible !== false;
  if (has(data, 'color')) out.color = (data.color as string) ?? null;
  return out;
}

// ─── Gabarits ────────────────────────────────────────────────────────────────

const MEASUREMENT_OPTIONS = [
  'unitName',
  'coneWidth',
  'coneAngle',
  'coneShape',
  'coneMode',
  'fixedLength',
  'sourceObjectId',
] as const;

export function toLegacyMeasurement(m: MapMeasurement, cityId: string | null): SharedMeasurement {
  const o = m.options ?? {};
  return {
    id: m.id,
    type: m.shape,
    start: m.start,
    end: m.end,
    ownerId: m.createdBy ?? 'unknown',
    cityId,
    color: m.color,
    unitName: typeof o.unitName === 'string' ? o.unitName : '',
    coneWidth: (o.coneWidth as number | null | undefined) ?? null,
    coneAngle: o.coneAngle as number | undefined,
    coneShape: o.coneShape as SharedMeasurement['coneShape'],
    coneMode: o.coneMode as SharedMeasurement['coneMode'],
    fixedLength: (o.fixedLength as number | null | undefined) ?? null,
    skin: m.skin,
    timestamp: Date.parse(m.updatedAt) || Date.now(),
    permanent: true,
    sourceObjectId: (o.sourceObjectId as string | undefined) ?? undefined,
  };
}

export function fromLegacyMeasurement(data: Legacy, current?: Legacy): LayerInput<'measurements'> {
  const out: LayerInput<'measurements'> = {};
  if (has(data, 'type')) out.shape = data.type as MapMeasurement['shape'];
  if (has(data, 'start') || has(data, 'end')) {
    out.start = (data.start ?? current?.start) as MapPoint;
    out.end = (data.end ?? current?.end) as MapPoint;
  }
  if (has(data, 'color')) out.color = (data.color as string) || '#FFD700';
  if (has(data, 'skin')) out.skin = (data.skin as string) || null;
  const options: Legacy = {};
  let anyOption = false;
  for (const k of MEASUREMENT_OPTIONS) {
    if (has(data, k)) {
      options[k] = data[k] ?? null;
      anyOption = true;
    }
  }
  if (anyOption) {
    const base = current ? pickOptions(current) : {};
    out.options = { ...base, ...options };
  }
  return out;
}

function pickOptions(m: Legacy): Legacy {
  const o: Legacy = {};
  for (const k of MEASUREMENT_OPTIONS) if (m[k] !== undefined) o[k] = m[k];
  return o;
}

// ─── Brouillard ──────────────────────────────────────────────────────────────

/**
 * Cases du serveur → grille de l'ancienne carte. Ses clés gardent l'espace
 * finale de `getCellKey` (shadows.tsx) : `"cx,cy "`.
 */
export function fogToGrid(f: MapFog | null | undefined): Map<string, boolean> {
  return new Map((f?.cells ?? []).map((c) => [`${c.trim()} `, true] as const));
}

/** Grille de l'ancienne carte → cases (clés sans espace, seulement les cases couvertes). */
export function gridToCells(grid: Map<string, boolean>): string[] {
  const cells: string[] = [];
  for (const [key, covered] of grid) if (covered) cells.push(key.replace(/\s+/g, ''));
  return cells;
}
