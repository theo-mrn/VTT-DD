/**
 * Contrat de la carte (docs/carte.md § 12, docs/api-map.md, docs/map.md) : schémas Zod et
 * types de tous les éléments posés sur une carte, de leurs entrées de création et de
 * modification, du chargement initial (`MapSnapshot`), des charges des événements
 * (`map.*`, `token.*`, `map_*`) et des messages éphémères `map.live` et `map.ping`.
 * Partagé par le service campaign (validation des routes) et le front (client typé).
 *
 * Conventions :
 *  - coordonnées du monde = pixels de l'image de fond, `{ x, y }` ;
 *  - chaque élément porte `version` (verrou optimiste : tout `PATCH` accepte `version` et
 *    répond 409 `version_conflict` si elle a changé) et `updatedAt` (ISO 8601) ;
 *  - les schémas d'élément (`MapToken`, `MapObject`…) décrivent les réponses ; les schémas
 *    `Create…` et `Update…` les corps de requête (stricts : une clé inconnue est refusée).
 *
 * Tout ce qui est ici fonctionne dans Node comme dans le navigateur.
 */
import { z } from 'zod';

// ─── Bases ───────────────────────────────────────────────────────────────────

/** Identifiant reçu dans une requête (UUID, rangé en minuscules comme en base). */
const InputId = (message = 'Identifiant invalide') =>
  z.uuid(message).transform((s) => s.toLowerCase());
/** Identifiant renvoyé par le service. */
const Id = z.string();

const Coordinate = z.number().finite().min(-1_000_000).max(1_000_000);

/** Point du monde, en pixels de l'image de fond. */
export const MapPoint = z.object({ x: Coordinate, y: Coordinate });
export type MapPoint = z.infer<typeof MapPoint>;

/** Liste de points bornée (ligne, polygone). */
export const mapPoints = (min: number, max: number) => z.array(MapPoint).min(min).max(max);

/** Version attendue par une écriture (facultative) : 409 `version_conflict` si elle a changé. */
export const ExpectedVersion = z.number().int().positive().optional();

/**
 * Média (image, vidéo, son) : URL https ou chemin absolu du site (bibliothèque d'actifs).
 * Comme l'ancienne carte, le MJ peut pointer vers un hébergeur tiers ; un envoi passe par
 * `POST /v1/campaigns/:id/media` (URL présignée, voir `MediaUploadRequest`).
 *
 * Exception : `http://` sur la boucle locale (`localhost`, `127.0.0.1`, `[::1]`), où le
 * stockage de développement sert les fichiers (`R2_PUBLIC_URL=http://localhost:8333/…`). Les
 * navigateurs tiennent cette origine pour sûre (pas de contenu mixte) ; aucun autre `http://`.
 */
const LOOPBACK_HTTP = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?\/\S*$/;

export const MediaUrl = z
  .string()
  .trim()
  .max(2048, '2048 caractères au plus')
  .refine((u) => /^https:\/\/\S+$/.test(u) || /^\/[^/]\S*$/.test(u) || LOOPBACK_HTTP.test(u), {
    message: 'URL https ou chemin absolu attendu',
  });

/** Couleur (donnée : `#rrggbb`, `#rrggbbaa`, nom CSS…). */
export const MapColor = z.string().trim().max(50);
const Label = z.string().trim().max(200);
const Timestamp = z.string();

const element = { id: Id, mapId: Id, version: z.number().int(), updatedAt: Timestamp };

// ─── Énumérations ────────────────────────────────────────────────────────────

/**
 * Visibilité d'un token : `visible` (défaut), `hidden` (vu seulement dans un rayon de
 * vision ou éclairé), `ally` (toujours vu, et voit pour les joueurs), `custom` (vu des
 * joueurs dont un personnage est dans `visibleTo`), `invisible` (MJ seulement).
 */
export const MapTokenVisibility = z.enum(['visible', 'hidden', 'ally', 'custom', 'invisible']);
export type MapTokenVisibility = z.infer<typeof MapTokenVisibility>;
export const MapObjectVisibility = z.enum(['visible', 'hidden', 'custom']);
export type MapObjectVisibility = z.infer<typeof MapObjectVisibility>;
export const MapTokenShape = z.enum(['circle', 'square']);
export type MapTokenShape = z.infer<typeof MapTokenShape>;
export const MapObjectKind = z.enum(['decor', 'weapon', 'item']);
export type MapObjectKind = z.infer<typeof MapObjectKind>;
export const MapObstacleKind = z.enum(['wall', 'one_way_wall', 'door', 'window']);
export type MapObstacleKind = z.infer<typeof MapObstacleKind>;
/**
 * Côté bloquant d'un mur à sens unique, relatif au sens de tracé a→b : bloque la vue d'un
 * observateur situé de ce côté. Côté gauche : `cross(b − a, p − a) < 0` (y vers le bas).
 */
export const MapBlocksFrom = z.enum(['left', 'right']);
export type MapBlocksFrom = z.infer<typeof MapBlocksFrom>;
/** Réglage legacy des murs (ombre de pièce) : conservé, sans effet sur la visibilité. */
export const MapRoomMode = z.enum(['room', 'individual']);
export type MapRoomMode = z.infer<typeof MapRoomMode>;
export const MapDrawingTool = z.enum(['pen', 'brush', 'eraser', 'line', 'rectangle', 'circle']);
export type MapDrawingTool = z.infer<typeof MapDrawingTool>;
export const MapPortalKind = z.enum(['scene_change', 'same_map']);
export type MapPortalKind = z.infer<typeof MapPortalKind>;
export const MapPortalIcon = z.enum(['stairs', 'door', 'portal', 'ladder']);
export type MapPortalIcon = z.infer<typeof MapPortalIcon>;
export const MapMeasurementShape = z.enum(['line', 'cone', 'circle', 'cube']);
export type MapMeasurementShape = z.infer<typeof MapMeasurementShape>;
export const MapFogShape = z.enum(['circle', 'rect', 'polygon']);
export type MapFogShape = z.infer<typeof MapFogShape>;
/** `fog` ajoute du brouillard, `clear` en retire ; zones appliquées dans l'ordre (`order`). */
export const MapFogMode = z.enum(['fog', 'clear']);
export type MapFogMode = z.infer<typeof MapFogMode>;
/** Camp d'un personnage engagé dans la campagne. */
export const CampaignSide = z.enum(['players', 'enemies', 'allies']);
export type CampaignSide = z.infer<typeof CampaignSide>;

// ─── Scènes (cartes) ─────────────────────────────────────────────────────────

/**
 * Mémoire de l'exploration d'une scène (docs/exploration.md) : `off` (coupée) ou `party` (ce
 * que le groupe a vu reste montré, grisé, pour tous ses joueurs).
 */
export const MapExplorationMode = z.enum(['off', 'party']);
export type MapExplorationMode = z.infer<typeof MapExplorationMode>;

/**
 * Vent de la météo : `direction`, où va le vent, en degrés (0 vers l'est, 90 vers le sud, sens
 * horaire à l'écran) ; `strength`, 0 (calme) à 1 (tempête).
 */
export const MapWeatherWind = z.strictObject({
  direction: z.number().min(0).max(360),
  strength: z.number().min(0).max(1),
});
export type MapWeatherWind = z.infer<typeof MapWeatherWind>;

/**
 * Météo d'une scène (docs/carte.md § 10, Météo), la même pour tous. `type` : l'effet (`rain`,
 * `storm`, `snow`, `blizzard`, `fog`, `leaves`, `embers`, `sandstorm`, `alert`, `static`) ; un
 * type inconnu est gardé et n'affiche rien. `intensity` : 0 à 2, 1 étant l'ancien maximum (au
 * milieu du curseur) ; jusqu'à 10 accepté, compris comme 2. `wind` absent : le vent de l'effet.
 */
export const MapWeather = z.strictObject({
  type: z.string().trim().min(1).max(50),
  intensity: z.number().min(0).max(10),
  wind: MapWeatherWind.optional(),
});
export type MapWeather = z.infer<typeof MapWeather>;

/**
 * Familles affichées (réglage MJ, ex-`layers`) : lights, obstacles, notes, drawings, objects,
 * characters, fog, music. À ne pas confondre avec les calques du MJ (`MapLayer`).
 */
export const MapDisplaySetting = z.record(z.string().regex(/^[a-z_]{1,30}$/), z.boolean());
export type MapDisplaySetting = z.infer<typeof MapDisplaySetting>;

/**
 * Quadrillage d'une scène (docs/carte.md § 4) : en pixels du monde (du fond), donc au même
 * endroit pour tous, quels que soient l'écran et le zoom. Une scène en a plusieurs au plus
 * `MAP_GRIDS_MAX` ; sa grille de jeu (`primary`, une au plus) donne la case de la scène :
 * taille des tokens, rayons en unités, aimantation (`scenePixelsPerUnit`).
 */
