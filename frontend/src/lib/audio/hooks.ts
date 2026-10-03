'use client';

/**
 * Hooks React du moteur audio (docs/audio.md § 4.5). Le moteur vit hors de
 * React (singleton) ; les hooks s'y abonnent (`useSyncExternalStore`).
 * `useCampaignAudio` est monté une fois par la table : état initial,
 * abonnement temps réel `audio.*`, pilotage du moteur.
 */
import type {
  Asset,
  AssetKind,
  AssetSection,
  BusName,
  CatalogCategory,
  CatalogEntry,
  ChannelCommand,
  ChannelName,
  ChannelState,
  CuePlayedPayload,
  CuesStoppedPayload,
  MixerPreferences,
  PlaybackAsset,
  Playlist,
  Soundboard,
} from '@vtt/contracts';
import { positionAt, type Point } from '@vtt/contracts/audio-sync';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { ApiError } from '../api';
import { useCampaignEvents } from '../realtime';
import { audioApi } from './api';
import { getAudioEngine, type EngineStatus } from './engine/engine';
import { SpatialPlayer, type ResolvedSource } from './engine/spatial-player';
import type { LiveSound } from './engine/registry';
import { MediaVoice } from './engine/voices';
import { YoutubeVoice } from './engine/youtube';
import { MixerStore } from './mixer';
import { compareCodeUnits } from '@vtt/contracts';

export const audioKeys = {
  assets: (campaignId: string) => ['audio', campaignId, 'assets'] as const,
  playlists: (campaignId: string) => ['audio', campaignId, 'playlists'] as const,
  soundboard: (campaignId: string) => ['audio', campaignId, 'soundboard'] as const,
  resolve: (campaignId: string, ids: string) => ['audio', campaignId, 'resolve', ids] as const,
  catalog: (library: string | null, kind?: AssetKind) =>
    ['audio', 'catalog', library ?? 'default', kind ?? 'all'] as const,
};

// ─── Moteur ─────────────────────────────────────────────────────────────────

const noopSubscribe = () => () => undefined;

export function useAudioStatus(): {
  status: EngineStatus;
  unlock(): Promise<boolean>;
  needsUnlock: boolean;
} {
  const engine = typeof window === 'undefined' ? null : getAudioEngine();
  const status = useSyncExternalStore(
    engine ? (l) => engine.subscribe(l) : noopSubscribe,
    () => engine?.status ?? 'locked',
    () => 'locked' as EngineStatus,
  );
  const needsUnlock = useSyncExternalStore(
    engine ? (l) => engine.subscribe(l) : noopSubscribe,
    () => engine?.needsUnlock ?? false,
    () => false,
  );
  const unlock = useCallback(() => getAudioEngine().unlock(), []);
  return { status, unlock, needsUnlock };
}

// ─── Ce qui sonne vraiment ─────────────────────────────────────────────────

const NO_SOUND: LiveSound[] = [];

/** Sons qui s'entendent réellement dans l'onglet (relevé du moteur, deux fois par seconde). */
export function useLiveSounds(): LiveSound[] {
  const engine = typeof window === 'undefined' ? null : getAudioEngine();
  return useSyncExternalStore(
    engine ? (l) => engine.subscribe(l) : noopSubscribe,
    () => engine?.live ?? NO_SOUND,
    () => NO_SOUND,
  );
}

// ─── Mixeur ─────────────────────────────────────────────────────────────────

let mixerStore: MixerStore | null = null;
function mixer(): MixerStore {
  mixerStore ??= new MixerStore((m) => getAudioEngine().setMixer(m));
  return mixerStore;
}

export function useMixer() {
  const store = typeof window === 'undefined' ? null : mixer();
  const state = useSyncExternalStore(
    store ? (l) => store.subscribe(l) : noopSubscribe,
    () => store!.state,
    () => null,
  );
  useEffect(() => {
    void store?.load();
  }, [store]);
  return {
    volumes: state?.volumes ?? null,
    muted: state?.muted ?? null,
    setVolume: (bus: BusName, value: number) => store?.setVolume(bus, value),
    toggleMute: (bus: BusName) => store?.toggleMute(bus),
    reset: () => store?.reset(),
  };
}

// ─── Campagne ───────────────────────────────────────────────────────────────

/** Options par défaut de useCampaignAudio : un joueur, pas le MJ. */
const JOUEUR = { gm: false };

/**
 * À monter une fois dans la table : attache la campagne au moteur, lit l'état
 * des canaux, suit `audio.*` et le mixeur des autres appareils.
 */
