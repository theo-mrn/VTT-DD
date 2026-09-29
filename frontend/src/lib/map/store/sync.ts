/**
 * Synchronisation de la carte ouverte (docs/carte.md § 7) : chargement REST, événements du bus,
 * relectures.
 *
 * - Chargement : `GET /maps/:mapId` (tout, filtré pour l'appelant) et `GET /map-settings`.
 * - Événements `map.*`, `map_settings.*`, `token.*` et `map_<couche>.*` (via `useCampaignEvents`)
 *   appliqués au magasin ; un élément dont la `version` n'est pas plus récente est ignoré, un
 *   élément en attente (écriture optimiste) n'est pas touché.
 * - `generation` (premier abonnement, reconnexion, `resync`) : relecture complète.
 * - Événement expurgé, élément inconnu qui arrive : la couche est relue.
 * - Joueur : ses tokens bougent, une porte s'ouvre ou se ferme, un calque redevient visible,
 *   l'échelle change, ou le serveur l'en prévient (`map.visibility_changed`, ciblé) : son champ
 *   de vision a changé, le serveur filtre autrement ; tokens et objets sont relus (regroupés en
 *   une relecture par 100 ms).
 * - `*.hidden` ne concerne que les joueurs qui voyaient l'élément : le MJ l'ignore.
 *
 * `MapSync` est une classe pure (testable) ; `useMapSync` la branche sur le temps réel.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useCampaignEvents, type RealtimeEvent } from '@/lib/realtime';
import { collectionByDomain, MAP_COLLECTIONS, STACKED_COLLECTIONS } from './collections';
import type { MapDto, MapStore, SceneLike, SettingsLike } from './map-store';

/** Ce que la synchronisation lit au serveur (`createMapApi`). */
export interface MapReader {
  snapshot(): Promise<{ map: SceneLike } & Record<string, unknown>>;
  settings(): Promise<SettingsLike>;
  list(key: string): Promise<MapDto[]>;
}

export interface SyncViewer {
  role: 'gm' | 'player' | 'spectator';
  characterIds: readonly string[];
}

/** Types d'événements suivis (domaines entiers). */
export const MAP_EVENT_TYPES: readonly string[] = [
  'map.*',
  'map_settings.*',
  ...MAP_COLLECTIONS.map((c) => `${c.domain}.*`),
];