export const MapGrid = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Identifiant de grille invalide'),
  name: z.string().trim().max(60, '60 caractères au plus'),
  /** Côté d'une case, en pixels du monde. */
  size: z.number().min(4, '4 px au moins').max(10_000),
  /** Origine du quadrillage (pixels du monde) : une ligne passe par `offsetX`, une par `offsetY`. */
  offsetX: z.number().min(-100_000).max(100_000),
  offsetY: z.number().min(-100_000).max(100_000),
  color: MapColor,
  opacity: z.number().min(0).max(1),
  /** Épaisseur du trait, en pixels d'écran (la même à tous les zooms). */
  thickness: z.number().min(0.5).max(8),
  /** Montrée aux joueurs ; la grille de jeu compte pour eux même cachée. */
  visibleToPlayers: z.boolean(),
  /** Grille de jeu de la scène. */
  primary: z.boolean(),
});
export type MapGrid = z.infer<typeof MapGrid>;

/** Un seul quadrillage par scène, celui du jeu (docs/carte.md § 4, migration 0033). */
export const MAP_GRIDS_MAX = 1;

export const MapGrids = z
  .array(MapGrid)
  .max(MAP_GRIDS_MAX, 'Un seul quadrillage par scène')
  .refine((gs) => gs.every((g) => g.primary), 'Le quadrillage de la scène est sa grille de jeu');

/** Grille de jeu d'une scène, null sans elle. */
export function playGridOf(
  scene: { grids?: readonly MapGrid[] | null } | null | undefined,
): MapGrid | null {
  return scene?.grids?.find((g) => g.primary) ?? null;
}

/** Sans grille de jeu, cases sur la largeur du fond (repli proportionnel à l'image). */
export const FALLBACK_CELLS_ACROSS = 25;

/**
 * Case d'une scène, en pixels du monde : sa grille de jeu ; sinon une part de la largeur du
 * fond (`FALLBACK_CELLS_ACROSS` cases) : une même carte en deux résolutions garde des tokens à
 * la même échelle ; sans taille connue, le réglage de la campagne (`pixelsPerUnit`, 50 par
 * défaut). Même règle pour le client et le serveur.
 */
export function scenePixelsPerUnit(
  scene:
    | { grids?: readonly MapGrid[] | null; width?: number | null; height?: number | null }
    | null
    | undefined,
  settings: { pixelsPerUnit?: number | null } | null | undefined,
): number {
  const grid = playGridOf(scene);
  if (grid && grid.size > 0) return grid.size;
  const width = scene?.width;
  if (typeof width === 'number' && width > 0)
    return Math.round((width / FALLBACK_CELLS_ACROSS) * 100) / 100;
  const ppu = settings?.pixelsPerUnit;
  return typeof ppu === 'number' && ppu > 0 ? ppu : 50;
}

/**
 * Distance par case (docs/carte.md § 4) : « 1 case = 1,5 m ». Les portées restent stockées en
 * cases ; toute distance affichée vaut cases × `unitsPerCell`, suivie de `unitName`.
 */
export const MapScale = z.strictObject({
  unitsPerCell: z.number().positive().max(100_000),
  unitName: z.string().trim().min(1).max(20),
});
export type MapScale = z.infer<typeof MapScale>;

/** Distance d'une scène : la sienne (`maps.scale`), sinon celle de la campagne. */
export function sceneScale(
  scene: { scale?: MapScale | null } | null | undefined,
  settings: { unitsPerCell?: number | null; unitName?: string | null } | null | undefined,
): MapScale {
  if (scene?.scale) return scene.scale;
  const per = settings?.unitsPerCell;
  return {
    unitsPerCell: typeof per === 'number' && per > 0 ? per : 1.5,
    unitName: settings?.unitName?.trim() || 'm',
  };
}

/**
 * Décompte des cases en diagonale (règle de la table, choisie par le MJ) : une case
 * (`chebyshev`), alternées 1-2-1 (`alternating`), sans diagonale (`manhattan`), pas de
 * décompte (`off`, distance seule).
 */
export const MapDiagonals = z.enum(['chebyshev', 'alternating', 'manhattan', 'off']);
export type MapDiagonals = z.infer<typeof MapDiagonals>;

/**
 * Voix à la table sur une scène (docs/voix.md § 4) : tout le monde s'entend (`table`), ou selon
 * la distance et les murs (`proximity`). Portées en cases de la scène : plein volume jusqu'à
 * `clearRange`, silence à `maxRange`.
 */
export const MapVoiceMode = z.enum(['table', 'proximity']);
export type MapVoiceMode = z.infer<typeof MapVoiceMode>;

const MapVoiceShape = z.strictObject({
  mode: MapVoiceMode,
  clearRange: z.number().min(0).max(200),
  maxRange: z.number().min(1).max(500),
});
export const MapVoice = MapVoiceShape.refine((v) => v.maxRange > v.clearRange, {
  message: 'La portée maximale doit dépasser la portée claire',
  path: ['maxRange'],
});
export type MapVoice = z.infer<typeof MapVoiceShape>;

/** Réglage d'une scène qui n'en a pas : tout le monde s'entend. */
export const DEFAULT_MAP_VOICE: MapVoice = { mode: 'table', clearRange: 6, maxRange: 24 };

export const MapScene = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  groupId: Id.nullable(),
  /** Fond : image (png, jpeg, webp, avif, gif) ou vidéo (webm, mp4). */
  backgroundUrl: z.string().nullable(),
  /** Fond global de l'ancienne app (aucune scène sélectionnée), un par campagne au plus. */
  isDefault: z.boolean(),
  visibleToPlayers: z.boolean(),
  spawn: MapPoint.nullable(),
  /** Taille naturelle du fond (taille du monde), envoyée par le client du MJ. */
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  weather: MapWeather.nullable(),
  display: MapDisplaySetting,
  /** Toute la carte est sous le brouillard au départ ; les zones s'appliquent ensuite. */
  fogFull: z.boolean(),
  /** Quadrillages (MJ) ; la grille de jeu donne la case de la scène. */
  grids: z.array(MapGrid),
  /** Mémoire de l'exploration (docs/exploration.md) : coupée, ou partagée par le groupe. */
  exploration: MapExplorationMode,
  /** Voix à la table (docs/voix.md § 4) ; absente (ancienne donnée) : mode table. */
  voice: MapVoiceShape.default(DEFAULT_MAP_VOICE),
  /** Distance par case propre à la scène ; null : celle de la campagne. */
  scale: MapScale.nullable().default(null),
  version: z.number().int(),
  updatedAt: Timestamp,
});
export type MapScene = z.infer<typeof MapScene>;

export const MapSceneFields = z.strictObject({
  name: z.string().trim().min(1, 'Nom requis').max(100),
  description: z.string().trim().max(2000, '2000 caractères au plus'),
  groupId: InputId('Identifiant de dossier invalide').nullable(),
  backgroundUrl: MediaUrl.nullable(),
  isDefault: z.boolean(),
  visibleToPlayers: z.boolean(),
  spawn: MapPoint.nullable(),
  width: z.number().int().min(1).max(100_000).nullable(),
  height: z.number().int().min(1).max(100_000).nullable(),
  weather: MapWeather.nullable(),
  display: MapDisplaySetting,
  fogFull: z.boolean(),
  grids: MapGrids,
  exploration: MapExplorationMode,
  voice: MapVoice,
  scale: MapScale.nullable(),
});

/** `width` et `height` vont ensemble. */
export const CreateMapScene = MapSceneFields.partial()
  .required({ name: true })
  .refine((b) => (b.width == null) === (b.height == null), {
    message: 'width et height vont ensemble',
  });
export type CreateMapScene = z.input<typeof CreateMapScene>;

export const UpdateMapScene = MapSceneFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapScene = z.input<typeof UpdateMapScene>;

/**
 * Mise à l'échelle de toute la géométrie de la carte (fond changé de taille) : positions,
 * tailles, rayons en pixels, points ; `x × sx`, `y × sy`, longueurs × √(sx·sy).
 */
export const RescaleMap = z.strictObject({
  sx: z.number().positive().max(1000),
  sy: z.number().positive().max(1000),
});
export type RescaleMap = z.infer<typeof RescaleMap>;

// ─── Dossiers de scènes ──────────────────────────────────────────────────────

export const MapGroup = z.object({
  id: Id,
  name: z.string(),
  sortOrder: z.number(),
  version: z.number().int(),
});
export type MapGroup = z.infer<typeof MapGroup>;