export function useCampaignAudio(
  campaignId: string | null,
  options: { gm: boolean } = JOUEUR,
): { ready: boolean; error: Error | null } {
  const client = useQueryClient();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const gmRef = useRef(options.gm);
  gmRef.current = options.gm;

  useEffect(() => {
    if (!campaignId) return;
    const engine = getAudioEngine();
    engine.attachCampaign(campaignId);
    void mixer().load();
    // Fin d'une vidéo YouTube sans durée : le client du MJ passe à la suivante (une seule fois,
    // grâce à expectedVersion, même avec plusieurs onglets)
    engine.onYoutubeEnded = (s) => {
      if (!gmRef.current) return;
      void audioApi
        .command(campaignId, s.channel, { type: 'next', expectedVersion: s.version })
        .then((next) => engine.applyChannel(next))
        .catch(() => undefined);
    };
    return () => {
      engine.onYoutubeEnded = null;
      engine.detachCampaign();
    };
  }, [campaignId]);

  const { live, generation } = useCampaignEvents(
    campaignId,
    ['audio.*'],
    (e) => {
      const engine = getAudioEngine();
      const { type, payload } = e.event;
      if (e.redacted || !campaignId) return;
      if (type === 'audio.channel_changed') {
        engine.applyChannel((payload as { state: ChannelState }).state);
      } else if (type === 'audio.cue_played') {
        engine.cues.play(payload as unknown as CuePlayedPayload);
      } else if (type === 'audio.cues_stopped') {
        const p = payload as unknown as CuesStoppedPayload;
        if ('all' in p) engine.cues.stopAll();
        else for (const id of p.cueIds) engine.cues.stop(id);
      } else if (type.startsWith('audio.asset_')) {
        void client.invalidateQueries({ queryKey: audioKeys.assets(campaignId) });
        void client.invalidateQueries({ queryKey: ['audio', campaignId, 'resolve'] });
      } else if (type.startsWith('audio.playlist_')) {
        void client.invalidateQueries({ queryKey: audioKeys.playlists(campaignId) });
      } else if (type === 'audio.soundboard_updated') {
        void client.invalidateQueries({ queryKey: audioKeys.soundboard(campaignId) });
      }
    },
    { enabled: !!campaignId },
  );

  useCampaignEvents(null, ['audio.mixer_updated'], (e) =>
    mixer().adopt(e.event.payload as unknown as MixerPreferences),
  );

  // Premier abonnement, reprise impossible : l'état est relu (la ligne de temps fait le reste)
  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    audioApi
      .channels(campaignId)
      .then((r) => {
        if (cancelled) return;
        const engine = getAudioEngine();
        engine.clock.hint(r.serverTime);
        engine.resetChannels(r.channels);
        setReady(true);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e));
    // Après une reconnexion, l'horloge est remesurée
    if (generation > 1) void getAudioEngine().clock.resync();
    return () => {
      cancelled = true;
    };
  }, [campaignId, generation]);

  // Filet de sécurité : l'état du serveur est relu au retour sur l'onglet, et régulièrement
  // tant que le temps réel est coupé ; un événement perdu (réseau, onglet en veille,
  // rechargement du code) est rattrapé. Seul un état plus récent que le nôtre est appliqué.
  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void audioApi
        .channels(campaignId)
        .then((r) => {
          if (cancelled) return;
          const engine = getAudioEngine();
          engine.clock.hint(r.serverTime);
          // Moteur détaché entre-temps (rechargement du code) : rattaché, puis état complet
          if (engine.campaignId !== campaignId) {
            engine.attachCampaign(campaignId);
            engine.resetChannels(r.channels);
            return;
          }
          for (const name of ['music', 'ambience'] as const) engine.applyChannel(r.channels[name]);
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    const timer = live ? null : setInterval(refresh, CHANNELS_REFRESH_MS);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refresh);
      if (timer) clearInterval(timer);
    };
  }, [campaignId, live]);

  return { ready, error };
}

/** Relecture de l'état des canaux tant que le temps réel est coupé (filet de sécurité). */
const CHANNELS_REFRESH_MS = 10_000;

function useEngineChannel(channel: ChannelName): ChannelState | null {
  const engine = typeof window === 'undefined' ? null : getAudioEngine();
  return useSyncExternalStore(
    engine ? (l) => engine.subscribe(l) : noopSubscribe,
    () => engine?.channelState(channel) ?? null,
    () => null,
  );
}

