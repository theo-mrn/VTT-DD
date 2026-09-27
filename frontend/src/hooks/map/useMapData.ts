/**
 * useMapData.ts — Hook centralisé des données de la carte.
 *
 * Même rôle et mêmes callbacks que dans l'ancienne app, où il ouvrait les
 * listeners Firestore : il lit maintenant l'état partagé de la carte
 * (map-store.ts : REST au chargement, puis événements du temps réel) et pousse
 * chaque changement dans les setters de la page, sous les formes d'origine.
 *
 * Carte suivie : la scène choisie (`selectedCityId`), sinon la carte par
 * défaut (le « fond global » de l'ancienne app).
 */

import { useEffect, useRef, startTransition } from 'react';

import { registerPendingPlay } from '@/utils/audioAutoplay';
import { getMapStore, useMapStore, useMapStoreSync } from '@/hooks/map/map-store';
import {
  toLegacyCharacter,
  toLegacyLayers,
  toLegacyLight,
  toLegacyMeasurement,
  toLegacyMusicZone,
  toLegacyObject,
  toLegacyPortal,
  toLegacyScene,
  fogToGrid,
} from '@/hooks/map/map-adapters';
import {
  onGlobalSound,
  useEphemeralMeasurements,
  useMapEphemeralChannel,
} from '@/hooks/map/map-ephemeral';
import { saveMapSize } from '@/hooks/map/map-writes';