const MapGroupFields = z.strictObject({
  name: z.string().trim().min(1, 'Nom requis').max(100),
  sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export const CreateMapGroup = MapGroupFields.partial().required({ name: true });
export type CreateMapGroup = z.input<typeof CreateMapGroup>;
export const UpdateMapGroup = MapGroupFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapGroup = z.input<typeof UpdateMapGroup>;

// ─── Calques du MJ (niveaux) ─────────────────────────────────────────────────

/**
 * Calque du MJ : pile ordonnée par carte (`sortOrder` croissant : du bas vers le haut).
 * Tokens et objets appartiennent à un calque (`layerId`) et y ont un ordre `z` ; dessins
 * et textes aussi, ou aucun (`layerId` nul : annotation au-dessus de l'ombre). Une carte
 * naît avec « Sol », « Objets » et « Personnages ». Le contenu d'un calque masqué aux
 * joueurs ne leur est jamais envoyé (sauf leurs propres tokens).
 */
export const MapLayer = z.object({
  ...element,
  name: z.string(),
  sortOrder: z.number(),
  visibleToPlayers: z.boolean(),
  /** Ses éléments ne se sélectionnent plus (on clique à travers). */
  locked: z.boolean(),
  /** 0 à 1. */
  opacity: z.number(),
  /**
   * Calque par défaut d'une sorte : `ground` (Sol), `objects` (objet posé sans calque),
   * `tokens` (token posé sans calque) ; null sinon. Sans calque de ce rôle, le plus haut.
   */
  role: z.enum(['ground', 'objects', 'tokens']).nullable(),
});
export type MapLayer = z.infer<typeof MapLayer>;

export const MapLayerFields = z.strictObject({
  name: z.string().trim().min(1, 'Nom requis').max(100),
  sortOrder: z.number().finite(),
  visibleToPlayers: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
});
/** Sans `sortOrder` : en haut de la pile. */
export const CreateMapLayer = MapLayerFields.partial().required({ name: true });
export type CreateMapLayer = z.input<typeof CreateMapLayer>;
export const UpdateMapLayer = MapLayerFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapLayer = z.input<typeof UpdateMapLayer>;

/**
 * `DELETE …/layers/:itemId?moveTo=` : le contenu descend dans le calque du dessous (celui
 * du dessus pour le plus bas), ou va dans `moveTo`. Le dernier calque ne se supprime pas.
 */
export const DeleteMapLayerQuery = z.object({
  moveTo: InputId('Identifiant de calque invalide').optional(),
});
export type DeleteMapLayerQuery = z.infer<typeof DeleteMapLayerQuery>;

/** Sortes d'éléments rangés dans les calques. */
export const MapArrangeKind = z.enum(['token', 'object', 'drawing', 'note']);
export type MapArrangeKind = z.infer<typeof MapArrangeKind>;

/** Ordre dans un calque : nombre réel (un réordonnancement prend un `z` entre deux voisins). */
const LayerZ = z.number().finite().min(-1e12).max(1e12);

/**
 * `POST /maps/:mapId/arrange` : calque et ordre d'une sélection, en une transaction (MJ ;
 * un joueur : ses dessins et textes, vers un calque ni verrouillé ni masqué, ou aucun).
 */
export const ArrangeMapItems = z.strictObject({
  items: z
    .array(
      z.strictObject({
        kind: MapArrangeKind,
        id: InputId(),
        /** Nul : annotation (dessins et textes seulement). */
        layerId: InputId('Identifiant de calque invalide').nullable(),
        z: LayerZ,
      }),
    )
    .min(1)
    .max(500),
});
export type ArrangeMapItems = z.input<typeof ArrangeMapItems>;

/** Réponse de `…/arrange` : les éléments modifiés, par sorte. */
export interface MapArrangeResult {
  tokens: MapToken[];
  objects: MapObject[];
  drawings: MapDrawing[];
  notes: MapNote[];
}

// ─── Réglages de carte (campagne) ────────────────────────────────────────────

export const MapSettings = z.object({
  campaignId: Id,
  /** Scène où se trouve le groupe. */
  partyMapId: Id.nullable(),
  tokenScale: z.number(),
  /** Pixels du monde pour une unité de jeu (une case). */
  pixelsPerUnit: z.number(),
  unitName: z.string(),
  /** Distance d'une case dans `unitName` (« 1 case = 1,5 m »). */
  unitsPerCell: z.number(),
  /** Décompte des diagonales, règle de la table. */
  diagonals: MapDiagonals,
  /** Opacité de l'obscurité hors de vue (1 = noir). */
  shadowOpacity: z.number(),
  dungeonMode: z.boolean(),
  /** Musique d'ambiance en cours : `{ videoId, videoTitle, templateId, isPlaying, … }`. */
  music: z.record(z.string(), z.unknown()).nullable(),
  /** 0 tant que la campagne n'a pas de réglage enregistré. */
  version: z.number().int(),
});
export type MapSettings = z.infer<typeof MapSettings>;

export const UpdateMapSettings = z
  .strictObject({
    partyMapId: InputId('Identifiant de carte invalide').nullable(),
    tokenScale: z.number().positive().max(100),
    pixelsPerUnit: z.number().positive().max(100_000),
    unitName: z.string().trim().min(1).max(20),
    unitsPerCell: z.number().positive().max(100_000),
    diagonals: MapDiagonals,
    shadowOpacity: z.number().min(0).max(1),
    dungeonMode: z.boolean(),
    music: z.record(z.string(), z.unknown()).nullable(),
  })
  .partial()
  .extend({ version: z.number().int().nonnegative().optional() });
export type UpdateMapSettings = z.input<typeof UpdateMapSettings>;

// ─── Tokens ──────────────────────────────────────────────────────────────────

export const MapTokenAudio = z.object({
  url: MediaUrl,
  radius: z.number().min(0).max(100_000),
  volume: z.number().min(0).max(1),
  loop: z.boolean().optional(),
  name: z.string().max(200).optional(),
});
export type MapTokenAudio = z.infer<typeof MapTokenAudio>;

/**
 * Personnage engagé posé sur une carte. Nom, avatar et statistiques : le personnage
 * (`characterId`, service character) ; `imageUrl` n'est renseigné que si le token a sa
 * propre image. `visionRadius` en pixels du monde (×3 avec `visionBoost`).
 */
export const MapToken = z.object({
  ...element,
  characterId: Id,
  /** Calque du MJ et ordre dans ce calque. */
  layerId: Id,
  z: z.number(),
  pos: MapPoint,
  scale: z.number(),
  shape: MapTokenShape,
  imageUrl: z.string().nullable(),
  visibility: MapTokenVisibility,
  /** Personnages qui voient le token (visibilité `custom`). */
  visibleTo: z.array(Id),
  visionRadius: z.number(),
  visionBoost: z.boolean(),
  notes: z.string().nullable(),
  audio: z.looseObject({ url: z.string(), radius: z.number(), volume: z.number() }).nullable(),
  /** Marchand, jeu, butin (forme de l'ancienne app). */
  interactions: z.array(z.record(z.string(), z.unknown())).nullable(),
});
export type MapToken = z.infer<typeof MapToken>;

export const MapTokenFields = z.strictObject({
  /** Absent à la création : calque par défaut des tokens, en haut de la pile. */
  layerId: InputId('Identifiant de calque invalide'),
  z: LayerZ,
  pos: MapPoint,
  scale: z.number().positive().max(100),
  shape: MapTokenShape,
  imageUrl: MediaUrl.nullable(),
  visibility: MapTokenVisibility,
  visibleTo: z.array(InputId('Identifiant de personnage invalide')).max(100),
  visionRadius: z.number().min(0).max(100_000),
  visionBoost: z.boolean(),
  notes: z.string().max(10_000).nullable(),
  audio: MapTokenAudio.nullable(),
  interactions: z.array(z.record(z.string(), z.unknown())).max(50).nullable(),
});

/** Poser un personnage engagé (MJ). */
export const CreateMapToken = MapTokenFields.partial().extend({
  characterId: InputId('Identifiant de personnage invalide'),
  pos: MapPoint,
});
export type CreateMapToken = z.input<typeof CreateMapToken>;

/** Joueur : `pos` et `visionBoost` de ses personnages seulement. */
export const UpdateMapToken = MapTokenFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapToken = z.input<typeof UpdateMapToken>;

/** Fin de glisser d'une sélection : un `token.moved` par token. */
export const MoveMapTokens = z.strictObject({
  moves: z
    .array(
      z.strictObject({
        tokenId: InputId('Identifiant de token invalide'),
        pos: MapPoint,
        version: ExpectedVersion,
      }),
    )
    .min(1)
    .max(200),
});
export type MoveMapTokens = z.input<typeof MoveMapTokens>;

/** Amener des personnages sur la carte ; sans `characterIds` : tout le groupe (MJ). */
export const TravelToMap = z.strictObject({
  characterIds: z.array(InputId('Identifiant de personnage invalide')).min(1).max(200).optional(),
  pos: MapPoint.optional(),
});
export type TravelToMap = z.input<typeof TravelToMap>;

export const MapTokenNear = MapToken.extend({ distance: z.number() });
export type MapTokenNear = z.infer<typeof MapTokenNear>;

// ─── PNJ en une fois ─────────────────────────────────────────────────────────

/** Valeur saisie d'un attribut (création rapide) : clé d'attribut du système → valeur. */
export const NpcQuickValues = z.record(
  z.string().regex(/^[A-Za-z0-9_]{1,60}$/),
  z.union([z.number().finite(), z.string().max(2000), z.boolean()]),
);

/**
 * Origine des PNJ : un modèle de la campagne (`npc-templates`), une créature du bestiaire
 * de référence du système, ou une création rapide (nom, image, type d'entité, valeurs
 * saisies lues dans la présentation du système).
 */
export const NpcSource = z.union([
  z.strictObject({ templateId: InputId('Identifiant de modèle invalide') }),
  z.strictObject({
    bestiary: z.strictObject({
      systemeId: z.string().min(1).max(200),
      key: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    quick: z.strictObject({
      name: z.string().trim().min(1, 'Nom requis').max(100),
      imageUrl: MediaUrl.nullable().optional(),
      type: z.string().min(1).max(200),
      valeurs: NpcQuickValues.optional(),
    }),
  }),
]);
export type NpcSource = z.input<typeof NpcSource>;

/**
 * `POST /v1/campaigns/:id/maps/:mapId/npcs` (MJ) : `count` vrais personnages (fiche
 * complète, possédés par le MJ, `templateId` gardé), engagés (camp `enemies` par défaut) et
 * posés en grille serrée autour de `pos`. Noms suffixés : « Gobelin », « Gobelin 2 »…
 */
export const CreateMapNpcs = z.strictObject({
  source: NpcSource,
  count: z.number().int().min(1).max(20).default(1),
  pos: MapPoint,
  /** Calque où les poser (absent : le calque par défaut des tokens), en haut de sa pile. */
  layerId: InputId('Identifiant de calque invalide').optional(),
  side: CampaignSide.optional(),
  visibility: MapTokenVisibility.optional(),
  scale: z.number().positive().max(100).optional(),
  shape: MapTokenShape.optional(),
});
export type CreateMapNpcs = z.input<typeof CreateMapNpcs>;

/** Personnage créé pour un PNJ posé. */
export const MapNpcCharacter = z.object({
  id: Id,
  name: z.string(),
  avatarUrl: z.string().nullable(),
  templateId: Id.nullable(),
});
export type MapNpcCharacter = z.infer<typeof MapNpcCharacter>;

/** Réponse de `…/npcs` et de `…/tokens/:tokenId/duplicate` : tokens et personnages, dans l'ordre. */
export const MapNpcsCreated = z.object({
  items: z.array(MapToken),
  characters: z.array(MapNpcCharacter),
});
export type MapNpcsCreated = z.infer<typeof MapNpcsCreated>;

/** Clone l'état actuel d'un PNJ (fiche comprise) `count` fois autour de `pos` (MJ). */
export const DuplicateMapToken = z.strictObject({
  pos: MapPoint,
  count: z.number().int().min(1).max(20).default(1),
});
export type DuplicateMapToken = z.input<typeof DuplicateMapToken>;

/** `DELETE …/tokens/:tokenId?character=delete` : supprime aussi le personnage (PNJ du MJ). */
export const DeleteMapTokenQuery = z.object({ character: z.enum(['keep', 'delete']).optional() });
export type DeleteMapTokenQuery = z.infer<typeof DeleteMapTokenQuery>;

/**
 * Annuler la suppression de PNJ (MJ, Ctrl+Z) : la fiche est restaurée telle quelle, le PNJ
 * réengagé dans son camp, son token reposé avec son identifiant et ses réglages d'avant.
 * Possible tant que la purge ne l'a pas effacé (`NPC_UNDO_HOURS`).
 */
export const RestoreMapNpcs = z.strictObject({
  items: z
    .array(
      MapTokenFields.partial()
        .extend({
          tokenId: InputId('Identifiant de token invalide'),
          characterId: InputId('Identifiant de personnage invalide'),
          side: CampaignSide.exclude(['players']),
          pos: MapPoint,
        })
        .strict(),
    )
    .min(1)
    .max(50),
});
export type RestoreMapNpcs = z.input<typeof RestoreMapNpcs>;
export const MapNpcsRestored = z.object({ items: z.array(MapToken) });
export type MapNpcsRestored = z.infer<typeof MapNpcsRestored>;

/** Délai pendant lequel un PNJ supprimé de la carte peut être restauré (Ctrl+Z). */
export const NPC_UNDO_HOURS = 24;

// ─── Objets ──────────────────────────────────────────────────────────────────

/**
 * Contenu d'un objet (coffre, cadavre…). `ref` : identifiant d'une entrée du catalogue du
 * système (`entree`) ; absent, c'est un objet libre (nom, description, image propres).
 */
export const MapObjectItem = z.strictObject({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1, 'Nom requis').max(200),
  quantity: z.number().int().min(1).max(1_000_000),
  imageUrl: MediaUrl.optional(),
  description: z.string().max(10_000).optional(),
  ref: z.string().min(1).max(200).optional(),
  /** Champs de l'ancienne app (poids, dégâts…) gardés tels quels à la migration. */
  legacy: z.record(z.string(), z.unknown()).optional(),
});
export type MapObjectItem = z.infer<typeof MapObjectItem>;

export const MapObject = z.object({
  ...element,
  name: z.string(),
  kind: MapObjectKind,
  imageUrl: z.string(),
  /** Coin haut gauche, avant rotation. */
  pos: MapPoint,
  width: z.number(),
  height: z.number(),
  /** Degrés, autour du centre. */
  rotation: z.number(),
  /** Calque du MJ et ordre dans ce calque (remplacent `isBackground`). */
  layerId: Id,
  z: z.number(),
  isLocked: z.boolean(),
  visibility: MapObjectVisibility,
  visibleTo: z.array(Id),
  notes: z.string().nullable(),
  items: z.array(MapObjectItem),
  linkedId: z.string().nullable(),
  groupEntityId: z.string().nullable(),
  /** « Fouiller » ouvert aux joueurs dont un personnage est à `searchRadius` unités au plus. */
  searchable: z.boolean(),
  /** En unités de jeu (× `pixelsPerUnit`), du centre du token au rectangle de l'objet. */
  searchRadius: z.number(),
});
export type MapObject = z.infer<typeof MapObject>;

export const MapObjectFields = z.strictObject({
  name: Label,
  kind: MapObjectKind,
  imageUrl: MediaUrl.or(z.literal('')),
  pos: MapPoint,
  width: z.number().positive().max(100_000),
  height: z.number().positive().max(100_000),
  rotation: z.number().finite(),
  /** Absent à la création : calque par défaut des objets, en haut de la pile. */
  layerId: InputId('Identifiant de calque invalide'),
  z: LayerZ,
  isLocked: z.boolean(),
  visibility: MapObjectVisibility,
  visibleTo: z.array(InputId('Identifiant de personnage invalide')).max(100),
  notes: z.string().max(10_000).nullable(),
  items: z.array(MapObjectItem).max(500),
  linkedId: z.string().max(200).nullable(),
  groupEntityId: z.string().max(200).nullable(),
  searchable: z.boolean(),
  searchRadius: z.number().min(0).max(10_000),
});
export const CreateMapObject = MapObjectFields.partial().required({ pos: true });
export type CreateMapObject = z.input<typeof CreateMapObject>;
export const UpdateMapObject = MapObjectFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapObject = z.input<typeof UpdateMapObject>;

/** `POST …/objects/:itemId/search` : un personnage de l'appelant fouille l'objet. */
export const SearchMapObject = z.strictObject({
  characterId: InputId('Identifiant de personnage invalide'),
});
export type SearchMapObject = z.input<typeof SearchMapObject>;

/** Réponse de la fouille : le contenu de l'objet. */
export const MapObjectSearchResult = z.object({
  id: Id,
  mapId: Id,
  name: z.string(),
  items: z.array(MapObjectItem),
  version: z.number().int(),
});
export type MapObjectSearchResult = z.infer<typeof MapObjectSearchResult>;

/** `POST …/objects/:itemId/take` : prendre `quantity` (défaut : tout) d'un contenu. */
export const TakeMapObjectItem = z.strictObject({
  characterId: InputId('Identifiant de personnage invalide'),
  itemId: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(1_000_000).optional(),
});
export type TakeMapObjectItem = z.input<typeof TakeMapObjectItem>;

export const MapObjectTakeResult = z.object({
  object: MapObjectSearchResult,
  /** Ce qui a été donné au personnage. */
  taken: z.object({ itemId: z.string(), name: z.string(), quantity: z.number().int() }),
  /** Nouvelle version du personnage (relire sa fiche). */
  characterVersion: z.number().int(),
});
export type MapObjectTakeResult = z.infer<typeof MapObjectTakeResult>;

// ─── Lumières ────────────────────────────────────────────────────────────────

export const MapLight = z.object({
  ...element,
  name: z.string(),
  pos: MapPoint,
  /** En unités de jeu (× `pixelsPerUnit`). */
  radius: z.number(),
  /** Allumée. */
  visible: z.boolean(),
  color: z.string(),
  /** 0 à 1. */
  intensity: z.number(),
  /** Part du rayon en dégradé, 0 (bord net) à 1. */
  falloff: z.number(),
  /** Suit ce token (torche) ; `pos` est alors celle du token. */
  attachedTokenId: Id.nullable(),
});
export type MapLight = z.infer<typeof MapLight>;

export const MapLightFields = z.strictObject({
  name: Label,
  pos: MapPoint,
  radius: z.number().min(0).max(100_000),
  visible: z.boolean(),
  color: MapColor.min(1),
  intensity: z.number().min(0).max(1),
  falloff: z.number().min(0).max(1),
  attachedTokenId: InputId('Identifiant de token invalide').nullable(),
});
export const CreateMapLight = MapLightFields.partial().required({ pos: true });
export type CreateMapLight = z.input<typeof CreateMapLight>;
export const UpdateMapLight = MapLightFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapLight = z.input<typeof UpdateMapLight>;

// ─── Obstacles ───────────────────────────────────────────────────────────────

export const MapObstacle = z.object({
  ...element,
  kind: MapObstacleKind,
  /** Ligne brisée (2 points et plus). */
  points: z.array(MapPoint),
  /** Mur à sens unique : côté d'où la vue est bloquée (null : `left`). */
  blocksFrom: MapBlocksFrom.nullable(),
  isOpen: z.boolean(),
  isLocked: z.boolean(),
  color: z.string().nullable(),
  /** 1 : bloque la vue ; en dessous, ombre partielle à cette opacité. */
  opacity: z.number(),
  roomMode: MapRoomMode.nullable(),
});
export type MapObstacle = z.infer<typeof MapObstacle>;

export const MapObstacleFields = z.strictObject({
  kind: MapObstacleKind,
  points: mapPoints(2, 1000),
  blocksFrom: MapBlocksFrom.nullable(),
  isOpen: z.boolean(),
  isLocked: z.boolean(),
  color: MapColor.nullable(),
  opacity: z.number().min(0).max(1),
  roomMode: MapRoomMode.nullable(),
});
export const CreateMapObstacle = MapObstacleFields.partial().required({ points: true });
export type CreateMapObstacle = z.input<typeof CreateMapObstacle>;
/** Joueur : `isOpen` d'une porte non verrouillée seulement. */
export const UpdateMapObstacle = MapObstacleFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapObstacle = z.input<typeof UpdateMapObstacle>;

// ─── Pièces ──────────────────────────────────────────────────────────────────

/**
 * Pièce : polygone fermé, sans effet de mur par lui-même. Fermée si aucune porte ouverte
 * n'est sur son contour : de l'intérieur on ne voit pas dehors, de l'extérieur pas dedans.
 */
export const MapRoom = z.object({
  ...element,
  name: z.string(),
  /** Contour, sans répéter le premier point. */
  points: z.array(MapPoint),
});
export type MapRoom = z.infer<typeof MapRoom>;

export const MapRoomFields = z.strictObject({
  name: Label,
  points: mapPoints(3, 1000),
});
export const CreateMapRoom = MapRoomFields.partial().required({ points: true });
export type CreateMapRoom = z.input<typeof CreateMapRoom>;
export const UpdateMapRoom = MapRoomFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapRoom = z.input<typeof UpdateMapRoom>;

// ─── Zones de brouillard ─────────────────────────────────────────────────────

/**
 * Zone de brouillard. `circle` : `center` et `radius` (pixels), `points` vide ; `rect`
 * (4 points) et `polygon` (main levée) : `points`, `center` et `radius` nuls. Dans le
 * brouillard, un joueur ne voit que dans son rayon de vision (ou une zone éclairée).
 * Les zones s'appliquent par `order` croissant, en partant de `fogFull` de la carte.
 */
export const MapFogZone = z.object({
  ...element,
  shape: MapFogShape,
  mode: MapFogMode,
  points: z.array(MapPoint),
  center: MapPoint.nullable(),
  radius: z.number().nullable(),
  /** Ordre d'application (croissant), attribué à la création. */
  order: z.number().int(),
  createdBy: Id,
});
export type MapFogZone = z.infer<typeof MapFogZone>;

const FogRadius = z.number().positive().max(1_000_000);
export const CreateMapFogZone = z.discriminatedUnion('shape', [
  z.strictObject({
    shape: z.literal('circle'),
    mode: MapFogMode.optional(),
    center: MapPoint,
    radius: FogRadius,
  }),
  z.strictObject({
    shape: z.literal('rect'),
    mode: MapFogMode.optional(),
    points: mapPoints(4, 4),
  }),
  z.strictObject({
    shape: z.literal('polygon'),
    mode: MapFogMode.optional(),
    points: mapPoints(3, 5000),
  }),
]);
export type CreateMapFogZone = z.input<typeof CreateMapFogZone>;

/** La forme ne change pas : `center`/`radius` pour un cercle, `points` sinon (422 sinon). */
export const UpdateMapFogZone = z.strictObject({
  mode: MapFogMode.optional(),
  points: mapPoints(3, 5000).optional(),
  center: MapPoint.optional(),
  radius: FogRadius.optional(),
  version: ExpectedVersion,
});
export type UpdateMapFogZone = z.input<typeof UpdateMapFogZone>;

// ─── Dessins et textes ───────────────────────────────────────────────────────

export const MapDrawing = z.object({
  ...element,
  /** Calque du MJ ; nul : annotation, au-dessus de l'ombre. */
  layerId: Id.nullable(),
  z: z.number(),
  tool: MapDrawingTool,
  points: z.array(MapPoint),
  color: z.string(),
  width: z.number(),
  fill: z.string().nullable(),
  closed: z.boolean(),
  smooth: z.boolean(),
  createdBy: Id,
});
export type MapDrawing = z.infer<typeof MapDrawing>;

export const MapDrawingFields = z.strictObject({
  layerId: InputId('Identifiant de calque invalide').nullable(),
  z: LayerZ,
  tool: MapDrawingTool,
  points: mapPoints(1, 20_000),
  color: MapColor,
  width: z.number().positive().max(1000),
  fill: MapColor.nullable(),
  closed: z.boolean(),
  smooth: z.boolean(),
});
export const CreateMapDrawing = MapDrawingFields.partial().required({ points: true });
export type CreateMapDrawing = z.input<typeof CreateMapDrawing>;
export const UpdateMapDrawing = MapDrawingFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapDrawing = z.input<typeof UpdateMapDrawing>;

export const MapNote = z.object({
  ...element,
  /** Calque du MJ ; nul : annotation, au-dessus de l'ombre. */
  layerId: Id.nullable(),
  z: z.number(),
  text: z.string(),
  /** Début de la ligne de base de la première ligne. */
  pos: MapPoint,
  /** Rotation en degrés, autour de `pos`. */
  rotation: z.number(),
  color: z.string(),
  fontSize: z.number(),
  fontFamily: z.string().nullable(),
  createdBy: Id,
});
export type MapNote = z.infer<typeof MapNote>;

export const MapNoteFields = z.strictObject({
  layerId: InputId('Identifiant de calque invalide').nullable(),
  z: LayerZ,
  text: z.string().max(5000),
  pos: MapPoint,
  rotation: z.number().finite(),
  color: MapColor,
  fontSize: z.number().positive().max(1000),
  fontFamily: z.string().trim().max(100).nullable(),
});
export const CreateMapNote = MapNoteFields.partial().required({ text: true, pos: true });
export type CreateMapNote = z.input<typeof CreateMapNote>;
export const UpdateMapNote = MapNoteFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapNote = z.input<typeof UpdateMapNote>;

// ─── Zones sonores, portails, gabarits ───────────────────────────────────────

export const MapMusicZone = z.object({
  ...element,
  name: z.string(),
  pos: MapPoint,
  /** Pixels. */
  radius: z.number(),
  /** Repli des zones importées : fichier audio (https) ou identifiant de vidéo YouTube. */
  url: z.string().nullable(),
  /** Son de la bibliothèque (service audio) ; prime sur `url`. */
  assetId: z.uuid().nullable(),
  volume: z.number(),
  color: z.string().nullable(),
  /** Arrêtée : silencieuse, et jamais envoyée aux joueurs. */
  active: z.boolean(),
});
export type MapMusicZone = z.infer<typeof MapMusicZone>;

export const MapMusicZoneFields = z.strictObject({
  name: Label,
  pos: MapPoint,
  radius: z.number().min(0).max(100_000),
  url: MediaUrl.or(z.string().regex(/^[\w-]{6,20}$/, 'URL ou id YouTube attendu')).nullable(),
  assetId: z.uuid().nullable(),
  volume: z.number().min(0).max(1),
  color: MapColor.nullable(),
  active: z.boolean(),
});
export const CreateMapMusicZone = MapMusicZoneFields.partial().required({ pos: true });
export type CreateMapMusicZone = z.input<typeof CreateMapMusicZone>;
export const UpdateMapMusicZone = MapMusicZoneFields.partial().extend({
  version: ExpectedVersion,
});
export type UpdateMapMusicZone = z.input<typeof UpdateMapMusicZone>;

export const MapPortal = z.object({
  ...element,
  name: z.string(),
  pos: MapPoint,
  radius: z.number(),
  kind: MapPortalKind,
  /** Carte cible (changement de scène), même campagne. */
  targetMapId: Id.nullable(),
  /** Point d'arrivée. */
  target: MapPoint.nullable(),
  icon: MapPortalIcon.nullable(),
  color: z.string().nullable(),
  visible: z.boolean(),
  /** Franchi dès qu'un joueur y lâche son token, sans question. */
  auto: z.boolean(),
  /**
   * Retour relié (aller-retour), sur cette carte ou une autre : son arrivée est la place de
   * celui-ci, et inversement (lien tenu par le serveur). `target`, `targetMapId` et
   * `linkedPortalId` sont nuls pour un joueur : il ne sait où mène un portail qu'en l'empruntant.
   */
  linkedPortalId: Id.nullable(),
});
export type MapPortal = z.infer<typeof MapPortal>;

export const MapPortalFields = z.strictObject({
  name: Label,
  pos: MapPoint,
  radius: z.number().min(0).max(100_000),
  kind: MapPortalKind,
  targetMapId: InputId('Identifiant de carte invalide').nullable(),
  target: MapPoint.nullable(),
  icon: MapPortalIcon.nullable(),
  color: MapColor.nullable(),
  visible: z.boolean(),
  auto: z.boolean(),
  /** Relier à ce portail (même campagne) : sa destination et la sienne s'alignent. */
  linkedPortalId: InputId('Identifiant de portail invalide').nullable(),
});
export const CreateMapPortal = MapPortalFields.partial().required({ pos: true });
export type CreateMapPortal = z.input<typeof CreateMapPortal>;
export const UpdateMapPortal = MapPortalFields.partial().extend({ version: ExpectedVersion });
export type UpdateMapPortal = z.input<typeof UpdateMapPortal>;

/**
 * Emprunter un portail (`POST …/portals/:itemId/use`) : ces personnages (un joueur : les
 * siens, dont le token est dans la zone du portail), ou tout le groupe (MJ).
 */
export const UseMapPortal = z.union([
  z.strictObject({
    characterIds: z.array(InputId('Identifiant de personnage invalide')).min(1).max(200),
  }),
  z.strictObject({ party: z.literal(true) }),
]);
export type UseMapPortal = z.input<typeof UseMapPortal>;

/** Après le passage : la carte d'arrivée et les tokens des voyageurs, à leur place d'arrivée. */
export const MapPortalUseResult = z.object({
  mapId: Id,
  items: z.array(MapToken),
});
export type MapPortalUseResult = z.infer<typeof MapPortalUseResult>;

export const MapMeasurement = z.object({
  ...element,
  shape: MapMeasurementShape,
  start: MapPoint,
  end: MapPoint,
  color: z.string(),
  skin: z.string().nullable(),
  /** Cône : `coneWidth`, `coneAngle`, `coneShape`, `coneMode`, `fixedLength`… */
  options: z.record(z.string(), z.unknown()),
  createdBy: Id,
});
export type MapMeasurement = z.infer<typeof MapMeasurement>;

export const MapMeasurementFields = z.strictObject({
  shape: MapMeasurementShape,
  start: MapPoint,
  end: MapPoint,
  color: MapColor,
  skin: z.string().trim().max(200).nullable(),
  options: z.record(z.string(), z.unknown()),
});
/** `start` et `end` se modifient ensemble (400 `start_end_together`). */
export const CreateMapMeasurement = MapMeasurementFields.partial().required({
  shape: true,
  start: true,
  end: true,
});
export type CreateMapMeasurement = z.input<typeof CreateMapMeasurement>;
export const UpdateMapMeasurement = MapMeasurementFields.partial().extend({
  version: ExpectedVersion,
});
export type UpdateMapMeasurement = z.input<typeof UpdateMapMeasurement>;

// ─── Couches : registre commun ───────────────────────────────────────────────

/**
 * Couches au contrat commun (`GET|POST /maps/:mapId/<couche>`, `PATCH|DELETE …/:itemId`,
 * `POST …/batch`) : segment d'URL, clé du chargement initial, domaine des événements et
 * schémas. Les tokens ont leurs propres routes.
 */
export const MAP_LAYERS = {
  layers: {
    key: 'layers',
    domain: 'map_layer',
    item: MapLayer,
    create: CreateMapLayer,
    update: UpdateMapLayer,
  },
  objects: {
    key: 'objects',
    domain: 'map_object',
    item: MapObject,
    create: CreateMapObject,
    update: UpdateMapObject,
  },
  lights: {
    key: 'lights',
    domain: 'map_light',
    item: MapLight,
    create: CreateMapLight,
    update: UpdateMapLight,
  },
  obstacles: {
    key: 'obstacles',
    domain: 'map_obstacle',
    item: MapObstacle,
    create: CreateMapObstacle,
    update: UpdateMapObstacle,
  },
  rooms: {
    key: 'rooms',
    domain: 'map_room',
    item: MapRoom,
    create: CreateMapRoom,
    update: UpdateMapRoom,
  },
  'fog-zones': {
    key: 'fogZones',
    domain: 'map_fog_zone',
    item: MapFogZone,
    create: CreateMapFogZone,
    update: UpdateMapFogZone,
  },
  drawings: {
    key: 'drawings',
    domain: 'map_drawing',
    item: MapDrawing,
    create: CreateMapDrawing,
    update: UpdateMapDrawing,
  },
  notes: {
    key: 'notes',
    domain: 'map_note',
    item: MapNote,
    create: CreateMapNote,
    update: UpdateMapNote,
  },
  'music-zones': {
    key: 'musicZones',
    domain: 'map_music_zone',
    item: MapMusicZone,
    create: CreateMapMusicZone,
    update: UpdateMapMusicZone,
  },
  portals: {
    key: 'portals',
    domain: 'map_portal',
    item: MapPortal,
    create: CreateMapPortal,
    update: UpdateMapPortal,
  },
  measurements: {
    key: 'measurements',
    domain: 'map_measurement',
    item: MapMeasurement,
    create: CreateMapMeasurement,
    update: UpdateMapMeasurement,
  },
} as const;
export type MapLayerPath = keyof typeof MAP_LAYERS;
export const MAP_LAYER_PATHS = Object.keys(MAP_LAYERS) as MapLayerPath[];

/** Taille maximale de chaque liste d'un lot. */
export const MAP_BATCH_MAX = 500;

/** Corps de `POST …/<couche>/batch` : tout en une transaction (murs en chaîne, sélection multiple). */
export function mapLayerBatch<C extends z.ZodType, U extends z.ZodObject>(create: C, update: U) {
  return z.strictObject({
    create: z.array(create).max(MAP_BATCH_MAX).default([]),
    update: z
      .array(update.extend({ id: InputId() }))
      .max(MAP_BATCH_MAX)
      .default([]),
    delete: z.array(InputId()).max(MAP_BATCH_MAX).default([]),
  });
}

/** Réponse d'un lot : éléments créés et modifiés, identifiants supprimés. */
export interface MapLayerBatchResult<T> {
  created: T[];
  updated: T[];
  deleted: string[];
}

// ─── Exploration (docs/exploration.md) ───────────────────────────────────────

/** Cases d'exploration au plus par côté (miroir de `EXPLORATION_MAX_SIDE`, @vtt/vision). */
export const MAP_EXPLORATION_MAX_SIDE = 512;
const ExplorationSide = z.number().int().min(1).max(MAP_EXPLORATION_MAX_SIDE);

/**
 * Rectangle de cases d'exploration et son contenu, codé en plages alternées (0 d'abord) en
 * entiers LEB128, en base64 (`encodeWindow`, @vtt/vision).
 */
export const MapExplorationWindow = z.object({
  x: z
    .number()
    .int()
    .min(0)
    .max(MAP_EXPLORATION_MAX_SIDE - 1),
  y: z
    .number()
    .int()
    .min(0)
    .max(MAP_EXPLORATION_MAX_SIDE - 1),
  w: ExplorationSide,
  h: ExplorationSide,
  data: z
    .string()
    .max(400_000)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64 attendu'),
});
export type MapExplorationWindow = z.infer<typeof MapExplorationWindow>;

/** Portée d'un masque : `party`, le groupe (un masque par joueur viendra peut-être). */
export const MapExplorationScope = z.enum(['party']);
export type MapExplorationScope = z.infer<typeof MapExplorationScope>;

/** Masque d'exploration d'une scène : toute la grille en une fenêtre. */
export const MapExploration = z.object({
  mapId: Id,
  scope: MapExplorationScope,
  cols: ExplorationSide,
  rows: ExplorationSide,
  version: z.number().int(),
  window: MapExplorationWindow,
});
export type MapExploration = z.infer<typeof MapExploration>;

/** `GET …/maps/:mapId/exploration` : null quand l'exploration est coupée (ou rien encore). */
export const MapExplorationResponse = z.object({ exploration: MapExploration.nullable() });
export type MapExplorationResponse = z.infer<typeof MapExplorationResponse>;

/**
 * `POST …/maps/:mapId/exploration` (MJ) : révéler ou oublier les cases d'une fenêtre (grille
 * attendue : 409 `exploration_grid_changed` sinon), ou tout réinitialiser.
 */
export const EditMapExploration = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.enum(['reveal', 'forget']),
    cols: ExplorationSide,
    rows: ExplorationSide,
    window: MapExplorationWindow.strict(),
  }),
  z.strictObject({ op: z.literal('reset') }),
]);
export type EditMapExploration = z.input<typeof EditMapExploration>;