export function useChannel(campaignId: string, channel: ChannelName) {
  const state = useEngineChannel(channel);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const send = useCallback(
    async (command: ChannelCommand): Promise<ChannelState> => {
      const engine = getAudioEngine();
      // Le clic qui lance la musique débloque aussi le son de ce client
      void engine.unlock();
      setPending(true);
      setError(null);
      try {
        const next = await audioApi.command(campaignId, channel, command);
        engine.applyChannel(next);
        return next;
      } catch (e) {
        if (e instanceof ApiError) {
          const current = (e.problem as unknown as { current?: ChannelState }).current;
          if (current) engine.applyChannel(current);
          setError(e);
        }
        throw e;
      } finally {
        setPending(false);
      }
    },
    [campaignId, channel],
  );

  return useMemo(
    () => ({
      state,
      pending,
      error,
      send,
      play: (t: { assetId: string } | { playlistId: string; index?: number }) =>
        send({ type: 'play', ...t }),
      // Commandes du MJ : elles s'appliquent à l'état courant du serveur, quel qu'il soit
      // (pas de `expectedVersion` : une pause passe même si le morceau a changé entre-temps)
      pause: () => send({ type: 'pause' }),
      resume: () => send({ type: 'resume' }),
      seek: (ms: number) => send({ type: 'seek', positionMs: Math.max(0, Math.round(ms)) }),
      stop: () => send({ type: 'stop' }),
      next: () => send({ type: 'next' }),
      previous: () => send({ type: 'previous' }),
      configure: (c: Omit<Extract<ChannelCommand, { type: 'configure' }>, 'type'>) =>
        send({ type: 'configure', ...c }),
    }),
    [state, pending, error, send],
  );
}

const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

/** L'onglet est-il visible ? Les rafraîchissements d'affichage se taisent onglet caché. */
function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}

/**
 * Position courante d'un canal (heure du serveur), rafraîchie toutes les `intervalMs` tant que
 * `active` (panneau affiché) et l'onglet visible. Chaque tic re-rend l'appelant : à réserver à
 * un petit composant feuille.
 */
export function useChannelPosition(
  channel: ChannelName,
  intervalMs = 1_000,
  active = true,
): number {
  const state = useEngineChannel(channel);
  const visible = useDocumentVisible();
  const [, tick] = useState(0);
  const running = active && visible && state?.status === 'playing';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((x) => x + 1), intervalMs);
    return () => clearInterval(t);
  }, [running, intervalMs]);
  if (!state) return 0;
  return positionAt(state, getAudioEngine().clock.now()).positionMs;
}

/**
 * Barre de progression d'un canal tenue par `ref` : `transform: scaleX()` écrit à chaque image,
 * sans état React (aucun rendu). Rien ne tourne panneau masqué (`active` faux), onglet caché
 * ou canal arrêté ; la barre garde alors sa dernière valeur.
 */
export function useChannelProgress(
  channel: ChannelName,
  ref: RefObject<HTMLElement | null>,
  active = true,
): void {
  const state = useEngineChannel(channel);
  const visible = useDocumentVisible();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const track = state?.track;
    const duration = track && !track.deleted ? track.durationMs : null;
    const paint = () => {
      const ms = state ? positionAt(state, getAudioEngine().clock.now()).positionMs : 0;
      const k = duration ? Math.max(0, Math.min(1, ms / duration)) : 0;
      el.style.transform = `scaleX(${k})`;
    };
    paint();
    if (!active || !visible || state?.status !== 'playing' || !duration) return;
    let frame = requestAnimationFrame(function loop() {
      paint();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [state, active, visible, ref]);
}

// ─── Effets ─────────────────────────────────────────────────────────────────

export function useSoundCues(campaignId: string) {
  const engine = typeof window === 'undefined' ? null : getAudioEngine();
  const active = useSyncExternalStore(
    engine ? (l) => engine.cues.subscribe(l) : noopSubscribe,
    () => engine?.cues.list ?? EMPTY,
    () => EMPTY,
  );
  return useMemo(
    () => ({
      active,
      /** Lance un effet pour toute la table ; il sonne ici à la même heure que chez les autres. */
      async play(asset: PlaybackAsset, options: { volume?: number } = {}) {
        const e = getAudioEngine();
        void e.unlock();
        const cueId = crypto.randomUUID();
        const volume = options.volume ?? 1;
        const r = await audioApi.playCue(campaignId, { cueId, assetId: asset.id, volume });
        e.cues.play({ cueId, asset, startAt: r.startAt, volume });
        return { cueId };
      },
      async stop(cueId: string) {
        getAudioEngine().cues.stop(cueId);
        await audioApi.stopCue(campaignId, cueId);
      },
      async stopAll() {
        getAudioEngine().cues.stopAll();
        await audioApi.stopAllCues(campaignId);
      },
    }),
    [campaignId, active],
  );
}
const EMPTY: { cueId: string; assetId: string }[] = [];

// ─── Bibliothèque ───────────────────────────────────────────────────────────

/** Type servi selon l'extension (le type du navigateur est parfois vide ou exotique). */
const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  wav: 'audio/wav',
  flac: 'audio/flac',
};
export const ACCEPTED_AUDIO = Object.keys(TYPES)
  .map((e) => `.${e}`)
  .join(',');