/** Délai de regroupement des relectures. */
export const REFETCH_DEBOUNCE_MS = 100;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export interface MapSyncOptions {
  store: MapStore;
  reader: MapReader;
  viewer: () => SyncViewer;
  /** Événement de la carte, après application (modules : fouille, butin…). */
  onEvent?(e: RealtimeEvent): void;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

export class MapSync {
  private loadSeq = 0;
  private pendingKeys = new Set<string>();
  private refetchTimer: unknown = null;
  private disposed = false;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  constructor(private readonly opts: MapSyncOptions) {
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  private get store() {
    return this.opts.store.getState();
  }

  private get mapId() {
    return this.store.mapId;
  }

  /** Chargement complet ; une relecture plus récente l'emporte sur une plus ancienne. */
  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    try {
      const [snapshot, settings] = await Promise.all([
        this.opts.reader.snapshot(),
        this.opts.reader.settings(),
      ]);
      if (this.disposed || seq !== this.loadSeq) return;
      const { map, ...rest } = snapshot;
      const collections: Record<string, MapDto[]> = {};
      const extras: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (Array.isArray(value)) collections[key] = value as MapDto[];
        else extras[key] = value;
      }
      this.store.hydrate({ scene: map, settings, collections, extras });
    } catch (err) {
      if (this.disposed || seq !== this.loadSeq) return;
      const status = (err as { status?: number }).status;
      this.store.setStatus(status === 404 || status === 403 ? 'gone' : 'error', err);
    }
  }

  /** Relit des couches (regroupé : une relecture par 100 ms au plus). */
  refetch(keys: Iterable<string>) {
    for (const k of keys) this.pendingKeys.add(k);
    if (this.refetchTimer !== null || this.disposed) return;
    this.refetchTimer = this.setTimer(() => {
      this.refetchTimer = null;
      const keys = [...this.pendingKeys];
      this.pendingKeys.clear();
      void this.refetchNow(keys);
    }, REFETCH_DEBOUNCE_MS);
  }

  /** Relit tout de suite des couches (après un 409, une commande relit ses éléments). */
  async refetchNow(keys: readonly string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        try {
          const items = await this.opts.reader.list(key);
          if (!this.disposed) this.store.replaceCollection(key, items);
        } catch {
          // La relecture complète suivante rattrapera
        }
      }),
    );
  }

  /** Applique un événement du bus. */
  handle(e: RealtimeEvent) {
    if (this.disposed) return;
    const { type, payload, aggregate } = e.event;
    const dot = type.indexOf('.');
    const domain = type.slice(0, dot);
    const action = type.slice(dot + 1);
    const gm = this.opts.viewer().role === 'gm';

    if (domain === 'map') this.handleMap(action, aggregate.id, payload, gm, e.redacted);
    else if (domain === 'map_settings') {
      if (isObject(payload) && !e.redacted) {
        const before = this.store.settings;
        this.store.patchSettings(payload as Partial<SettingsLike>);
        const after = this.store.settings;
        // Échelle changée : rayons des lumières et tailles des tokens, donc la vue d'un joueur
        if (
          before &&
          after !== before &&
          (after?.pixelsPerUnit !== before.pixelsPerUnit || after?.tokenScale !== before.tokenScale)
        )
          this.visionChanged();
      }
    } else if (domain === 'token') this.handleToken(action, payload, e.redacted, aggregate.id);
    else {
      const def = collectionByDomain(domain);
      if (def) this.handleLayer(def.key, action, payload, e.redacted, aggregate.id, gm);
    }
    this.opts.onEvent?.(e);
  }

  private handleMap(
    action: string,
    id: string,
    payload: Record<string, unknown>,
    gm: boolean,
    redacted: boolean,
  ) {
    if (id !== this.mapId) return;
    switch (action) {
      case 'updated':
        if (redacted || !isObject(payload) || payload.id !== this.mapId) {
          void this.load();
          return;
        }
        this.store.setScene(payload as SceneLike);
        return;
      case 'deleted':
        this.store.setStatus('gone');
        return;
      case 'hidden':
        if (!gm) this.store.setStatus('gone');
        return;
      case 'rescaled':
        // Toute la géométrie a changé
        void this.load();
        return;
      case 'visibility_changed':
        // Ciblé par le serveur : un observateur, une porte, un mur ou une lumière a changé
        this.visionChanged();
        return;
    }
  }

  private isMine(characterId: unknown) {
    return typeof characterId === 'string' && this.opts.viewer().characterIds.includes(characterId);
  }

  /** Joueur : son champ de vision a changé, le serveur filtre autrement. */
  private visionChanged() {
    if (this.opts.viewer().role === 'gm') return;
    this.refetch(['tokens', 'objects']);
  }

  private handleToken(
    action: string,
    payload: Record<string, unknown>,
    redacted: boolean,
    id: string,
  ) {
    const store = this.store;
    if (redacted) {
      this.refetch(['tokens']);
      return;
    }
    switch (action) {
      case 'created':
      case 'updated': {
        if (payload.mapId !== this.mapId) {
          // Le token a quitté cette carte
          if (store.collections.tokens?.has(String(payload.id)))
            store.remove('tokens', [String(payload.id)]);
          return;
        }
        store.upsert('tokens', [payload as MapDto]);
        return;
      }
      case 'moved': {
        const to = payload.to as { mapId: string; x: number; y: number } | undefined;
        const from = payload.from as { mapId: string } | null | undefined;
        const tokenId = String(payload.tokenId ?? id);
        if (to?.mapId === this.mapId) {
          const known = store.collections.tokens?.get(tokenId);
          if (known) {
            const version = typeof payload.version === 'number' ? payload.version : undefined;
            if (version !== undefined)
              store.upsert('tokens', [{ ...known, pos: { x: to.x, y: to.y }, version }]);
            else store.patchItem('tokens', tokenId, { pos: { x: to.x, y: to.y } });
          } else this.refetch(['tokens']);
        } else if (from?.mapId === this.mapId) {
          store.remove('tokens', [tokenId]);
        }
        if (this.isMine(payload.characterId)) this.visionChanged();
        return;
      }
      case 'hidden':
        // Le MJ voit tout : `hidden` ne concerne que les joueurs qui le voyaient
        if (this.opts.viewer().role === 'gm') return;
        store.remove('tokens', [String(payload.id ?? id)]);
        return;
      case 'deleted':
        store.remove('tokens', [String(payload.id ?? id)]);
        return;
    }
  }

  private handleLayer(
    key: string,
    action: string,
    payload: Record<string, unknown>,
    redacted: boolean,
    id: string,
    gm: boolean,
  ) {
    const store = this.store;
    if (redacted) {
      this.refetch([key]);
      return;
    }
    if (payload.mapId !== undefined && payload.mapId !== this.mapId) return;
    switch (action) {
      case 'created':
      case 'updated': {
        const item = payload as MapDto;
        const before = store.collections[key]?.get(item.id);
        // Calque redevenu visible pour un joueur : son contenu n'est pas chez lui, relecture
        if (key === 'layers' && !gm && !before) {
          void this.load();
          return;
        }
        store.upsert(key, [item]);
        // Porte ouverte ou fermée : la vue d'un joueur change
        if (key === 'obstacles' && before && before.isOpen !== item.isOpen) this.visionChanged();
        return;
      }
      case 'deleted':
        store.remove(key, [String(payload.id ?? id)]);
        return;
      case 'hidden': {
        // Le MJ voit tout : `hidden` ne concerne que les joueurs qui le voyaient
        if (gm) return;
        const hiddenId = String(payload.id ?? id);
        store.remove(key, [hiddenId]);
        // Calque masqué aux joueurs : tout son contenu disparaît
        if (key === 'layers')
          for (const k of STACKED_COLLECTIONS) {
            const items = store.collections[k];
            if (!items) continue;
            const ids = [...items.values()].filter((i) => i.layerId === hiddenId).map((i) => i.id);
            if (ids.length) store.remove(k, ids);
          }
        return;
      }
      case 'cleared':
        if (Array.isArray(payload.ids)) store.remove(key, payload.ids.map(String));
        return;
    }
  }

  dispose() {
    this.disposed = true;
    if (this.refetchTimer !== null) this.clearTimer(this.refetchTimer);
    this.refetchTimer = null;
  }
}

