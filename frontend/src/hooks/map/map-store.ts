'use client';

/**
 * État partagé de la carte d'une campagne : ce que les `onSnapshot` Firestore
 * et les écouteurs RTDB de l'ancienne app tenaient à jour, relu en REST
 * (lib/maps.ts) puis entretenu par les événements du temps réel (`map.*`,
 * `token.*`, `map_<couche>.*`, docs/map.md).
 *
 * Un seul état par campagne, lu par les hooks repris de l'ancienne carte
 * (useMapData, useRtdbCollections, useCharacterPositions…) et mis à jour par
 * les écritures (map-writes.ts) dès la réponse du serveur, sans attendre
 * l'événement : celui-ci, déjà appliqué, est alors ignoré (même version).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { errorMessage } from '@/lib/api';
import { listCampaignCharacters, type CampaignCharacter } from '@/lib/campaigns';
import {
  activeCombatant,
  getCombatState,
  getMapSettings,
  listMaps,
  listTokens,
  loadMap,
  type GameMap,
  type MapFog,
  type MapLoad,
  type MapSettings,
  type MapToken,
} from '@/lib/maps';
import { useCampaignEvents, type RealtimeEvent } from '@/lib/realtime';
import { clearDragPosition } from './map-ephemeral';

/** Couches du chargement initial (clé de `MapLoad`). */
export type MapLayerKey =
  | 'objects'
  | 'lights'
  | 'obstacles'
  | 'drawings'
  | 'notes'
  | 'musicZones'
  | 'portals'
  | 'measurements';

/** Domaine des événements d'une couche → clé de l'état. */
const LAYER_OF_DOMAIN: Record<string, MapLayerKey> = {
  map_object: 'objects',
  map_light: 'lights',
  map_obstacle: 'obstacles',
  map_drawing: 'drawings',
  map_note: 'notes',
  map_music_zone: 'musicZones',
  map_portal: 'portals',
  map_measurement: 'measurements',
};

export interface MapStoreState {
  campaignId: string;
  isGm: boolean;
  /** Personnages de l'appelant (incarné et possédés). */
  myCharacterIds: string[];
  maps: GameMap[];
  mapsLoaded: boolean;
  settings: MapSettings | null;
  settingsLoaded: boolean;
  /** Personnages engagés (nom, avatar, camp), par identifiant. */
  characters: Record<string, CampaignCharacter>;
  /** Personnage dont c'est le tour de combat. */
  activeCharacterId: string | null;
  /** Carte où se trouve mon personnage ; `undefined` tant qu'on ne sait pas, null s'il n'est sur aucune. */
  myMapId: string | null | undefined;
  /** Carte suivie ; null : aucune. */
  mapId: string | null;
  /** Contenu de la carte suivie, une fois chargé. */
  data: MapLoad | null;
  mapLoading: boolean;
  mapError: string | null;
}

type Listener = () => void;

const sameId = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

class MapStore {
  state: MapStoreState;
  private listeners = new Set<Listener>();
  private mapRequest = 0;
  private tokensTimer: ReturnType<typeof setTimeout> | null = null;
  private campaignLoaded = false;

  constructor(campaignId: string) {
    this.state = {
      campaignId,
      isGm: false,
      myCharacterIds: [],
      maps: [],
      mapsLoaded: false,
      settings: null,
      settingsLoaded: false,
      characters: {},
      activeCharacterId: null,
      myMapId: undefined,
      mapId: null,
      data: null,
      mapLoading: false,
      mapError: null,
    };
  }

  // ── Observable ──

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<MapStoreState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private setData(patch: Partial<MapLoad>) {
    if (!this.state.data) return;
    this.set({ data: { ...this.state.data, ...patch } });
  }

  get campaignId() {
    return this.state.campaignId;
  }

  get mapId() {
    return this.state.mapId;
  }

  /** Carte par défaut (le « fond global » de l'ancienne app). */
  get defaultMap(): GameMap | null {
    return this.state.maps.find((m) => m.isDefault) ?? null;
  }

  // ── Chargement ──