export function audioContentType(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? null;
}

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Envoi refusé'));
    xhr.onerror = () => reject(new Error('Envoi interrompu'));
    xhr.send(file);
  });
}

/**
 * Table d'effets du MJ : les sons qu'il a choisis (toute source, tout type), dans son ordre.
 * Chaque changement s'affiche tout de suite, puis s'enregistre ; en cas d'échec (ou de
 * modification ailleurs), la version du serveur revient.
 */
export function useSoundboard(campaignId: string) {
  const client = useQueryClient();
  const key = audioKeys.soundboard(campaignId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => audioApi.soundboard(campaignId),
    staleTime: 30_000,
  });
  const assetIds = query.data?.assetIds ?? EMPTY_IDS;
  const save = useCallback(
    async (next: string[]) => {
      const before = client.getQueryData<Soundboard>(key);
      client.setQueryData<Soundboard>(key, { assetIds: next, version: before?.version ?? 0 });
      try {
        client.setQueryData(key, await audioApi.setSoundboard(campaignId, { assetIds: next }));
      } catch (e) {
        void client.invalidateQueries({ queryKey: key });
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, campaignId],
  );
  return useMemo(
    () => ({
      assetIds,
      loading: query.isPending,
      has: (id: string) => assetIds.includes(id),
      add: (id: string) => (assetIds.includes(id) ? Promise.resolve() : save([...assetIds, id])),
      remove: (id: string) => save(assetIds.filter((a) => a !== id)),
      move: (id: string, delta: -1 | 1) => {
        const i = assetIds.indexOf(id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= assetIds.length) return Promise.resolve();
        const next = [...assetIds];
        [next[i], next[j]] = [next[j]!, next[i]!];
        return save(next);
      },
    }),
    [assetIds, query.isPending, save],
  );
}

const EMPTY_IDS: string[] = [];