/** Réponse d'une écriture : le masque à jour (version comprise). */
export const MapExplorationEditResult = z.object({ exploration: MapExploration.nullable() });
export type MapExplorationEditResult = z.infer<typeof MapExplorationEditResult>;

/** Traînées d'un glisser : 20 tokens, 32 points chacun au plus. */
export const MAP_EXPLORATION_TRAIL_TOKENS = 20;
export const MAP_EXPLORATION_TRAIL_POINTS = 32;

/**
 * `POST …/maps/:mapId/exploration/trail` : les points du chemin d'un glisser ; le serveur
 * explore depuis chacun, pour les tokens qui sont des observateurs du groupe.
 */
export const MapExplorationTrail = z.strictObject({
  trails: z
    .array(
      z.strictObject({
        tokenId: InputId('Identifiant de token invalide'),
        points: mapPoints(1, MAP_EXPLORATION_TRAIL_POINTS),
      }),
    )
    .min(1)
    .max(MAP_EXPLORATION_TRAIL_TOKENS),
});
export type MapExplorationTrail = z.input<typeof MapExplorationTrail>;

/** Réponse d'une traînée : version du masque après elle (null : exploration coupée). */
export const MapExplorationTrailResult = z.object({ version: z.number().int().nullable() });
export type MapExplorationTrailResult = z.infer<typeof MapExplorationTrailResult>;