  configure(isGm: boolean, myCharacterIds: string[]) {
    const ids = myCharacterIds.filter(Boolean);
    if (this.state.isGm === isGm && ids.join('|') === this.state.myCharacterIds.join('|')) return;
    this.set({ isGm, myCharacterIds: ids });
    if (this.campaignLoaded) void this.locateMyCharacter();
  }

  /** Cartes, réglages, personnages engagés et tour de combat. */
  async loadCampaign() {
    const id = this.campaignId;
    await Promise.all([
      this.reloadMaps(),
      getMapSettings(id)
        .then((settings) => this.set({ settings, settingsLoaded: true }))
        .catch(() => this.set({ settingsLoaded: true })),
      this.reloadCharacters(),
      this.reloadCombat(),
    ]);
    this.campaignLoaded = true;
    await this.locateMyCharacter();
  }

  async reloadMaps() {
    try {
      const maps = await listMaps(this.campaignId);
      this.set({ maps, mapsLoaded: true });
    } catch {
      this.set({ mapsLoaded: true });
    }
  }

  async reloadCharacters() {
    try {
      const list = await listCampaignCharacters(this.campaignId);
      this.set({ characters: Object.fromEntries(list.map((c) => [c.characterId, c])) });
    } catch {
      /* noms et avatars indisponibles : les tokens restent affichés */
    }
  }

  async reloadCombat() {
    try {
      this.set({ activeCharacterId: activeCombatant(await getCombatState(this.campaignId)) });
    } catch {
      this.set({ activeCharacterId: null });
    }
  }

  /**
   * Carte où se trouve mon personnage (l'ancien `currentSceneId`) : un joueur
   * ne reçoit que les cartes visibles des joueurs et celles où il est ; on
   * cherche son token sur chacune.
   */
  async locateMyCharacter() {
    const mine = this.state.myCharacterIds;
    if (!mine.length) {
      this.set({ myMapId: null });
      return;
    }
    const current = this.state.data?.tokens.find((t) =>
      mine.some((id) => sameId(id, t.characterId)),
    );
    if (current) {
      this.set({ myMapId: current.mapId });
      return;
    }
    const results = await Promise.all(
      this.state.maps.map((m) =>
        listTokens(this.campaignId, m.id)
          .then((tokens) =>
            tokens.some((t) => mine.some((id) => sameId(id, t.characterId))) ? m.id : null,
          )
          .catch(() => null),
      ),
    );
    this.set({ myMapId: results.find(Boolean) ?? null });
  }

  /** Suit une carte (null : aucune) et la charge. */
  open(mapId: string | null) {
    if (mapId === this.state.mapId && (this.state.data || this.state.mapLoading)) return;
    this.set({ mapId, data: null, mapError: null, mapLoading: !!mapId });
    if (mapId) void this.reloadMap();
  }

  async reloadMap() {
    const mapId = this.state.mapId;
    if (!mapId) return;
    const request = ++this.mapRequest;
    this.set({ mapLoading: true });
    try {
      const data = await loadMap(this.campaignId, mapId);
      if (request !== this.mapRequest || mapId !== this.state.mapId) return;
      this.set({ data, mapLoading: false, mapError: null });
      this.upsertMapInList(data.map);
    } catch (err) {
      if (request !== this.mapRequest || mapId !== this.state.mapId) return;
      this.set({ data: null, mapLoading: false, mapError: errorMessage(err) });
    }
  }

  /** Relit les tokens (filtrés par le serveur pour un joueur) : la visibilité a pu changer. */
  async reloadTokens() {
    const mapId = this.state.mapId;
    if (!mapId || !this.state.data) return;
    try {
      const tokens = await listTokens(this.campaignId, mapId);
      if (mapId !== this.state.mapId) return;
      this.setData({ tokens });
    } catch {
      /* on garde les tokens connus */
    }
  }

  /** Joueur : relecture groupée des tokens après ce qui change ce qu'il voit. */
  private scheduleTokensReload() {
    if (this.state.isGm) return;
    if (this.tokensTimer) clearTimeout(this.tokensTimer);
    this.tokensTimer = setTimeout(() => {
      this.tokensTimer = null;
      void this.reloadTokens();
    }, 300);
  }

