/**
 * Carte (service campaign, module maps), selon le contrat de docs/api-map.md :
 * cartes (scènes) et dossiers, chargement initial, tokens, couches (objets,
 * lumières, obstacles, dessins, textes, zones sonores, portails, gabarits),
 * brouillard et réglages de la carte. Coordonnées en pixels de l'image de fond.
 *
 * Chaque élément porte un `version` ; un PATCH peut l'envoyer et reçoit alors
 * 409 `version_conflict` s'il a changé entre-temps.
 */
import { api, ApiError } from './api';
import { checkImage } from './profile';

// ─── Types du contrat ────────────────────────────────────────────────────────

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapWeather {
  type: string;
  intensity: number;
}

/** Calques affichés (réglage du MJ, par carte). */
export type MapLayers = Record<string, boolean>;

/** Carte (scène) ; `isDefault` : le fond global de l'ancienne app. */
export interface GameMap {
  id: string;
  name: string;
  description: string | null;
  groupId: string | null;
  backgroundUrl: string | null;
  isDefault: boolean;
  visibleToPlayers: boolean;
  spawn: MapPoint | null;
  width: number | null;
  height: number | null;
  weather: MapWeather | null;
  layers: MapLayers | null;
  version: number;
  updatedAt: string;
}

export interface MapFields {
  name: string;
  description: string | null;
  groupId: string | null;
  backgroundUrl: string | null;
  isDefault: boolean;
  visibleToPlayers: boolean;
  spawn: MapPoint | null;
  width: number | null;
  height: number | null;
  weather: MapWeather | null;
  layers: MapLayers;
}

export type TokenVisibility = 'visible' | 'hidden' | 'ally' | 'custom' | 'invisible';

export interface TokenAudio {
  url: string;
  radius: number;
  volume: number;
  loop?: boolean;
  name?: string;
}

export interface MapToken {
  id: string;
  mapId: string;
  characterId: string;
  pos: MapPoint;
  scale: number;
  shape: 'circle' | 'square';
  /** Image propre au token ; null : l'avatar du personnage. */
  imageUrl: string | null;
  visibility: TokenVisibility;
  /** Personnages dont les joueurs voient le token (`custom`). */
  visibleTo: string[];
  visionRadius: number;
  visionBoost: boolean;
  notes: string | null;
  audio: TokenAudio | null;
  interactions: Record<string, unknown>[] | null;
  version: number;
  updatedAt: string;
}

export type TokenFields = Omit<MapToken, 'id' | 'mapId' | 'characterId' | 'version' | 'updatedAt'>;

/** Champs communs à tous les éléments d'une couche. */
interface LayerItemBase {
  id: string;
  mapId: string;
  version: number;
  updatedAt: string;
}

export interface MapObjectItem extends LayerItemBase {
  name: string | null;
  kind: 'decor' | 'weapon' | 'item';
  imageUrl: string;
  /** Coin haut gauche. */
  pos: MapPoint;
  width: number;
  height: number;
  rotation: number;
  isBackground: boolean;
  isLocked: boolean;
  visibility: 'visible' | 'hidden' | 'custom';
  visibleTo: string[];
  notes: string | null;
  items: Record<string, unknown>[];
  linkedId: string | null;
  groupEntityId: string | null;
}

export interface MapLight extends LayerItemBase {
  name: string | null;
  pos: MapPoint;
  /** En unités de mesure (× `pixelsPerUnit`). */
  radius: number;
  visible: boolean;
}

export type ObstacleKind = 'wall' | 'one_way_wall' | 'door' | 'window';

export interface MapObstacle extends LayerItemBase {
  kind: ObstacleKind;
  points: MapPoint[];
  direction: 'north' | 'south' | 'east' | 'west' | null;
  isOpen: boolean;
  isLocked: boolean;
  color: string | null;
  opacity: number | null;
  roomMode: 'room' | 'individual' | null;
}

export type DrawingTool = 'pen' | 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle';

export interface MapDrawing extends LayerItemBase {
  tool: DrawingTool;
  points: MapPoint[];
  color: string;
  width: number;
  fill: string | null;
  closed: boolean;
  smooth: boolean;
  createdBy?: string | null;
}