/**
 * `map.exploration_updated` (audience de la carte) : `window` est le nouvel état du rectangle
 * des cases changées ; une version de plus que la précédente. Toute la grille après une
 * réinitialisation (grille peut-être neuve : `cols`, `rows`).
 */
export const MapExplorationUpdatedPayload = z.object({
  mapId: Id,
  scope: MapExplorationScope,
  version: z.number().int(),
  cols: ExplorationSide,
  rows: ExplorationSide,
  window: MapExplorationWindow,
});
export type MapExplorationUpdatedPayload = z.infer<typeof MapExplorationUpdatedPayload>;

// ─── Chargement initial ──────────────────────────────────────────────────────

/** `GET /v1/campaigns/:id/maps/:mapId?bbox=` : tout, filtré pour l'appelant. */
export const MapSnapshot = z.object({
  map: MapScene,
  /** Calques du MJ, du bas vers le haut (joueur : ceux qui lui sont visibles). */
  layers: z.array(MapLayer),
  tokens: z.array(MapToken),
  objects: z.array(MapObject),
  lights: z.array(MapLight),
  obstacles: z.array(MapObstacle),
  rooms: z.array(MapRoom),
  fogZones: z.array(MapFogZone),
  drawings: z.array(MapDrawing),
  notes: z.array(MapNote),
  musicZones: z.array(MapMusicZone),
  portals: z.array(MapPortal),
  measurements: z.array(MapMeasurement),
  /** Mémoire de l'exploration (null : coupée, ou rien encore). */
  exploration: MapExploration.nullable().optional(),
});
export type MapSnapshot = z.infer<typeof MapSnapshot>;