  // ── Mises à jour locales (réponses des écritures, événements) ──

  upsertMapInList(m: GameMap) {
    const maps = this.state.maps;
    const i = maps.findIndex((x) => x.id === m.id);
    if (i >= 0 && maps[i].version > m.version) return;
    const next = i >= 0 ? maps.map((x) => (x.id === m.id ? m : x)) : [...maps, m];
    this.set({ maps: next });
    if (
      this.state.data &&
      this.state.data.map.id === m.id &&
      this.state.data.map.version <= m.version
    )
      this.setData({ map: m });
  }

  removeMapFromList(id: string) {
    this.set({ maps: this.state.maps.filter((m) => m.id !== id) });
    if (this.state.mapId === id)
      this.set({ data: null, mapError: 'Cette carte n’est plus disponible.' });
  }

  setSettings(s: Partial<MapSettings>) {
    const current = this.state.settings;
    if (current && s.version !== undefined && current.version > s.version) return;
    this.set({ settings: { ...(current ?? ({} as MapSettings)), ...s } as MapSettings });
  }

  setFog(f: MapFog) {
    const data = this.state.data;
    if (!data || f.mapId !== data.map.id) return;
    if (data.fog && data.fog.version > f.version) return;
    this.setData({ fog: f });
  }

  upsertToken(t: MapToken) {
    const data = this.state.data;
    this.trackMyToken(t.characterId, t.mapId);
    if (!data) return;
    const tokens = data.tokens;
    const i = tokens.findIndex((x) => x.id === t.id);
    if (t.mapId !== data.map.id) {
      if (i >= 0) this.setData({ tokens: tokens.filter((x) => x.id !== t.id) });
      return;
    }
    if (i >= 0 && tokens[i].version > t.version) return;
    this.setData({ tokens: i >= 0 ? tokens.map((x) => (x.id === t.id ? t : x)) : [...tokens, t] });
  }

  removeToken(tokenId: string) {
    const data = this.state.data;
    if (!data) return;
    this.setData({ tokens: data.tokens.filter((t) => t.id !== tokenId) });
  }

  private trackMyToken(characterId: string, mapId: string | null) {
    if (this.state.myCharacterIds.some((id) => sameId(id, characterId)))
      this.set({ myMapId: mapId });
  }