import type {
  Character,
  LightSource,
  MapText,
  SavedDrawing,
  MusicZone,
  Layer,
  Scene,
  Portal,
  MapObject,
  GroupEntity,
} from '@/app/(campaigns)/campaigns/[id]/play/map/types';
import type { Obstacle } from '@/lib/visibility';
import type { SharedMeasurement } from '@/app/(campaigns)/campaigns/[id]/play/map/measurements';
import type { WeatherState } from '@/app/(campaigns)/campaigns/[id]/play/map/weather-store';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Où se trouve mon personnage (l'ancien `currentSceneId` de ma fiche). */
export interface MyCharacterScene {
  /** Scène où il se trouve ; null s'il est sur la carte par défaut ou nulle part. */
  sceneId: string | null;
  /** Il est sur la carte par défaut (le fond global). */
  onDefaultMap: boolean;
}

interface MapDataCallbacks {
  setCharacters?: (chars: Character[]) => void;
  setLoading?: (v: boolean) => void;
  setLights?: (lights: LightSource[]) => void;
  setObjects?: (objects: MapObject[]) => void;
  setGroupEntities?: (entities: GroupEntity[]) => void;
  setNotes?: (notes: MapText[]) => void;
  setDrawings?: (drawings: SavedDrawing[]) => void;
  setFogGrid?: (grid: Map<string, boolean>) => void;
  setFullMapFog?: (v: boolean) => void;
  setObstacles?: (obs: Obstacle[]) => void;
  setMusicZones?: (zones: MusicZone[]) => void;
  setMeasurements?: (ms: SharedMeasurement[]) => void;
  setLayers?: React.Dispatch<React.SetStateAction<Layer[]>>;
  setPortals?: (portals: Portal[]) => void;
  setCurrentScene?: (scene: Scene | null) => void;
  setBackgroundImage?: (url: string | null) => void;
  setBgImageObject?: (obj: HTMLImageElement | HTMLVideoElement | null) => void;
  setActivePlayerId?: (id: string | null) => void;
  setGlobalTokenScale?: (v: number) => void;
  setShadowOpacity?: (v: number) => void;
  setPixelsPerUnit?: (v: number) => void;
  setUnitName?: (v: string) => void;
  setGlobalCityId?: (id: string | null) => void;
  setWeather?: (w: WeatherState) => void;
  setSettingsResolved?: (v: boolean) => void;
  setCities?: (cities: any[]) => void;
  setPlayersVersion?: React.Dispatch<React.SetStateAction<number>>;
  selectedCityIdRef?: React.MutableRefObject<string | null>;
  /** Tokens de la carte suivie, sous la forme des personnages de l'ancienne carte. */
  loadedNPCsRef?: React.MutableRefObject<Character[]>;
  mergeAndSetCharactersRef?: React.MutableRefObject<() => void>;
  /** Scène de mon personnage (joueur), pour suivre sa scène comme l'ancienne app. */
  myCharacterSceneRef?: React.MutableRefObject<MyCharacterScene | null>;
  audioVolumes?: { quickSounds: number; backgroundAudio?: number };
  globalAudioRef?: React.MutableRefObject<HTMLAudioElement | null>;
  isFirstSnapshotRef?: React.MutableRefObject<boolean>;
  isMJ?: boolean;
  persoId?: string | null;
  /** Taille de l'image de fond une fois chargée : le MJ l'envoie au serveur. */
  backgroundSize?: { width: number; height: number } | null;
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useMapData(
  roomId: string,
  selectedCityId: string | null,
  callbacks: MapDataCallbacks,
) {
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

  const isMJ = !!callbacks.isMJ;
  const persoId = callbacks.persoId ?? null;
  useMapStoreSync(roomId, isMJ, persoId ? [persoId] : []);
  useMapEphemeralChannel(roomId);

  const store = getMapStore(roomId);
  const state = useMapStore(roomId);
  const ephemeralMeasurements = useEphemeralMeasurements();

  const defaultMapId = state.maps.find((m) => m.isDefault)?.id ?? null;
  const followedMapId = selectedCityId ?? defaultMapId;

  // ──────────────────────────────────────────────────────────────────────────
  // CARTE SUIVIE
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.mapsLoaded) return;
    store.open(followedMapId);
  }, [store, followedMapId, state.mapsLoaded]);

  // ─── SETTINGS GENERAL (réglages de la carte) ───────────────────────────────
  useEffect(() => {
    const c = cb.current;
    const s = state.settings;
    if (s) {
      c.setGlobalTokenScale?.(s.tokenScale);
      c.setShadowOpacity?.(s.shadowOpacity);
      if (s.pixelsPerUnit) c.setPixelsPerUnit?.(s.pixelsPerUnit);
      if (s.unitName) c.setUnitName?.(s.unitName);
      // Scène du groupe ; la carte par défaut est le fond global (aucune scène)
      c.setGlobalCityId?.(s.partyMapId && s.partyMapId !== defaultMapId ? s.partyMapId : null);
    }
    if (state.settingsLoaded && state.mapsLoaded) c.setSettingsResolved?.(true);
  }, [state.settings, state.settingsLoaded, state.mapsLoaded, defaultMapId]);

  // ─── CITIES (scènes) ───────────────────────────────────────────────────────
  useEffect(() => {
    cb.current.setCities?.(state.maps.filter((m) => !m.isDefault).map(toLegacyScene));
  }, [state.maps]);

  // ─── GROUP ENTITIES : pas d'équivalent côté serveur ───────────────────────
  useEffect(() => {
    cb.current.setGroupEntities?.([]);
  }, []);

  // ─── COMBAT : personnage dont c'est le tour ────────────────────────────────
  useEffect(() => {
    cb.current.setActivePlayerId?.(state.activeCharacterId);
  }, [state.activeCharacterId]);

  // ─── SCÈNE DE MON PERSONNAGE ───────────────────────────────────────────────
  useEffect(() => {
    const c = cb.current;
    if (!c.myCharacterSceneRef || state.myMapId === undefined) return;
    const onDefaultMap = !!state.myMapId && state.myMapId === defaultMapId;
    const sceneId = state.myMapId && !onDefaultMap ? state.myMapId : null;
    const prev = c.myCharacterSceneRef.current;
    if (prev && prev.sceneId === sceneId && prev.onDefaultMap === onDefaultMap) return;
    c.myCharacterSceneRef.current = { sceneId, onDefaultMap };
    c.setPlayersVersion?.((v) => v + 1);
  }, [state.myMapId, defaultMapId]);

  // ──────────────────────────────────────────────────────────────────────────
  // CONTENU DE LA CARTE SUIVIE
  // ──────────────────────────────────────────────────────────────────────────
  const data = state.data;
  const map = data?.map ?? null;
  const cityId = map && !map.isDefault ? map.id : null;

  // ─── SCENE + BACKGROUND + WEATHER + LAYERS ─────────────────────────────────
  useEffect(() => {
    const c = cb.current;
    if (!map) {
      c.setCurrentScene?.(null);
      if (state.mapsLoaded && !state.mapLoading) {
        c.setBackgroundImage?.(null);
        c.setBgImageObject?.(null);
      }
      return;
    }
    c.setCurrentScene?.(map.isDefault ? null : toLegacyScene(map));
    if (map.backgroundUrl) c.setBackgroundImage?.(map.backgroundUrl);
    else {
      c.setBackgroundImage?.(null);
      c.setBgImageObject?.(null);
    }
    // Météo propre à la carte. Champ absent ⇒ 'none'
    if (map.weather && typeof map.weather.type === 'string') {
      c.setWeather?.({
        type: map.weather.type as WeatherState['type'],
        intensity: typeof map.weather.intensity === 'number' ? map.weather.intensity : 1,
      });
    } else {
      c.setWeather?.({ type: 'none', intensity: 0 });
    }
    c.setLayers?.(() => toLegacyLayers(map.layers));
  }, [map, state.mapsLoaded, state.mapLoading]);

  // ─── CHARACTERS (tokens) ───────────────────────────────────────────────────
  const tokens = data?.tokens;
  const characterInfos = state.characters;
  useEffect(() => {
    const c = cb.current;
    if (!tokens) {
      if (state.mapsLoaded && !state.mapLoading && (!followedMapId || state.mapError)) {
        if (c.loadedNPCsRef) c.loadedNPCsRef.current = [];
        c.mergeAndSetCharactersRef?.current?.();
        c.setLoading?.(false);
      }
      return;
    }
    const chars = tokens.map((t) => toLegacyCharacter(t, characterInfos[t.characterId], cityId));
    if (c.loadedNPCsRef) {
      c.loadedNPCsRef.current = chars;
      c.mergeAndSetCharactersRef?.current?.();
    } else {
      c.setCharacters?.(chars);
    }
    c.setLoading?.(false);
  }, [
    tokens,
    characterInfos,
    cityId,
    state.mapsLoaded,
    state.mapLoading,
    state.mapError,
    followedMapId,
  ]);

  // ─── FOG ───────────────────────────────────────────────────────────────────
  const fog = data?.fog;
  useEffect(() => {
    const c = cb.current;
    c.setFogGrid?.(fogToGrid(fog));
    c.setFullMapFog?.(fog?.fullMap ?? false);
  }, [fog]);

  // ─── LIGHTS ────────────────────────────────────────────────────────────────
  const lights = data?.lights;
  useEffect(() => {
    cb.current.setLights?.((lights ?? []).map((l) => toLegacyLight(l, cityId)));
  }, [lights, cityId]);

  // ─── OBJECTS ───────────────────────────────────────────────────────────────
  const objects = data?.objects;
  useEffect(() => {
    cb.current.setObjects?.((objects ?? []).map((o) => toLegacyObject(o, cityId)));
  }, [objects, cityId]);

  // ─── MUSIC ZONES ───────────────────────────────────────────────────────────
  const musicZones = data?.musicZones;
  useEffect(() => {
    const zones = (musicZones ?? []).map((z) => toLegacyMusicZone(z, cityId));
    startTransition(() => cb.current.setMusicZones?.(zones));
  }, [musicZones, cityId]);

  // ─── PORTALS ───────────────────────────────────────────────────────────────
  const portals = data?.portals;
  useEffect(() => {
    cb.current.setPortals?.((portals ?? []).map((p) => toLegacyPortal(p, cityId)));
  }, [portals, cityId]);

  // ─── MEASUREMENTS (gabarits posés + gabarits éphémères du temps réel) ──────
  const measurements = data?.measurements;
  useEffect(() => {
    const permanent = (measurements ?? []).map((m) => toLegacyMeasurement(m, cityId));
    const ephemeral = ephemeralMeasurements.filter((m) => (m.cityId ?? null) === selectedCityId);
    startTransition(() => cb.current.setMeasurements?.([...permanent, ...ephemeral]));
  }, [measurements, ephemeralMeasurements, cityId, selectedCityId]);

  // ─── TAILLE DU FOND (MJ) : sert au serveur pour les cases de brouillard ─────
  const bgWidth = callbacks.backgroundSize?.width;
  const bgHeight = callbacks.backgroundSize?.height;
  const mapWidth = map?.width;
  const mapHeight = map?.height;
  useEffect(() => {
    if (!isMJ || !bgWidth || !bgHeight) return;
    if (mapWidth === Math.round(bgWidth) && mapHeight === Math.round(bgHeight)) return;
    void saveMapSize(roomId, bgWidth, bgHeight);
  }, [roomId, isMJ, bgWidth, bgHeight, mapWidth, mapHeight]);

  // ─── GLOBAL SOUND (son ponctuel pour toute la table, canal éphémère) ───────
  useEffect(() => {
    if (!cb.current.globalAudioRef) return;
    return onGlobalSound((data) => {
      const { globalAudioRef, audioVolumes } = cb.current;
      if (!globalAudioRef) return;
      if (data.soundUrl === null || !data.soundUrl) {
        globalAudioRef.current?.pause();
        globalAudioRef.current = null;
        return;
      }
      const timeDiff = Date.now() - data.timestamp;
      if (timeDiff < 5000 && timeDiff > -2000) {
        globalAudioRef.current?.pause();
        const audio = new Audio(data.soundUrl);
        if (audioVolumes) audio.volume = audioVolumes.quickSounds;
        globalAudioRef.current = audio;
        audio.addEventListener('ended', () => {
          globalAudioRef.current = null;
        });
        audio.play().catch((e) => {
          if (e.name !== 'NotAllowedError') console.error(e);
          registerPendingPlay(audio);
        });
      }
    });
  }, []);
}