// ─── Médias (fonds, images, vidéos) ──────────────────────────────────────────

export const MEDIA_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;
export const MEDIA_VIDEO_TYPES = ['video/webm', 'video/mp4'] as const;
/** 10 Mo par image, 100 Mo par vidéo. */
export const MEDIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const MediaKind = z.enum(['image', 'video']);
export type MediaKind = z.infer<typeof MediaKind>;

/** `POST /v1/campaigns/:id/media` (MJ) : URL d'envoi présignée. */
export const MediaUploadRequest = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('image'),
    contentType: z.enum(MEDIA_IMAGE_TYPES),
    size: z.number().int().min(1).max(MEDIA_IMAGE_MAX_BYTES, '10 Mo au plus'),
  }),
  z.strictObject({
    kind: z.literal('video'),
    contentType: z.enum(MEDIA_VIDEO_TYPES),
    size: z.number().int().min(1).max(MEDIA_VIDEO_MAX_BYTES, '100 Mo au plus'),
  }),
]);
export type MediaUploadRequest = z.input<typeof MediaUploadRequest>;

/** Envoyer le fichier par `PUT uploadUrl` (en-têtes `content-type` et `content-length` signés), puis utiliser `publicUrl`. */
export const MediaUploadTicket = z.object({
  uploadUrl: z.string(),
  publicUrl: z.string(),
  expiresIn: z.number().int(),
});
export type MediaUploadTicket = z.infer<typeof MediaUploadTicket>;