  upsertItem<K extends MapLayerKey>(key: K, item: MapLoad[K][number]) {
    const data = this.state.data;
    if (!data || item.mapId !== data.map.id) return;
    const list = data[key] as MapLoad[K][number][];
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0 && list[i].version > item.version) return;
    const next = i >= 0 ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
    this.setData({ [key]: next } as Partial<MapLoad>);
  }

  removeItems(key: MapLayerKey, ids: string[]) {
    const data = this.state.data;
    if (!data) return;
    const set = new Set(ids);
    const list = data[key] as { id: string }[];
    if (!list.some((x) => set.has(x.id))) return;
    this.setData({ [key]: list.filter((x) => !set.has(x.id)) } as Partial<MapLoad>);
  }

  // ── Événements du temps réel ──

  applyEvent(e: RealtimeEvent) {
    // Charge utile retirée (événement MJ reçu par son auteur) : l'écriture l'a déjà appliquée
    if (e.redacted) return;
    const type = e.event.type;
    const p = e.event.payload as Record<string, unknown>;
    const dot = type.indexOf('.');
    const domain = type.slice(0, dot);
    const action = type.slice(dot + 1);
    const currentMapId = this.state.data?.map.id ?? null;

    switch (domain) {
      case 'map':
        if (action === 'created' || action === 'updated')
          this.upsertMapInList(p as unknown as GameMap);
        else if (action === 'deleted' || action === 'hidden') this.removeMapFromList(String(p.id));
        return;
      case 'map_settings':
        this.setSettings(p as Partial<MapSettings>);
        return;
      case 'map_fog':
        this.setFog(p as unknown as MapFog);
        this.scheduleTokensReload();
        return;
      case 'token':
        this.applyTokenEvent(action, p, currentMapId);
        return;
      case 'combat':
        void this.reloadCombat();
        return;
      case 'campaign':
        if (action.startsWith('character_')) void this.reloadCharacters();
        return;
    }

    const key = LAYER_OF_DOMAIN[domain];
    if (!key) return;
    if (action === 'created' || action === 'updated')
      this.upsertItem(key, p as unknown as MapLoad[typeof key][number]);
    else if (action === 'deleted' || action === 'hidden') {
      if (!currentMapId || p.mapId === currentMapId) this.removeItems(key, [String(p.id)]);
    } else if (action === 'cleared' && p.mapId === currentMapId)
      this.removeItems(key, (p.ids as string[]) ?? []);
    if (domain === 'map_obstacle' || domain === 'map_light') this.scheduleTokensReload();
  }

  private applyTokenEvent(action: string, p: Record<string, unknown>, currentMapId: string | null) {
    if (action === 'created' || action === 'updated') {
      this.upsertToken(p as unknown as MapToken);
      return;
    }
    if (action === 'deleted' || action === 'hidden') {
      this.removeToken(String(p.id));
      if (action === 'deleted' && typeof p.characterId === 'string')
        this.trackMyToken(p.characterId, null);
      return;
    }
    if (action !== 'moved') return;
    const tokenId = String(p.tokenId);
    const characterId = String(p.characterId);
    const to = p.to as { mapId: string; x: number; y: number };
    const from = p.from as { mapId: string } | null;
    const mine = this.state.myCharacterIds.some((id) => sameId(id, characterId));
    if (mine) this.set({ myMapId: to.mapId });
    // État final arrivé : la position de glissement diffusée par l'autre client ne sert plus
    clearDragPosition(characterId);
    const data = this.state.data;
    if (!data) return;
    if (to.mapId === currentMapId) {
      const t = data.tokens.find((x) => x.id === tokenId);
      if (t) {
        if (t.pos.x !== to.x || t.pos.y !== to.y)
          this.setData({
            tokens: data.tokens.map((x) =>
              x.id === tokenId ? { ...x, pos: { x: to.x, y: to.y } } : x,
            ),
          });
      } else void this.reloadTokens();
    } else if (from?.mapId === currentMapId) this.removeToken(tokenId);
    if (mine) this.scheduleTokensReload();
  }
}

const stores = new Map<string, MapStore>();

/** État de la carte d'une campagne (un par onglet et par campagne). */
export function getMapStore(campaignId: string): MapStore {
  let s = stores.get(campaignId);
  if (!s) {
    s = new MapStore(campaignId);
    stores.set(campaignId, s);
  }
  return s;
}

export type { MapStore };

/** Types d'événements du temps réel qui touchent la carte. */
export const MAP_EVENT_TYPES = [
  'map.*',
  'map_settings.*',
  'map_fog.*',
  'token.*',
  'map_object.*',
  'map_light.*',
  'map_obstacle.*',
  'map_drawing.*',
  'map_note.*',
  'map_music_zone.*',
  'map_portal.*',
  'map_measurement.*',
  'combat.*',
  'campaign.character_added',
  'campaign.character_removed',
  'campaign.character_played',
] as const;

/** Lit l'état de la carte d'une campagne. */
export function useMapStore(campaignId: string): MapStoreState {
  const store = getMapStore(campaignId);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * Charge la campagne et garde l'état à jour avec le temps réel. À monter une
 * fois (useMapData) : relit tout au premier abonnement et quand le rejeu des
 * événements est impossible (`generation`).
 */
export function useMapStoreSync(campaignId: string, isGm: boolean, myCharacterIds: string[]) {
  const store = getMapStore(campaignId);
  const idsKey = myCharacterIds.join('|');

  useEffect(() => {
    store.configure(isGm, idsKey ? idsKey.split('|') : []);
  }, [store, isGm, idsKey]);

  const { generation } = useCampaignEvents(campaignId, MAP_EVENT_TYPES, (e) => store.applyEvent(e));

  useEffect(() => {
    void store.loadCampaign().then(() => store.reloadMap());
  }, [store, generation]);
}