export interface MapNote extends LayerItemBase {
  text: string;
  pos: MapPoint;
  color: string;
  fontSize: number;
  fontFamily: string | null;
  createdBy?: string | null;
}

export interface MapMusicZone extends LayerItemBase {
  name: string | null;
  pos: MapPoint;
  radius: number;
  /** Fichier audio (https) ou identifiant de vidéo YouTube. */
  url: string | null;
  volume: number;
  color: string | null;
}

export interface MapPortal extends LayerItemBase {
  name: string | null;
  pos: MapPoint;
  radius: number;
  kind: 'scene_change' | 'same_map';
  targetMapId: string | null;
  target: MapPoint | null;
  icon: 'stairs' | 'door' | 'portal' | 'ladder' | null;
  color: string | null;
  visible: boolean;
}

export interface MapMeasurement extends LayerItemBase {
  shape: 'line' | 'cone' | 'circle' | 'cube';
  start: MapPoint;
  end: MapPoint;
  color: string;
  skin: string | null;
  options: Record<string, unknown>;
  createdBy?: string | null;
}

export interface MapFog {
  mapId: string;
  fullMap: boolean;
  /** Cases couvertes `"cx,cy"` (cx = floor(x / cellSize)). */
  cells: string[];
  cellSize: number;
  version: number;
}

/** Chargement initial : tout ce que l'appelant voit sur la carte. */
export interface MapLoad {
  map: GameMap;
  fog: MapFog;
  tokens: MapToken[];
  objects: MapObjectItem[];
  lights: MapLight[];
  obstacles: MapObstacle[];
  drawings: MapDrawing[];
  notes: MapNote[];
  musicZones: MapMusicZone[];
  portals: MapPortal[];
  measurements: MapMeasurement[];
}

export interface MapSettings {
  campaignId: string;
  /** Scène du groupe (ancien `currentCityId`). */
  partyMapId: string | null;
  tokenScale: number;
  pixelsPerUnit: number;
  unitName: string;
  shadowOpacity: number;
  dungeonMode: boolean;
  /** Musique d'ambiance en cours ({ videoId, videoTitle, isPlaying, … }). */
  music: Record<string, unknown> | null;
  version: number;
}

export type MapSettingsUpdate = Partial<Omit<MapSettings, 'campaignId' | 'version'>> & {
  version?: number;
};

export interface MapGroup {
  id: string;
  name: string;
  sortOrder: number;
  version: number;
}

/** Couche et type de ses éléments. */
export interface LayerItems {
  objects: MapObjectItem;
  lights: MapLight;
  obstacles: MapObstacle;
  drawings: MapDrawing;
  notes: MapNote;
  'music-zones': MapMusicZone;
  portals: MapPortal;
  measurements: MapMeasurement;
}

export type LayerName = keyof LayerItems;

/** Champs écrits d'un élément de couche (sans identifiants ni version). */
export type LayerInput<L extends LayerName> = Partial<
  Omit<LayerItems[L], 'id' | 'mapId' | 'version' | 'updatedAt' | 'createdBy'>
>;

export interface LayerBatch<L extends LayerName> {
  create?: LayerInput<L>[];
  update?: (LayerInput<L> & { id: string; version?: number })[];
  delete?: string[];
}

export interface LayerBatchResult<L extends LayerName> {
  created: LayerItems[L][];
  updated: LayerItems[L][];
  deleted: string[];
}

// ─── Chemins ─────────────────────────────────────────────────────────────────

const campaignPath = (id: string, suffix = '') =>
  `/v1/campaigns/${encodeURIComponent(id)}${suffix}`;
const mapPath = (id: string, mapId: string, suffix = '') =>
  campaignPath(id, `/maps/${encodeURIComponent(mapId)}${suffix}`);
const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

// ─── Cartes ──────────────────────────────────────────────────────────────────

/** MJ : toutes ; joueur : cartes visibles des joueurs et celle où se trouve un de ses personnages. */
export async function listMaps(id: string) {
  return (await api<{ items: GameMap[] }>(campaignPath(id, '/maps'))).items;
}

export function createMap(id: string, body: Partial<MapFields> & { name: string }) {
  return api<GameMap>(campaignPath(id, '/maps'), json('POST', body));
}