// ─── Événements (outbox, sujet vtt.<campaignId>.<domaine>.<action>) ──────────

/** `<domaine>.deleted` et `<domaine>.hidden` : l'élément à retirer. */
export const MapElementRef = z.object({ id: Id, mapId: Id });
export type MapElementRef = z.infer<typeof MapElementRef>;

export const MapRefPayload = z.object({ id: Id });
export type MapRefPayload = z.infer<typeof MapRefPayload>;

export const TokenDeletedPayload = MapElementRef.extend({ characterId: Id });
export type TokenDeletedPayload = z.infer<typeof TokenDeletedPayload>;

const Place = z.object({ mapId: Id, x: z.number(), y: z.number() });
/** Un seul `token.moved` par déplacement (fin de glisser, voyage entre scènes). */
export const TokenMovedPayload = z.object({
  tokenId: Id,
  characterId: Id,
  from: Place.nullable(),
  to: Place,
  /**
   * Version du token après le déplacement : les autres clients la reprennent (sans elle, leur
   * prochaine écriture partait avec une version périmée, refusée en 409). Absente des anciens
   * événements.
   */
  version: z.number().int().optional(),
});
export type TokenMovedPayload = z.infer<typeof TokenMovedPayload>;

/** Effacement groupé des dessins. */
export const MapDrawingClearedPayload = z.object({ mapId: Id, ids: z.array(Id) });
export type MapDrawingClearedPayload = z.infer<typeof MapDrawingClearedPayload>;

/** `map.rescaled` (MJ) : toute la géométrie a changé, les clients relisent la carte. */
export const MapRescaledPayload = z.object({
  mapId: Id,
  sx: z.number(),
  sy: z.number(),
  version: z.number().int(),
});
export type MapRescaledPayload = z.infer<typeof MapRescaledPayload>;

/**
 * `map.visibility_changed` (ciblé : `public` pour tous les joueurs, sinon `gm_only` et
 * `visibleToUsers`) : un observateur, une porte, un mur, une pièce, une zone de brouillard ou
 * une lumière a changé ; ces joueurs relisent tokens et objets, que le serveur filtre
 * autrement (docs/carte.md § 9, Serveur).
 */
export const MapVisibilityChangedPayload = z.object({ mapId: Id });
export type MapVisibilityChangedPayload = z.infer<typeof MapVisibilityChangedPayload>;

/** `map_object.searched` (MJ seul) : un joueur a fouillé l'objet. */
export const MapObjectSearchedPayload = z.object({
  id: Id,
  mapId: Id,
  name: z.string(),
  characterId: Id,
  userId: Id,
});
export type MapObjectSearchedPayload = z.infer<typeof MapObjectSearchedPayload>;

/** `map_object.looted` (MJ seul) : un contenu a été pris par un personnage. */
export const MapObjectLootedPayload = z.object({
  id: Id,
  mapId: Id,
  name: z.string(),
  characterId: Id,
  userId: Id,
  item: z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number().int(),
    ref: z.string().optional(),
  }),
  /** Unités restantes dans l'objet (0 : contenu retiré). */
  remaining: z.number().int(),
});
export type MapObjectLootedPayload = z.infer<typeof MapObjectLootedPayload>;

/** `map_portal.used` (MJ seul) : des personnages ont emprunté le portail. */
export const MapPortalUsedPayload = z.object({
  id: Id,
  mapId: Id,
  name: z.string(),
  kind: MapPortalKind,
  /** Carte d'arrivée (celle du portail pour une téléportation). */
  toMapId: Id,
  characterIds: z.array(Id),
  /** Tout le groupe (MJ). */
  party: z.boolean(),
  userId: Id,
});
export type MapPortalUsedPayload = z.infer<typeof MapPortalUsedPayload>;

/**
 * Charge de chaque événement de carte. Les événements `gm_only` d'un élément en visibilité
 * `custom` portent en plus `visibleToUsers` (joueurs autorisés, pour realtime).
 */