export function useAudioLibrary(campaignId: string, options: { enabled?: boolean } = {}) {
  const client = useQueryClient();
  const enabled = options.enabled ?? true;
  const assets = useQuery({
    queryKey: audioKeys.assets(campaignId),
    queryFn: () => audioApi.assets(campaignId),
    enabled,
    staleTime: 30_000,
  });
  const playlists = useQuery({
    queryKey: audioKeys.playlists(campaignId),
    queryFn: async () => (await audioApi.playlists(campaignId)).items,
    enabled,
    staleTime: 30_000,
  });
  const refreshAssets = () => client.invalidateQueries({ queryKey: audioKeys.assets(campaignId) });
  const refreshPlaylists = () =>
    client.invalidateQueries({ queryKey: audioKeys.playlists(campaignId) });
  const addAsset = (a: Asset) => {
    client.setQueryData<Asset[]>(audioKeys.assets(campaignId), (list) =>
      list ? [...list.filter((x) => x.id !== a.id), a] : [a],
    );
    void refreshAssets();
    return a;
  };

  return {
    assets: assets.data ?? [],
    playlists: playlists.data ?? [],
    loading: assets.isPending || playlists.isPending,
    error: (assets.error ?? playlists.error) as Error | null,
    async upload(
      file: File,
      meta: { name: string; kind: AssetKind },
      onProgress?: (ratio: number) => void,
    ): Promise<Asset> {
      const contentType = audioContentType(file);
      if (!contentType)
        throw new ApiError({
          status: 415,
          title: 'Format non pris en charge',
          detail: 'Formats acceptés : mp3, m4a, aac, ogg, opus, webm, wav, flac.',
        });
      const ticket = await audioApi.requestUpload(campaignId, {
        fileName: file.name,
        contentType,
        size: file.size,
        kind: meta.kind,
      });
      await putWithProgress(ticket.uploadUrl, file, ticket.headers, onProgress);
      return addAsset(
        await audioApi.createAsset(campaignId, {
          source: 'upload',
          uploadToken: ticket.uploadToken,
          name: meta.name,
          kind: meta.kind,
        }),
      );
    },
    async addFromCatalog(catalogId: string, meta: { name?: string; kind?: AssetKind } = {}) {
      return addAsset(
        await audioApi.createAsset(campaignId, { source: 'catalog', catalogId, ...meta }),
      );
    },
    async addYoutube(url: string, name: string, kind: AssetKind = 'music') {
      return addAsset(
        await audioApi.createAsset(campaignId, { source: 'youtube', url, name, kind }),
      );
    },
    async update(
      assetId: string,
      patch: { name?: string; kind?: AssetKind; volume?: number; sections?: AssetSection[] },
    ) {
      return addAsset(await audioApi.updateAsset(campaignId, assetId, patch));
    },
    async remove(assetId: string) {
      client.setQueryData<Asset[]>(audioKeys.assets(campaignId), (list) =>
        list?.filter((a) => a.id !== assetId),
      );
      await audioApi.deleteAsset(campaignId, assetId);
      void refreshAssets();
      void refreshPlaylists();
    },
    async createPlaylist(name: string, assetIds?: string[]) {
      const p = await audioApi.createPlaylist(campaignId, {
        name,
        ...(assetIds ? { assetIds } : {}),
      });
      // Visible tout de suite (on l'ouvre dans la foulée), puis relue
      client.setQueryData<Playlist[]>(audioKeys.playlists(campaignId), (list) =>
        list ? [...list.filter((x) => x.id !== p.id), p] : [p],
      );
      void refreshPlaylists();
      return p;
    },
    async updatePlaylist(id: string, patch: { name?: string; assetIds?: string[] }) {
      client.setQueryData<Playlist[]>(audioKeys.playlists(campaignId), (list) =>
        list?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      );
      try {
        return await audioApi.updatePlaylist(campaignId, id, patch);
      } finally {
        void refreshPlaylists();
      }
    },
    async deletePlaylist(id: string) {
      await audioApi.deletePlaylist(campaignId, id);
      void refreshPlaylists();
    },
  };
}

/** Assets résolus (zones, sons d'armes) : supprimés compris, pour afficher « son introuvable ». */
export function useAudioAssets(
  campaignId: string,
  ids: string[],
): Record<string, PlaybackAsset | undefined> {
  const key = [...new Set(ids)].sort(compareCodeUnits).join(',');
  const q = useQuery({
    queryKey: audioKeys.resolve(campaignId, key),
    queryFn: async () => (await audioApi.resolve(campaignId, key.split(','))).items,
    enabled: key.length > 0,
    staleTime: 60_000,
    // Un son tout juste envoyé n'a d'URL qu'une fois analysé par le worker
    refetchInterval: (query) =>
      query.state.data?.some((a) => a.status === 'processing') ? 3_000 : false,
  });
  return useMemo(() => Object.fromEntries((q.data ?? []).map((a) => [a.id, a])), [q.data]);
}

export function useAudioCatalog(
  library: string | null,
  kind?: AssetKind,
): { items: CatalogEntry[]; categories: CatalogCategory[]; loading: boolean } {
  const q = useQuery({
    queryKey: audioKeys.catalog(library, kind),
    queryFn: () => audioApi.catalog(library, kind),
    staleTime: 10 * 60_000,
  });
  return { items: q.data?.items ?? [], categories: q.data?.categories ?? [], loading: q.isPending };
}

// ─── Préécoute ──────────────────────────────────────────────────────────────

/** Préécoute locale (bus preview), arrêtée au démontage ; une à la fois. */
export function usePreview() {
  const voice = useRef<MediaVoice | YoutubeVoice | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const stop = useCallback(() => {
    voice.current?.dispose();
    voice.current = null;
    setPlayingId(null);
  }, []);
  useEffect(() => stop, [stop]);
  const play = useCallback(
    (
      src: (
        Pick<PlaybackAsset, 'id' | 'url' | 'youtubeId' | 'gainDb'> | { id: string; url: string }
      ) & { name?: string },
    ) => {
      stop();
      const engine = getAudioEngine();
      void engine.unlock();
      const youtubeId = 'youtubeId' in src ? src.youtubeId : null;
      if (youtubeId) {
        const v = YoutubeVoice.create(youtubeId);
        v.label = src.name ?? 'Écoute';
        v.kind = 'preview';
        v.owned = () => voice.current === v;
        v.setVolume(0.8);
        v.onEnded = stop;
        v.start(0);
        voice.current = v;
      } else {
        const ctx = engine.context();
        if (!ctx || !src.url) return;
        const gainDb = 'gainDb' in src ? src.gainDb : 0;
        const v = new MediaVoice(ctx, engine.pool(), src.url, engine.bus('preview'), {
          initialGain: 10 ** (gainDb / 20),
        });
        v.label = src.name ?? 'Écoute';
        v.kind = 'preview';
        v.owned = () => voice.current === v;
        v.onEnded = stop;
        v.start(0);
        voice.current = v;
      }
      setPlayingId(src.id);
    },
    [stop],
  );
  return { play, stop, playingId };
}