/** Chargement initial d'une carte : tokens, couches et brouillard, filtrés pour l'appelant. */
export function loadMap(id: string, mapId: string) {
  return api<MapLoad>(mapPath(id, mapId));
}

export function updateMap(
  id: string,
  mapId: string,
  body: Partial<MapFields> & { version?: number },
) {
  return api<GameMap>(mapPath(id, mapId), json('PATCH', body));
}

export function deleteMap(id: string, mapId: string) {
  return api<void>(mapPath(id, mapId), { method: 'DELETE' });
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

export async function listTokens(id: string, mapId: string) {
  return (await api<{ items: MapToken[] }>(mapPath(id, mapId, '/tokens'))).items;
}

/** Pose un personnage engagé sur la carte (MJ). */
export function createToken(
  id: string,
  mapId: string,
  body: Partial<TokenFields> & { characterId: string; pos: MapPoint },
) {
  return api<MapToken>(mapPath(id, mapId, '/tokens'), json('POST', body));
}

/** Joueur : ses personnages, `pos` et `visionBoost` seulement. */
export function updateToken(
  id: string,
  mapId: string,
  tokenId: string,
  body: Partial<TokenFields> & { version?: number },
) {
  return api<MapToken>(
    mapPath(id, mapId, `/tokens/${encodeURIComponent(tokenId)}`),
    json('PATCH', body),
  );
}

export function deleteToken(id: string, mapId: string, tokenId: string) {
  return api<void>(mapPath(id, mapId, `/tokens/${encodeURIComponent(tokenId)}`), {
    method: 'DELETE',
  });
}

/** Fin de drag, sélection multiple : un `token.moved` par token (200 au plus). */
export async function moveTokens(
  id: string,
  mapId: string,
  moves: { tokenId: string; pos: MapPoint; version?: number }[],
) {
  return (
    await api<{ items: MapToken[] }>(mapPath(id, mapId, '/tokens/move'), json('POST', { moves }))
  ).items;
}

/**
 * Amène des personnages sur cette carte (portail, changement de scène). Sans
 * `characterIds` : tous les personnages joueurs, et la carte devient celle du groupe (MJ).
 */
export async function travel(
  id: string,
  mapId: string,
  body: { characterIds?: string[]; pos?: MapPoint } = {},
) {
  return (await api<{ items: MapToken[] }>(mapPath(id, mapId, '/travel'), json('POST', body)))
    .items;
}

// ─── Couches ─────────────────────────────────────────────────────────────────

export async function listLayer<L extends LayerName>(id: string, mapId: string, layer: L) {
  return (await api<{ items: LayerItems[L][] }>(mapPath(id, mapId, `/${layer}`))).items;
}

export function createLayerItem<L extends LayerName>(
  id: string,
  mapId: string,
  layer: L,
  body: LayerInput<L>,
) {
  return api<LayerItems[L]>(mapPath(id, mapId, `/${layer}`), json('POST', body));
}

export function updateLayerItem<L extends LayerName>(
  id: string,
  mapId: string,
  layer: L,
  itemId: string,
  body: LayerInput<L> & { version?: number },
) {
  return api<LayerItems[L]>(
    mapPath(id, mapId, `/${layer}/${encodeURIComponent(itemId)}`),
    json('PATCH', body),
  );
}

export function deleteLayerItem(id: string, mapId: string, layer: LayerName, itemId: string) {
  return api<void>(mapPath(id, mapId, `/${layer}/${encodeURIComponent(itemId)}`), {
    method: 'DELETE',
  });
}

/** Créations, modifications et suppressions en une transaction (500 au plus chacune). */
export function batchLayer<L extends LayerName>(
  id: string,
  mapId: string,
  layer: L,
  body: LayerBatch<L>,
) {
  return api<LayerBatchResult<L>>(mapPath(id, mapId, `/${layer}/batch`), json('POST', body));
}

/** Efface les dessins de la carte (MJ) ou les siens (joueur). */
export function clearDrawings(id: string, mapId: string) {
  return api<void>(mapPath(id, mapId, '/drawings'), { method: 'DELETE' });
}

// ─── Brouillard ──────────────────────────────────────────────────────────────

export function getFog(id: string, mapId: string) {
  return api<MapFog>(mapPath(id, mapId, '/fog'));
}

/** Remplace les cases (MJ). */
export function putFog(
  id: string,
  mapId: string,
  body: { cells: string[]; fullMap?: boolean; version?: number },
) {
  return api<MapFog>(mapPath(id, mapId, '/fog'), json('PUT', body));
}

/** Ajoute ou retire des cases (MJ). */
export function patchFog(
  id: string,
  mapId: string,
  body: { add?: string[]; remove?: string[]; fullMap?: boolean; version?: number },
) {
  return api<MapFog>(mapPath(id, mapId, '/fog'), json('PATCH', body));
}

// ─── Réglages et dossiers ────────────────────────────────────────────────────

export function getMapSettings(id: string) {
  return api<MapSettings>(campaignPath(id, '/map-settings'));
}

export function updateMapSettings(id: string, body: MapSettingsUpdate) {
  return api<MapSettings>(campaignPath(id, '/map-settings'), json('PATCH', body));
}

export async function listMapGroups(id: string) {
  return (await api<{ items: MapGroup[] }>(campaignPath(id, '/map-groups'))).items;
}

export function createMapGroup(id: string, body: { name: string; sortOrder?: number }) {
  return api<MapGroup>(campaignPath(id, '/map-groups'), json('POST', body));
}

export function updateMapGroup(
  id: string,
  groupId: string,
  body: { name?: string; sortOrder?: number; version?: number },
) {
  return api<MapGroup>(
    campaignPath(id, `/map-groups/${encodeURIComponent(groupId)}`),
    json('PATCH', body),
  );
}

export function deleteMapGroup(id: string, groupId: string) {
  return api<void>(campaignPath(id, `/map-groups/${encodeURIComponent(groupId)}`), {
    method: 'DELETE',
  });
}

// ─── Requêtes spatiales ──────────────────────────────────────────────────────

export function lineOfSight(id: string, mapId: string, from: MapPoint, to: MapPoint) {
  return api<{ blocked: boolean; obstacleIds: string[] }>(
    mapPath(id, mapId, `/line-of-sight?from=${from.x},${from.y}&to=${to.x},${to.y}`),
  );
}

export function elementsAt(id: string, mapId: string, p: MapPoint) {
  return api<{ musicZones: MapMusicZone[]; portals: MapPortal[]; lights: MapLight[] }>(
    mapPath(id, mapId, `/at?x=${p.x}&y=${p.y}`),
  );
}

// ─── Images ──────────────────────────────────────────────────────────────────

/**
 * Envoie une image de carte (fond, token, objet) : URL présignée de la
 * campagne (5 Mo, images), dépôt direct, puis URL publique à enregistrer.
 */
export async function uploadMapImage(id: string, file: File): Promise<string> {
  const invalid = checkImage(file);
  if (invalid) throw new ApiError({ status: 422, title: invalid });
  const { uploadUrl, publicUrl } = await api<{ uploadUrl: string; publicUrl: string }>(
    campaignPath(id, '/image'),
    json('POST', { contentType: file.type, size: file.size }),
  );
  let upload: Response;
  try {
    upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
  } catch {
    throw new ApiError({ status: 0, title: "L'envoi de l'image vers le stockage a échoué." });
  }
  if (!upload.ok)
    throw new ApiError({
      status: upload.status,
      title: `Le stockage a refusé l'image (${upload.status}).`,
    });
  return publicUrl;
}

// ─── Combat (tour actif, pour le surlignage des tokens) ──────────────────────

export interface CombatState {
  id: string;
  round: number;
  mode: 'individual' | 'slots';
  order: { characterId: string; side: string; sortKeys: number[]; hasActed: boolean }[];
  /** Index du participant (`individual`) ou du créneau (`slots`) dont c'est le tour. */
  currentIndex: number;
  slots?: { side: string }[];
  initiativeRolled: boolean;
  version: number;
}

/** Combat en cours de la campagne (docs/api-campaign.md) ; null sans combat. */
export async function getCombatState(id: string): Promise<CombatState | null> {
  try {
    return await api<CombatState>(campaignPath(id, '/combat'));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Personnage dont c'est le tour (mode `individual`), comme l'ancien `combat/state.activePlayer`. */
export function activeCombatant(c: CombatState | null): string | null {
  if (!c || c.mode !== 'individual') return null;
  return c.order[c.currentIndex]?.characterId ?? null;
}
