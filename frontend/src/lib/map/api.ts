/**
 * Client REST typé de la carte (service campaign, docs/api-map.md). Les types et les schémas
 * viennent de `@vtt/contracts` (`packages/contracts/src/map.ts`) : aucun doublon local.
 *
 * - `mapsApi` : ce qui concerne la campagne (scènes, dossiers, réglages, voyage, médias) ;
 * - `createMapApi(campaignId, mapId)` : la carte ouverte (chargement, couches, persistance des
 *   commandes, ordre et calques, scène), branchée sur le moteur (`EngineBackend`) et sur la
 *   synchronisation (`MapReader`).
 *
 * Écritures : les corps sont réduits aux champs acceptés par les schémas stricts du contrat
 * (une clé inconnue serait refusée) ; chaque modification porte la `version` connue (409
 * `version_conflict` si elle a changé).
 */
import {
  CreateMapToken,
  MAP_BATCH_MAX,
  MAP_LAYERS,
  UpdateMapScene as UpdateMapSceneSchema,
  UpdateMapToken,
  type ArrangeMapItems,
  type CreateMapGroup,
  type CreateMapLayer,
  type CreateMapScene,
  type MapArrangeResult,
  type MapGroup,
  type MapLayerBatchResult,
  type MapLayerPath,
  type MapScene,
  type MapSettings,
  type MapSnapshot,
  type MapToken,
  type TravelToMap,
  type UpdateMapGroup,
  type UpdateMapScene,
  type UpdateMapSettings,
} from '@vtt/contracts';
import { api } from '@/lib/api';
import { MAX_SIDE, prepareImage } from '@/lib/uploads/image';
import { uploadFile, type UploadProgress } from '@/lib/uploads/uploader';
import type { EngineBackend } from './engine/map-engine';
import { collectionByKey } from './store/collections';
import type { ArrangeSender, EntityUpdate, Persistence } from './store/commands';
import type { MapDto } from './store/map-store';

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const campaignUrl = (campaignId: string, path = '') =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}${path}`;

// ─── Champs acceptés par un schéma strict ────────────────────────────────────

/** Clés d'un schéma Zod objet (ou d'une union d'objets). */
function keysOf(schema: unknown): ReadonlySet<string> {
  const s = schema as { shape?: Record<string, unknown>; options?: unknown[] };
  if (s.shape) return new Set(Object.keys(s.shape));
  if (Array.isArray(s.options)) return new Set(s.options.flatMap((o) => [...keysOf(o)]));
  return new Set();
}

/** Garde les champs permis (et retire les `undefined`). */
function pick(data: Record<string, unknown>, keys: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (keys.has(k) && v !== undefined) out[k] = v;
  return out;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── Persistance des couches (`/batch`) ──────────────────────────────────────

/**
 * Persistance d'une couche au contrat commun : tout passe par `POST …/<couche>/batch` (500 au
 * plus par envoi), en une transaction par envoi.
 */
export function layerPersistence(base: string, path: MapLayerPath): Persistence<MapDto> {
  const def = MAP_LAYERS[path];
  const createKeys = keysOf(def.create);
  const updateKeys = keysOf(def.update);
  const url = `${base}/${path}/batch`;
  return {
    async create(drafts) {
      const out: MapDto[] = [];
      for (const part of chunks(drafts, MAP_BATCH_MAX)) {
        const r = await api<MapLayerBatchResult<MapDto>>(url, {
          method: 'POST',
          ...json({ create: part.map((d) => pick(d, createKeys)) }),
        });
        out.push(...r.created);
      }
      return out;
    },
    async update(updates) {
      const out = new Map<string, MapDto>();
      for (const part of chunks(updates, MAP_BATCH_MAX)) {
        const r = await api<MapLayerBatchResult<MapDto>>(url, {
          method: 'POST',
          ...json({
            update: part.map((u) => ({
              ...pick(u.changes as Record<string, unknown>, updateKeys),
              id: u.after.id,
              version: u.version,
            })),
          }),
        });
        for (const item of r.updated) out.set(item.id, item);
      }
      return updates.map((u) => out.get(u.after.id) ?? u.after);
    },
    async remove(items) {
      for (const part of chunks(items, MAP_BATCH_MAX))
        await api<MapLayerBatchResult<MapDto>>(url, {
          method: 'POST',
          ...json({ delete: part.map((i) => i.id) }),
        });
    },
    /** Créer, modifier et supprimer en un envoi (une transaction ; 500 de chaque au plus). */
    async batch({ create, update, remove }) {
      const created: MapDto[] = [];
      const updated = new Map<string, MapDto>();
      const total = Math.max(create.length, update.length, remove.length, 1);
      for (let i = 0; i < total; i += MAP_BATCH_MAX) {
        const r = await api<MapLayerBatchResult<MapDto>>(url, {
          method: 'POST',
          ...json({
            create: create.slice(i, i + MAP_BATCH_MAX).map((d) => pick(d, createKeys)),
            update: update.slice(i, i + MAP_BATCH_MAX).map((u) => ({
              ...pick(u.changes as Record<string, unknown>, updateKeys),
              id: u.after.id,
              version: u.version,
            })),
            delete: remove.slice(i, i + MAP_BATCH_MAX).map((x) => x.id),
          }),
        });
        created.push(...r.created);
        for (const item of r.updated) updated.set(item.id, item);
      }
      return { created, updated: update.map((u) => updated.get(u.after.id) ?? u.after) };
    },
  };
}

/**
 * Persistance des tokens : un glisser (seule la position change) part en une fois par
 * `/tokens/move` ; le reste par `PATCH` token par token. Créer pose un personnage engagé
 * (MJ) ; supprimer retire le token (le personnage reste engagé). Les PNJ en une fois
 * (`/npcs`) et la duplication d'un PNJ relèvent du module `tokens`.
 */
export function tokenPersistence(base: string): Persistence<MapDto> {
  const createKeys = keysOf(CreateMapToken);
  const updateKeys = keysOf(UpdateMapToken);
  const onlyPos = (u: EntityUpdate<MapDto>) => Object.keys(u.changes).every((k) => k === 'pos');
  return {
    async create(drafts) {
      return Promise.all(
        drafts.map((d) =>
          api<MapDto>(`${base}/tokens`, { method: 'POST', ...json(pick(d, createKeys)) }),
        ),
      );
    },
    async update(updates) {
      if (updates.every(onlyPos)) {
        const out = new Map<string, MapDto>();
        for (const part of chunks(updates, 200)) {
          const r = await api<{ items: MapToken[] }>(`${base}/tokens/move`, {
            method: 'POST',
            ...json({
              moves: part.map((u) => ({
                tokenId: u.after.id,
                pos: u.after.pos,
                version: u.version,
              })),
            }),
          });
          for (const t of r.items) out.set(t.id, t as unknown as MapDto);
        }
        return updates.map((u) => out.get(u.after.id) ?? u.after);
      }
      return Promise.all(
        updates.map((u) =>
          api<MapDto>(`${base}/tokens/${encodeURIComponent(u.after.id)}`, {
            method: 'PATCH',
            ...json({
              ...pick(u.changes as Record<string, unknown>, updateKeys),
              version: u.version,
            }),
          }),
        ),
      );
    },
    async remove(items) {
      await Promise.all(
        items.map((t) =>
          api<void>(`${base}/tokens/${encodeURIComponent(t.id)}`, { method: 'DELETE' }),
        ),
      );
    },
  };
}

// ─── Carte ouverte ───────────────────────────────────────────────────────────

export interface MapApiClient extends EngineBackend {
  readonly campaignId: string;
  readonly mapId: string;
  /** Chargement initial, filtré pour l'appelant. */
  snapshot(): Promise<MapSnapshot>;
  settings(): Promise<MapSettings>;
  /** Relit une couche entière (clé du magasin), filtrée pour l'appelant. */
  list(key: string): Promise<MapDto[]>;
  /** Persistance d'une couche (clé du magasin) : `/batch`, ou routes des tokens. */
  collection(key: string): Persistence<MapDto>;
  /** Calque et ordre d'une sélection, en une transaction ; rend les éléments à jour par couche. */
  arrange: ArrangeSender;
  updateScene(patch: UpdateMapScene, version?: number): Promise<MapScene>;
}

export function createMapApi(campaignId: string, mapId: string): MapApiClient {
  const base = campaignUrl(campaignId, `/maps/${encodeURIComponent(mapId)}`);
  const persistences = new Map<string, Persistence<MapDto>>();
  const sceneKeys = keysOf(UpdateMapSceneSchema);

  return {
    campaignId,
    mapId,
    snapshot: () => api<MapSnapshot>(base),
    settings: () => mapsApi.settings(campaignId),
    async list(key) {
      const def = collectionByKey(key);
      if (!def) return [];
      const r = await api<{ items: MapDto[] }>(`${base}/${def.path}`);
      return r.items;
    },
    collection(key) {
      let p = persistences.get(key);
      if (!p) {
        const def = collectionByKey(key);
        if (!def) throw new Error(`Couche inconnue : ${key}`);
        p =
          def.key === 'tokens'
            ? tokenPersistence(base)
            : layerPersistence(base, def.path as MapLayerPath);
        persistences.set(key, p);
      }
      return p;
    },
    async arrange(items) {
      const body: ArrangeMapItems = { items: items as ArrangeMapItems['items'] };
      const r = await api<MapArrangeResult>(`${base}/arrange`, { method: 'POST', ...json(body) });
      return r as unknown as Partial<Record<string, readonly MapDto[]>>;
    },
    async deleteLayer(id, moveTo) {
      const q = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
      await api<void>(`${base}/layers/${encodeURIComponent(id)}${q}`, { method: 'DELETE' });
    },
    updateScene(patch, version) {
      return api<MapScene>(base, {
        method: 'PATCH',
        ...json({
          ...pick(patch as Record<string, unknown>, sceneKeys),
          ...(version ? { version } : {}),
        }),
      });
    },
    async rescale(sx, sy) {
      await api<unknown>(`${base}/rescale`, { method: 'POST', ...json({ sx, sy }) });
    },
  };
}

// ─── Campagne : scènes, dossiers, réglages, voyage, médias ───────────────────

export const mapsApi = {
  list: async (campaignId: string) =>
    (await api<{ items: MapScene[] }>(campaignUrl(campaignId, '/maps'))).items,

  create: (campaignId: string, body: CreateMapScene) =>
    api<MapScene>(campaignUrl(campaignId, '/maps'), { method: 'POST', ...json(body) }),

  update: (campaignId: string, mapId: string, patch: UpdateMapScene) =>
    api<MapScene>(campaignUrl(campaignId, `/maps/${encodeURIComponent(mapId)}`), {
      method: 'PATCH',
      ...json(patch),
    }),

  remove: (campaignId: string, mapId: string) =>
    api<void>(campaignUrl(campaignId, `/maps/${encodeURIComponent(mapId)}`), { method: 'DELETE' }),

  /** Tokens présents sur une carte (filtrés pour l'appelant). */
  tokens: async (campaignId: string, mapId: string) =>
    (
      await api<{ items: MapToken[] }>(
        campaignUrl(campaignId, `/maps/${encodeURIComponent(mapId)}/tokens`),
      )
    ).items,

  /** Amène des personnages sur la carte ; sans `characterIds` : tout le groupe (MJ). */
  travel: async (campaignId: string, mapId: string, body: TravelToMap = {}) =>
    (
      await api<{ items: MapToken[] }>(
        campaignUrl(campaignId, `/maps/${encodeURIComponent(mapId)}/travel`),
        { method: 'POST', ...json(body) },
      )
    ).items,

  groups: async (campaignId: string) =>
    (await api<{ items: MapGroup[] }>(campaignUrl(campaignId, '/map-groups'))).items,

  createGroup: (campaignId: string, body: CreateMapGroup) =>
    api<MapGroup>(campaignUrl(campaignId, '/map-groups'), { method: 'POST', ...json(body) }),

  updateGroup: (campaignId: string, groupId: string, patch: UpdateMapGroup) =>
    api<MapGroup>(campaignUrl(campaignId, `/map-groups/${encodeURIComponent(groupId)}`), {
      method: 'PATCH',
      ...json(patch),
    }),

  removeGroup: (campaignId: string, groupId: string) =>
    api<void>(campaignUrl(campaignId, `/map-groups/${encodeURIComponent(groupId)}`), {
      method: 'DELETE',
    }),

  settings: (campaignId: string) => api<MapSettings>(campaignUrl(campaignId, '/map-settings')),

  updateSettings: (campaignId: string, patch: UpdateMapSettings) =>
    api<MapSettings>(campaignUrl(campaignId, '/map-settings'), {
      method: 'PATCH',
      ...json(patch),
    }),

  /** Nouveau calque (en haut de la pile sans `sortOrder`). */
  createLayer: (campaignId: string, mapId: string, body: CreateMapLayer) =>
    api<MapDto>(campaignUrl(campaignId, `/maps/${encodeURIComponent(mapId)}/layers`), {
      method: 'POST',
      ...json(body),
    }),

  /**
   * Envoie un média de la carte (route commune d'envoi, docs/uploads.md) et rend son adresse
   * publique : image compressée en WebP à la taille de l'usage, vidéo telle quelle ; progression
   * par `onProgress`.
   */
  async upload(
    campaignId: string,
    file: File,
    usage: 'map-background' | 'map-object' | 'npc-image' = 'map-object',
    onProgress?: (p: UploadProgress) => void,
  ): Promise<string> {
    const ready = await prepareImage(file, { maxSide: MAX_SIDE[usage] });
    return uploadFile(
      { kind: 'campaign', id: campaignId },
      usage,
      ready,
      onProgress ? { onProgress } : {},
    );
  },
};

/** Clés TanStack Query de la carte (sous la campagne, frontend-architecture § 4.1). */
export const mapKeys = {
  scope: (campaignId: string) => ['campaign', campaignId, 'map'] as const,
  list: (campaignId: string) => ['campaign', campaignId, 'map', 'list'] as const,
  groups: (campaignId: string) => ['campaign', campaignId, 'map', 'groups'] as const,
  settings: (campaignId: string) => ['campaign', campaignId, 'map', 'settings'] as const,
  /** Carte où se trouve un de mes personnages (joueur). */
  whereAmI: (campaignId: string, characterIds: readonly string[]) =>
    ['campaign', campaignId, 'map', 'where', ...characterIds] as const,
};