// ─── Carte (interface § 4.6) ────────────────────────────────────────────────

export interface SpatialSource {
  /** Stable : `zone:<id>` ou `token:<tokenId>`. */
  id: string;
  assetId?: string;
  /** Transitoire, tant que la carte porte des URL (ni gain ni durée). */
  url?: string;
  x: number;
  y: number;
  radius: number;
  volume: number;
  /** Murs entre l'auditeur et la source : le son est étouffé. */
  walls?: number;
}

/** Écart minimal entre deux mises à jour des sons spatiaux (15 Hz). */
const SPATIAL_MIN_GAP_MS = 66;
/** Passage lent tant que des voix muettes attendent leur libération. */
const SPATIAL_HOUSEKEEPING_MS = 1_000;

/**
 * Sons spatiaux de la carte : la carte fournit l'auditeur (token incarné ;
 * MJ en « vue joueur », sinon null) et les sources ; `enabled: false` coupe
 * tout (calque musique masqué, décision Q5).
 */
export function useSpatialAudio(
  campaignId: string,
  input: { listener: Point | null; sources: SpatialSource[]; enabled: boolean },
): { activeIds: string[] } {
  const assets = useAudioAssets(
    campaignId,
    input.sources.map((s) => s.assetId).filter((x): x is string => !!x),
  );
  const latest = useRef(input);
  latest.current = input;
  const resolved = useRef<ResolvedSource[]>([]);
  resolved.current = input.sources.flatMap((s) => {
    const a = s.assetId ? assets[s.assetId] : undefined;
    const url = a?.url ?? s.url;
    if (!url || a?.deleted) return [];
    return [
      {
        id: s.id,
        url,
        x: s.x,
        y: s.y,
        radius: s.radius,
        volume: s.volume * (a?.volume ?? 1),
        gainDb: a?.gainDb ?? 0,
        durationMs: a?.durationMs ?? null,
        walls: s.walls ?? 0,
      },
    ];
  });
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const schedule = useRef<() => void>(() => undefined);

  // Mise à jour à la demande (auditeur, sources, état du moteur), 15 fois par seconde au plus ;
  // plus rien ne tourne quand il n'y a ni source à jouer ni voix à éteindre.
  useEffect(() => {
    const engine = getAudioEngine();
    const player = new SpatialPlayer(engine);
    let last = '';
    let lastRun = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      timer = null;
      lastRun = Date.now();
      const { listener, enabled } = latest.current;
      const sources = resolved.current;
      // Rien à entendre ni à libérer : aucun calcul, aucun contexte audio créé
      if ((!enabled || !listener || !sources.length) && !player.size) {
        if (last) {
          last = '';
          setActiveIds([]);
        }
        return;
      }
      const ids = player.update(listener, sources, enabled);
      const key = ids.join('|');
      if (key !== last) {
        last = key;
        setActiveIds(ids);
      }
      // Voix muettes à libérer au bout de 10 s : un passage lent jusqu'à leur libération
      if (player.releasing) timer = setTimeout(run, SPATIAL_HOUSEKEEPING_MS);
    };
    schedule.current = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, Math.max(0, lastRun + SPATIAL_MIN_GAP_MS - Date.now()));
    };
    // Déverrouillage du son : les voix retenues peuvent enfin partir
    let status = engine.status;
    const unsubscribe = engine.subscribe(() => {
      if (engine.status === status) return;
      status = engine.status;
      schedule.current();
    });
    schedule.current();
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      schedule.current = () => undefined;
      player.dispose();
    };
  }, [campaignId]);

  const signature = JSON.stringify([input.enabled, input.listener, resolved.current]);
  useEffect(() => schedule.current(), [signature]);

  return { activeIds };
}