/**
 * Branche la carte sur le temps réel : chargement, puis événements, relecture complète à
 * chaque `generation`. Renvoie la synchronisation (relectures des commandes après un 409) et
 * l'état du direct.
 */
export function useMapSync(opts: {
  campaignId: string;
  store: MapStore;
  reader: MapReader;
  viewer: SyncViewer;
  onEvent?(e: RealtimeEvent): void;
}): { sync: MapSync; live: boolean } {
  const viewerRef = useRef(opts.viewer);
  viewerRef.current = opts.viewer;
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const [sync] = useState(
    () =>
      new MapSync({
        store: opts.store,
        reader: opts.reader,
        viewer: () => viewerRef.current,
        onEvent: (e) => onEventRef.current?.(e),
      }),
  );
  useEffect(() => () => sync.dispose(), [sync]);

  const { live, generation } = useCampaignEvents(opts.campaignId, MAP_EVENT_TYPES, (e) =>
    sync.handle(e),
  );

  // Premier chargement, puis relecture complète à chaque génération (reconnexion, resync)
  useEffect(() => {
    void sync.load();
  }, [sync, generation]);

  // Sans temps réel, relecture de secours toutes les 20 s
  useEffect(() => {
    if (live) return;
    const t = setInterval(() => void sync.load(), 20_000);
    return () => clearInterval(t);
  }, [live, sync]);

  return { sync, live };
}
