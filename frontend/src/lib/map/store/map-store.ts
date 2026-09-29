/**
 * État de la carte ouverte (docs/carte.md § 7) : un magasin zustand vanilla, hors de React,
 * normalisé par couche. Il tient la scène, les réglages et, pour chaque couche (`tokens`,
 * `objects`, `obstacles`…), une `Map<id, dto>` immuable : une couche modifiée est une nouvelle
 * `Map`, les éléments inchangés gardent leur référence. Le moteur s'y abonne et applique des
 * diffs (entité ajoutée, changée, retirée) ; React lit par sélecteurs.
 *
 * Versions : chaque élément porte la `version` du serveur. Une écriture venue du réseau
 * (réponse REST, événement du bus) n'est appliquée que si elle est plus récente ; l'optimisme
 * des commandes passe par `force`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { DisplaySetting } from '../engine/planes';

/** Élément de carte tel que le serveur le rend : au moins un identifiant et une version. */
export interface MapDto {
  id: string;
  version: number;
  [field: string]: unknown;
}

/**
 * Ce que le moteur lit de la scène : le sous-ensemble de `MapScene` (@vtt/contracts) dont il a
 * besoin. Une `MapScene` s'y range telle quelle ; les tests en fabriquent une partielle.
 */
export interface SceneLike {
  id: string;
  version: number;
  name?: string;
  backgroundUrl?: string | null;
  width?: number | null;
  height?: number | null;
  /** Familles affichées (`map.display`). */
  display?: DisplaySetting | null;
  [field: string]: unknown;
}

/** Ce que le moteur lit des réglages de carte de la campagne (`MapSettings`, `/map-settings`). */
export interface SettingsLike {
  version: number;
  partyMapId?: string | null;
  pixelsPerUnit?: number;
  tokenScale?: number;
  unitName?: string;
  shadowOpacity?: number;
  [field: string]: unknown;
}

/** Nom de l'unité de la carte (« m », « cases »…), comme le serveur par défaut : `m`. */
export const unitNameOf = (settings: SettingsLike | null | undefined): string =>
  typeof settings?.unitName === 'string' && settings.unitName.trim() ? settings.unitName : 'm';

export type MapStatus = 'loading' | 'ready' | 'error' | 'gone';

export type Collections = Readonly<Record<string, ReadonlyMap<string, MapDto>>>;

export interface MapSnapshotInput {
  scene: SceneLike;
  settings: SettingsLike | null;
  /** Couches du chargement initial, par clé du magasin. */
  collections: Record<string, readonly MapDto[]>;
  /** Autres parties du chargement (brouillard en cases…). */
  extras?: Record<string, unknown>;
}

export interface MapStoreState {
  readonly campaignId: string;
  readonly mapId: string;
  status: MapStatus;
  error: unknown;
  scene: SceneLike | null;
  settings: SettingsLike | null;
  collections: Collections;
  extras: Readonly<Record<string, unknown>>;
  /**
   * Éléments dont une écriture optimiste attend la réponse du serveur, avec le nombre de
   * commandes en vol. Le réseau ne les écrase pas : la réponse de la commande fait foi.
   */
  pending: ReadonlyMap<string, number>;
  /** Nombre de chargements complets (relectures comprises). */
  loads: number;

  /** Chargement complet (premier chargement, `generation`) : remplace tout, sauf l'optimiste en cours. */
  hydrate(snapshot: MapSnapshotInput): void;
  setStatus(status: MapStatus, error?: unknown): void;
  /** Scène plus récente (ou `force`). */
  setScene(scene: SceneLike, options?: { force?: boolean }): void;
  /** Réglages : fusion d'une charge complète ou partielle, si plus récente (ou sans version). */
  patchSettings(patch: Partial<SettingsLike>, options?: { force?: boolean }): void;
  /**
   * Ajoute ou remplace des éléments plus récents. Sans `force` (réseau), un élément en attente
   * n'est pas touché ; `force` (commandes) écrit tout.
   */
  upsert(collection: string, items: readonly MapDto[], options?: { force?: boolean }): void;
  remove(collection: string, ids: readonly string[]): void;
  /**
   * Modifie des champs d'un élément sans version (événement qui n'en porte pas, comme
   * `token.moved`) ; ignoré si l'élément est inconnu ou en attente.
   */
  patchItem(collection: string, id: string, patch: Record<string, unknown>): void;
  /** Liste complète d'une couche relue en REST : fait autorité, sauf l'optimiste en cours. */
  replaceCollection(collection: string, items: readonly MapDto[]): void;
  setExtra(key: string, value: unknown): void;
  /** Marque des éléments en attente (compteur : plusieurs commandes peuvent se chevaucher). */
  markPending(ids: readonly string[], pending: boolean): void;
}