export const MapEventPayloads = {
  'map.created': MapScene,
  'map.updated': MapScene,
  'map.deleted': MapRefPayload,
  'map.hidden': MapRefPayload,
  'map.rescaled': MapRescaledPayload,
  'map.visibility_changed': MapVisibilityChangedPayload,
  'map.exploration_updated': MapExplorationUpdatedPayload,
  'map_group.created': MapGroup,
  'map_group.updated': MapGroup,
  'map_group.deleted': MapRefPayload,
  'map_settings.updated': MapSettings,
  'map_layer.created': MapLayer,
  'map_layer.updated': MapLayer,
  'map_layer.deleted': MapElementRef,
  'map_layer.hidden': MapElementRef,
  'token.created': MapToken,
  'token.updated': MapToken,
  'token.moved': TokenMovedPayload,
  'token.deleted': TokenDeletedPayload,
  'token.hidden': MapElementRef,
  'map_object.created': MapObject,
  'map_object.updated': MapObject,
  'map_object.deleted': MapElementRef,
  'map_object.hidden': MapElementRef,
  'map_object.searched': MapObjectSearchedPayload,
  'map_object.looted': MapObjectLootedPayload,
  'map_light.created': MapLight,
  'map_light.updated': MapLight,
  'map_light.deleted': MapElementRef,
  'map_light.hidden': MapElementRef,
  'map_obstacle.created': MapObstacle,
  'map_obstacle.updated': MapObstacle,
  'map_obstacle.deleted': MapElementRef,
  'map_room.created': MapRoom,
  'map_room.updated': MapRoom,
  'map_room.deleted': MapElementRef,
  'map_fog_zone.created': MapFogZone,
  'map_fog_zone.updated': MapFogZone,
  'map_fog_zone.deleted': MapElementRef,
  'map_drawing.created': MapDrawing,
  'map_drawing.updated': MapDrawing,
  'map_drawing.deleted': MapElementRef,
  'map_drawing.cleared': MapDrawingClearedPayload,
  'map_note.created': MapNote,
  'map_note.updated': MapNote,
  'map_note.deleted': MapElementRef,
  'map_music_zone.created': MapMusicZone,
  'map_music_zone.updated': MapMusicZone,
  'map_music_zone.deleted': MapElementRef,
  'map_portal.created': MapPortal,
  'map_portal.updated': MapPortal,
  'map_portal.deleted': MapElementRef,
  'map_portal.hidden': MapElementRef,
  'map_portal.used': MapPortalUsedPayload,
  'map_measurement.created': MapMeasurement,
  'map_measurement.updated': MapMeasurement,
  'map_measurement.deleted': MapElementRef,
} as const;
export type MapEventType = keyof typeof MapEventPayloads;
export type MapEventPayload<T extends MapEventType> = z.infer<(typeof MapEventPayloads)[T]>;

// ─── Direct (canal éphémère du service realtime) ─────────────────────────────

/** Sortes de messages éphémères de la carte. */
export const MAP_LIVE_KIND = 'map.live';
export const MAP_PING_KIND = 'map.ping';
/** Cadence maximale de `map.live` pendant un geste. */
export const MAP_LIVE_HZ = 15;
/** Taille maximale d'un message (JSON) ; au-delà, les points du tracé partent au suivant. */
export const MAP_LIVE_MAX_BYTES = 4096;
/** Destinataires nommés d'un message éphémère (`toUsers`), au plus. */
export const EPHEMERAL_TO_USERS_MAX = 50;
/** Points d'un trajet (départ et points de passage) dans `map.live.path`, au plus. */
export const MAP_PATH_MAX_POINTS = 64;

const LiveNumber = z.number().finite();
/** `[id, x, y]` ou `[id, x, y, rotation]`. */
const LiveDrag = z.union([
  z.tuple([z.string(), LiveNumber, LiveNumber]),
  z.tuple([z.string(), LiveNumber, LiveNumber, LiveNumber]),
]);

/**
 * `map.live` : tout ce qui bouge chez l'émetteur pendant un geste, 15 Hz au plus, puis une
 * dernière fois avec `end`. Relayé, jamais stocké ; seul l'état final passe par REST.
 */
export const MapLiveMessage = z.object({
  /** Carte. */
  m: z.string(),
  /** Compteur de l'émetteur (un message plus ancien que le dernier reçu est ignoré). */
  s: z.number().int().nonnegative(),
  drag: z.array(LiveDrag).max(200).optional(),
  cursor: z.tuple([LiveNumber, LiveNumber]).optional(),
  stroke: z
    .object({
      id: z.string(),
      tool: MapDrawingTool,
      color: z.string(),
      width: z.number(),
      /** Remplissage d'une forme fermée (rectangle, ellipse), comme `MapDrawing.fill` ; absent : aucun. */
      fill: z.string().nullable().optional(),
      /** Points ajoutés depuis le dernier envoi, à plat : x0, y0, x1, y1… */
      points: z.array(LiveNumber),
    })
    .optional(),
  /** `[id, x, y, width, height, rotation]` (poignées de taille et de rotation). */
  transform: z
    .array(z.tuple([z.string(), LiveNumber, LiveNumber, LiveNumber, LiveNumber, LiveNumber]))
    .max(200)
    .optional(),
  /**
   * Mesure en cours de l'émetteur (outil Mesurer, une seule par auteur) ; `null` : effacée.
   * Après `end`, elle reste quelques secondes chez les autres ; `pinned` : épinglée, le gabarit
   * durable (`map_measurement.created`) la remplace.
   */
  measure: z
    .object({
      id: z.string().max(64),
      shape: MapMeasurementShape,
      from: z.tuple([LiveNumber, LiveNumber]),
      to: z.tuple([LiveNumber, LiveNumber]),
      color: z.string().max(50),
      skin: z.string().max(200).nullable().optional(),
      /** Options de la forme (cône : `coneAngle`, `coneMode`, `coneWidth`…), comme le gabarit. */
      options: z.record(z.string().max(40), z.union([z.number(), z.string().max(40)])).optional(),
      pinned: z.literal(true).optional(),
    })
    .nullable()
    .optional(),
  /**
   * Trajet d'un token glissé (docs/carte.md § 10, Trajet des déplacements) : `[id, points]`,
   * son départ puis ses points de passage, à plat (`x0, y0, x1, y1…`) ; le point courant est
   * celui de `drag`. Envoyé quand il change, à l'audience du token à chacun de ces points ;
   * `[id, []]` l'efface.
   */
  path: z
    .array(
      z.tuple([
        z.string().max(64),
        z
          .array(LiveNumber)
          .max(2 * MAP_PATH_MAX_POINTS)
          .refine((points) => points.length % 2 === 0, 'Points par paires (x, y)'),
      ]),
    )
    .max(20)
    .optional(),
  end: z.literal(true).optional(),
});
export type MapLiveMessage = z.infer<typeof MapLiveMessage>;

/** `map.ping` : onde à cet endroit ; `focus` (MJ) amène la caméra de chacun à ce point. */
export const MapPingMessage = z.object({
  m: z.string(),
  x: LiveNumber,
  y: LiveNumber,
  focus: z.boolean().optional(),
});
export type MapPingMessage = z.infer<typeof MapPingMessage>;

/** Bulle d'interaction (emoji ou texte) au-dessus du token d'un joueur, relayée, jamais stockée. */
export const MAP_BUBBLE_KIND = 'map.bubble';
export const BUBBLE_TEXT_MAX = 40;
export const BUBBLE_DURATION_MIN_MS = 1_000;
export const BUBBLE_DURATION_MAX_MS = 60_000;
export const BUBBLE_DURATION_DEFAULT_MS = 5_000;

/**
 * `map.bubble` : la bulle du personnage `c` (celui que l'émetteur incarne, vérifié à la réception),
 * ou `b: null` pour la retirer. Une nouvelle bulle remplace la précédente.
 */
export const MapBubbleMessage = z.object({
  c: z.string().max(64),
  b: z
    .object({
      t: z.enum(['emoji', 'text']),
      v: z.string().trim().min(1).max(BUBBLE_TEXT_MAX),
      d: z.number().int().min(BUBBLE_DURATION_MIN_MS).max(BUBBLE_DURATION_MAX_MS),
    })
    .nullable(),
});
export type MapBubbleMessage = z.infer<typeof MapBubbleMessage>;

// ─── Disposition de la barre d'outils (docs/carte.md § 6, Personnalisation) ───

/** Identifiant d'une entrée de la barre (`select`, `history.undo`, `grid:menu`…). */
export const MapToolbarEntryId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9:._-]*$/i);

/** Au plus autant d'entrées dans une liste : bien au-delà de ce que fournissent les modules. */
export const MAP_TOOLBAR_MAX_ENTRIES = 100;

const toolbarIds = z.array(MapToolbarEntryId).max(MAP_TOOLBAR_MAX_ENTRIES);

/**
 * Disposition de la barre d'outils, par compte (toutes campagnes, tous rôles). `order` : ordre
 * voulu (une entrée absente garde sa place par défaut) ; `hidden` : entrées masquées (leur touche
 * marche toujours). Un id inconnu est ignoré. Sans ligne : `{ order: [], hidden: [], version: 0 }`.
 */
export const MapToolbarLayout = z.object({
  order: toolbarIds,
  hidden: toolbarIds,
  version: z.number().int().nonnegative(),
});
export type MapToolbarLayout = z.infer<typeof MapToolbarLayout>;

/** Corps du PUT : la disposition entière ; `version` lue, pour refuser une écriture concurrente. */
export const MapToolbarLayoutUpdate = z.object({
  order: toolbarIds,
  hidden: toolbarIds,
  version: z.number().int().nonnegative().optional(),
});
export type MapToolbarLayoutUpdate = z.infer<typeof MapToolbarLayoutUpdate>;

export const DEFAULT_MAP_TOOLBAR_LAYOUT: MapToolbarLayout = { order: [], hidden: [], version: 0 };
