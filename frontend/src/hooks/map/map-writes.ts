'use client';

/**
 * Écritures de la carte sous la forme de l'ancienne app : le code repris
 * écrivait des documents Firestore (`cartes/{r}/objects/{id}`…) et des nœuds
 * RTDB (`rooms/{r}/obstacles/{id}`…). Ces fonctions gardent ces noms de
 * collection et ces champs, les traduisent (map-adapters.ts) et appellent
 * l'API de la carte (lib/maps.ts) sur la carte suivie.
 *
 * La réponse du serveur est appliquée tout de suite à l'état partagé
 * (map-store.ts) ; en cas d'échec, un message s'affiche et la carte est relue.
 */
import { toast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import {
  createLayerItem,
  createMap,
  deleteLayerItem,
  deleteMap,
  deleteToken,
  moveTokens,
  patchFog,
  putFog,
  updateLayerItem,
  updateMap,
  updateMapSettings,
  updateToken,
  type LayerName,
  type MapPoint,
  type MapSettingsUpdate,
} from '@/lib/maps';
import {
  IGNORED_CHARACTER_FIELDS,
  fromLegacyCharacter,
  fromLegacyDrawing,
  fromLegacyLight,
  fromLegacyMeasurement,
  fromLegacyMusicZone,
  fromLegacyNote,
  fromLegacyObject,
  fromLegacyObstacle,
  fromLegacyPortal,
  fromLegacyScene,
  gridToCells,
  toLegacyCharacter,
  toLegacyDrawing,
  toLegacyLight,
  toLegacyMeasurement,
  toLegacyMusicZone,
  toLegacyNote,
  toLegacyObject,
  toLegacyObstacle,
  toLegacyPortal,
} from './map-adapters';
import { getMapStore, type MapLayerKey } from './map-store';
import {
  getEphemeralMeasurement,
  isEphemeralMeasurement,
  patchMeasurement,
  publishMeasurement,
  removeMeasurement,
} from './map-ephemeral';
import type { SharedMeasurement } from '@/app/(campaigns)/campaigns/[id]/play/map/measurements';

type Legacy = Record<string, unknown>;

/** Collections de l'ancienne carte (Firestore et RTDB) qui ont un équivalent. */
export type LegacyCollection =
  | 'characters'
  | 'objects'
  | 'lights'
  | 'musicZones'
  | 'portals'
  | 'obstacles'
  | 'drawings'
  | 'notes'
  | 'measurements'
  | 'cities';

interface LayerDef {
  layer: LayerName;
  key: MapLayerKey;
  toApi(data: Legacy, current?: Legacy): Record<string, unknown>;
  toLegacy(item: never, cityId: string | null): Legacy;
}

const LAYERS: Record<string, LayerDef> = {
  objects: {
    layer: 'objects',
    key: 'objects',
    toApi: fromLegacyObject,
    toLegacy: toLegacyObject as unknown as LayerDef['toLegacy'],
  },
  lights: {
    layer: 'lights',
    key: 'lights',
    toApi: fromLegacyLight,
    toLegacy: toLegacyLight as unknown as LayerDef['toLegacy'],
  },
  musicZones: {
    layer: 'music-zones',
    key: 'musicZones',
    toApi: fromLegacyMusicZone,
    toLegacy: toLegacyMusicZone as unknown as LayerDef['toLegacy'],
  },
  portals: {
    layer: 'portals',
    key: 'portals',
    toApi: fromLegacyPortal,
    toLegacy: toLegacyPortal as unknown as LayerDef['toLegacy'],
  },
  obstacles: {
    layer: 'obstacles',
    key: 'obstacles',
    toApi: fromLegacyObstacle,
    toLegacy: toLegacyObstacle as unknown as LayerDef['toLegacy'],
  },
  drawings: {
    layer: 'drawings',
    key: 'drawings',
    toApi: fromLegacyDrawing,
    toLegacy: toLegacyDrawing as unknown as LayerDef['toLegacy'],
  },
  notes: {
    layer: 'notes',
    key: 'notes',
    toApi: fromLegacyNote,
    toLegacy: toLegacyNote as unknown as LayerDef['toLegacy'],
  },
  measurements: {
    layer: 'measurements',
    key: 'measurements',
    toApi: fromLegacyMeasurement,
    toLegacy: toLegacyMeasurement as unknown as LayerDef['toLegacy'],
  },
};

/** Message des fonctions de l'ancienne app sans équivalent côté serveur. */
export const SOON = 'Bientôt disponible';

export function soon(what?: string) {
  toast.info(SOON, what ? { description: what } : undefined);
}

function fail(campaignId: string, err: unknown) {
  toast.error(errorMessage(err, "L'enregistrement a échoué, la carte est relue."));
  void getMapStore(campaignId).reloadMap();
}

/** Carte suivie ; les écritures portent toujours sur elle. */
export function currentMapId(campaignId: string): string | null {
  return getMapStore(campaignId).state.data?.map.id ?? getMapStore(campaignId).mapId;
}

function requireMap(campaignId: string): string {
  const mapId = currentMapId(campaignId);
  if (!mapId) throw new Error('Aucune carte chargée');
  return mapId;
}

/** Scène (ancien `cityId`) de la carte suivie : null pour la carte par défaut. */
function currentCityId(campaignId: string): string | null {
  const store = getMapStore(campaignId);
  const map = store.state.data?.map;
  return map && !map.isDefault ? map.id : null;
}

/** Token présent sur la carte suivie pour un personnage. */
export function tokenOf(campaignId: string, characterId: string) {
  return getMapStore(campaignId).state.data?.tokens.find((t) => t.characterId === characterId);
}

// ─── Lecture (données précédentes pour l'annulation) ────────────────────────

/** Élément de la carte suivie, sous la forme de l'ancienne app. */
export function legacyGet(campaignId: string, collection: string, id: string): Legacy | undefined {
  const store = getMapStore(campaignId);
  const data = store.state.data;
  if (!data) return undefined;
  const cityId = currentCityId(campaignId);
  if (collection === 'characters' || collection === 'positions') {
    const t = data.tokens.find((x) => x.characterId === id);
    return t ? (toLegacyCharacter(t, store.state.characters[id], cityId) as Legacy) : undefined;
  }
  const def = LAYERS[collection];
  if (!def) return undefined;
  const item = (data[def.key] as { id: string }[]).find((x) => x.id === id);
  return item ? def.toLegacy(item as never, cityId) : undefined;
}

// ─── Écritures ───────────────────────────────────────────────────────────────

/** Ajoute un élément ; renvoie son identifiant (celui du serveur). */
export async function legacyAdd(
  campaignId: string,
  collection: string,
  input: object,
): Promise<string> {
  const data = input as Legacy;
  const store = getMapStore(campaignId);
  if (collection === 'cities') {
    try {
      const m = await createMap(campaignId, {
        ...(fromLegacyScene(data) as Record<string, unknown>),
        name: String(data.name ?? 'Nouvelle scène'),
      });
      store.upsertMapInList(m);
      return m.id;
    } catch (err) {
      fail(campaignId, err);
      throw err;
    }
  }
  const def = LAYERS[collection];
  if (!def) {
    soon(
      collection === 'characters'
        ? 'Poser un nouveau personnage depuis la carte'
        : `Écriture « ${collection} »`,
    );
    throw new Error(`${collection} : pas d'équivalent`);
  }
  try {
    const mapId = requireMap(campaignId);
    const item = await createLayerItem(campaignId, mapId, def.layer, def.toApi(data) as never);
    store.upsertItem(def.key, item as never);
    return item.id;
  } catch (err) {
    fail(campaignId, err);
    throw err;
  }
}

/** Modifie un élément (seuls les champs donnés). */
export async function legacyUpdate(
  campaignId: string,
  collection: string,
  id: string,
  input: object,
): Promise<void> {
  const updates = input as Legacy;
  const store = getMapStore(campaignId);
  try {
    if (collection === 'fog') {
      // Ancien document `fog/fog_{cityId}` : { grid: { "cx,cy ": true }, fullMapFog }
      const grid = updates.grid as Record<string, boolean> | undefined;
      if (grid)
        await saveFog(
          campaignId,
          new Map(Object.entries(grid)),
          updates.fullMapFog as boolean | undefined,
        );
      else if (typeof updates.fullMapFog === 'boolean')
        await saveFullMapFog(campaignId, updates.fullMapFog);
      return;
    }
    if (collection === 'cities') {
      const m = await updateMap(campaignId, id, fromLegacyScene(updates) as never);
      store.upsertMapInList(m);
      return;
    }
    if (collection === 'characters' || collection === 'positions') {
      const t = tokenOf(campaignId, id);
      if (!t) return;
      const { body, ignored } = fromLegacyCharacter(updates);
      const unsupported = ignored.filter((k) => !IGNORED_CHARACTER_FIELDS.has(k));
      if (unsupported.length)
        soon(
          unsupported.includes('conditions') && unsupported.length === 1
            ? 'États des personnages'
            : 'Nom, stats et états du personnage depuis la carte',
        );
      if (!Object.keys(body).length) return;
      store.upsertToken(await updateToken(campaignId, t.mapId, t.id, body));
      return;
    }
    const def = LAYERS[collection];
    if (!def) {
      soon(`Écriture « ${collection} »`);
      return;
    }
    const mapId = requireMap(campaignId);
    const current = legacyGet(campaignId, collection, id);
    const body = def.toApi(updates, current);
    if (!Object.keys(body).length) return;
    const item = await updateLayerItem(campaignId, mapId, def.layer, id, body as never);
    store.upsertItem(def.key, item as never);
  } catch (err) {
    fail(campaignId, err);
  }
}

/** Supprime un élément (un personnage quitte la carte, il reste engagé). */
export async function legacyDelete(
  campaignId: string,
  collection: string,
  id: string,
): Promise<void> {
  const store = getMapStore(campaignId);
  try {
    if (collection === 'cities') {
      await deleteMap(campaignId, id);
      store.removeMapFromList(id);
      return;
    }
    if (collection === 'characters') {
      const t = tokenOf(campaignId, id);
      if (!t) return;
      await deleteToken(campaignId, t.mapId, t.id);
      store.removeToken(t.id);
      return;
    }
    const def = LAYERS[collection];
    if (!def) {
      soon(`Suppression « ${collection} »`);
      return;
    }
    const mapId = requireMap(campaignId);
    // Déjà retiré localement ailleurs : on ne le retire du serveur qu'une fois
    await deleteLayerItem(campaignId, mapId, def.layer, id);
    store.removeItems(def.key, [id]);
  } catch (err) {
    fail(campaignId, err);
  }
}

/**
 * Déplace des personnages sur la carte suivie (fin de drag, sélection
 * multiple) : un seul appel, un `token.moved` par token.
 */
export async function moveCharacters(
  campaignId: string,
  moves: { characterId: string; pos: MapPoint }[],
): Promise<void> {
  const store = getMapStore(campaignId);
  const list = moves
    .map((m) => ({ token: tokenOf(campaignId, m.characterId), pos: m.pos }))
    .filter((m): m is { token: NonNullable<typeof m.token>; pos: MapPoint } => !!m.token);
  if (!list.length) return;
  try {
    const mapId = list[0].token.mapId;
    const updated = await moveTokens(
      campaignId,
      mapId,
      list.map((m) => ({ tokenId: m.token.id, pos: { x: m.pos.x, y: m.pos.y } })),
    );
    for (const t of updated) store.upsertToken(t);
  } catch (err) {
    fail(campaignId, err);
  }
}

// ─── Brouillard, réglages, calques ───────────────────────────────────────────

/** Remplace le brouillard de la carte suivie (grille de l'ancienne carte). */
export async function saveFog(
  campaignId: string,
  grid: Map<string, boolean>,
  fullMap?: boolean,
): Promise<void> {
  const store = getMapStore(campaignId);
  try {
    const mapId = requireMap(campaignId);
    store.setFog(
      await putFog(campaignId, mapId, {
        cells: gridToCells(grid),
        ...(fullMap !== undefined ? { fullMap } : {}),
      }),
    );
  } catch (err) {
    fail(campaignId, err);
  }
}

/** Couvre ou découvre toute la carte suivie. */
export async function saveFullMapFog(campaignId: string, fullMap: boolean): Promise<void> {
  const store = getMapStore(campaignId);
  try {
    const mapId = requireMap(campaignId);
    store.setFog(await patchFog(campaignId, mapId, { fullMap }));
  } catch (err) {
    fail(campaignId, err);
  }
}

/** Réglages de la carte (ancien `settings/general`), MJ. */
export async function saveMapSettings(campaignId: string, body: MapSettingsUpdate): Promise<void> {
  const store = getMapStore(campaignId);
  try {
    store.setSettings(await updateMapSettings(campaignId, body));
  } catch (err) {
    toast.error(errorMessage(err, "Les réglages de la carte n'ont pas été enregistrés."));
  }
}

/** Calques affichés de la carte suivie (ancien `settings/layers_{cityId}`), MJ. */
export async function saveMapLayers(
  campaignId: string,
  layers: Record<string, boolean>,
): Promise<void> {
  const store = getMapStore(campaignId);
  try {
    const mapId = requireMap(campaignId);
    store.upsertMapInList(await updateMap(campaignId, mapId, { layers }));
  } catch (err) {
    fail(campaignId, err);
  }
}

/**
 * Fond de la scène (`cities/{id}.backgroundUrl`) ou du fond global
 * (`fond/fond1`) : la carte par défaut, créée si elle n'existe pas encore.
 */
export async function saveBackground(
  campaignId: string,
  cityId: string | null,
  url: string,
): Promise<void> {
  const store = getMapStore(campaignId);
  try {
    if (cityId) {
      store.upsertMapInList(await updateMap(campaignId, cityId, { backgroundUrl: url }));
      return;
    }
    const def = store.defaultMap;
    if (def) store.upsertMapInList(await updateMap(campaignId, def.id, { backgroundUrl: url }));
    else {
      const m = await createMap(campaignId, {
        name: 'Carte principale',
        isDefault: true,
        backgroundUrl: url,
      });
      store.upsertMapInList(m);
    }
    await store.reloadMap();
  } catch (err) {
    toast.error(errorMessage(err, "Le fond n'a pas été enregistré."));
  }
}

/** Le MJ envoie la taille de l'image de fond une fois chargée (taille des cases de brouillard). */
export async function saveMapSize(campaignId: string, width: number, height: number) {
  const store = getMapStore(campaignId);
  const map = store.state.data?.map;
  if (!map || !store.state.isGm) return;
  const w = Math.round(width);
  const h = Math.round(height);
  if (!w || !h || (map.width === w && map.height === h)) return;
  try {
    store.upsertMapInList(await updateMap(campaignId, map.id, { width: w, height: h }));
  } catch {
    /* sans taille, le serveur garde des cases de 100 px */
  }
}

// ─── Gabarits (ancien nœud RTDB `rooms/{r}/measurements`) ───────────────────
//
// Un gabarit en cours de tracé est éphémère (canal temps réel) ; une fois
// terminé, un gabarit « permanent » est posé sur le serveur (couche
// `measurements`), les autres restent éphémères et s'effacent après 6 s.

/** Crée ou remplace un gabarit en cours (éphémère). */
export function setMeasurement(campaignId: string, m: SharedMeasurement) {
  publishMeasurement(campaignId, m);
}

/** Modifie un gabarit : éphémère (diffusé) ou posé (PATCH). */
export async function updateMeasurement(
  campaignId: string,
  id: string,
  patch: Partial<SharedMeasurement>,
): Promise<void> {
  if (isEphemeralMeasurement(id)) patchMeasurement(campaignId, id, patch);
  else await legacyUpdate(campaignId, 'measurements', id, patch as Legacy);
}

/** Supprime un gabarit, éphémère ou posé. */
export async function deleteMeasurement(campaignId: string, id: string): Promise<void> {
  if (isEphemeralMeasurement(id)) removeMeasurement(campaignId, id);
  else await legacyDelete(campaignId, 'measurements', id);
}

/**
 * Termine un gabarit en cours : un gabarit permanent est posé sur le serveur
 * (renvoie son nouvel identifiant), un autre reste éphémère.
 */
export async function finishMeasurement(
  campaignId: string,
  id: string,
  patch: Partial<SharedMeasurement>,
): Promise<string> {
  if (!isEphemeralMeasurement(id)) {
    await updateMeasurement(campaignId, id, patch);
    return id;
  }
  patchMeasurement(campaignId, id, patch);
  const current = getEphemeralMeasurement(id);
  if (!current?.permanent) return id;
  try {
    const serverId = await legacyAdd(campaignId, 'measurements', current as unknown as Legacy);
    removeMeasurement(campaignId, id);
    return serverId;
  } catch {
    return id;
  }
}