export type MapStore = StoreApi<MapStoreState>;

const EMPTY: ReadonlyMap<string, MapDto> = new Map();
const NO_PENDING: ReadonlyMap<string, number> = new Map();

/** Couche du magasin (Map vide et stable si absente). */
export const collectionOf = (s: Pick<MapStoreState, 'collections'>, key: string) =>
  s.collections[key] ?? EMPTY;

/** Élément d'une couche. */
export const itemOf = (s: Pick<MapStoreState, 'collections'>, key: string, id: string) =>
  s.collections[key]?.get(id);

export function createMapStore(campaignId: string, mapId: string): MapStore {
  return createStore<MapStoreState>()((set, get) => {
    /** Fusion d'une liste qui fait autorité avec l'état local (optimiste, versions plus récentes). */
    const merge = (current: ReadonlyMap<string, MapDto>, incoming: readonly MapDto[]) => {
      const pending = get().pending;
      const next = new Map<string, MapDto>();
      for (const item of incoming) {
        const local = current.get(item.id);
        if (local && (pending.has(item.id) || local.version > item.version))
          next.set(item.id, local);
        else next.set(item.id, local && local.version === item.version ? local : item);
      }
      // Éléments créés localement, pas encore confirmés : ils restent
      for (const [id, local] of current) if (!next.has(id) && pending.has(id)) next.set(id, local);
      return next;
    };

    return {
      campaignId,
      mapId,
      status: 'loading',
      error: null,
      scene: null,
      settings: null,
      collections: {},
      extras: {},
      pending: NO_PENDING,
      loads: 0,

      hydrate(snapshot) {
        const current = get().collections;
        const collections: Record<string, ReadonlyMap<string, MapDto>> = {};
        for (const [key, items] of Object.entries(snapshot.collections))
          collections[key] = merge(current[key] ?? EMPTY, items);
        set((s) => ({
          status: 'ready',
          error: null,
          scene: snapshot.scene,
          settings: snapshot.settings ?? s.settings,
          collections,
          extras: { ...snapshot.extras },
          loads: s.loads + 1,
        }));
      },

      setStatus(status, error = null) {
        set({ status, error });
      },

      setScene(scene, options) {
        const current = get().scene;
        if (
          current &&
          !options?.force &&
          current.id === scene.id &&
          current.version >= scene.version
        )
          return;
        set({ scene });
      },

      patchSettings(patch, options) {
        const current = get().settings;
        if (
          current &&
          !options?.force &&
          typeof patch.version === 'number' &&
          current.version >= patch.version
        )
          return;
        set({ settings: { ...(current ?? { version: 0 }), ...patch } as SettingsLike });
      },

      upsert(collection, items, options) {
        if (!items.length) return;
        const current = get().collections[collection] ?? EMPTY;
        const pending = get().pending;
        let next: Map<string, MapDto> | null = null;
        for (const item of items) {
          const local = (next ?? current).get(item.id);
          if (local === item) continue;
          if (!options?.force && (pending.has(item.id) || (local && local.version >= item.version)))
            continue;
          next ??= new Map(current);
          next.set(item.id, item);
        }
        if (next) set((s) => ({ collections: { ...s.collections, [collection]: next! } }));
      },

      remove(collection, ids) {
        const current = get().collections[collection];
        if (!current || !ids.some((id) => current.has(id))) return;
        const next = new Map(current);
        for (const id of ids) next.delete(id);
        set((s) => ({ collections: { ...s.collections, [collection]: next } }));
      },

      patchItem(collection, id, patch) {
        const current = get().collections[collection];
        const item = current?.get(id);
        if (!current || !item || get().pending.has(id)) return;
        const next = new Map(current);
        next.set(id, { ...item, ...patch });
        set((s) => ({ collections: { ...s.collections, [collection]: next } }));
      },

      replaceCollection(collection, items) {
        const current = get().collections[collection] ?? EMPTY;
        const next = merge(current, items);
        set((s) => ({ collections: { ...s.collections, [collection]: next } }));
      },

      setExtra(key, value) {
        set((s) => ({ extras: { ...s.extras, [key]: value } }));
      },

      markPending(ids, pending) {
        if (!ids.length) return;
        const next = new Map(get().pending);
        for (const id of ids) {
          const n = (next.get(id) ?? 0) + (pending ? 1 : -1);
          if (n > 0) next.set(id, n);
          else next.delete(id);
        }
        set({ pending: next.size ? next : NO_PENDING });
      },
    };
  });
}
