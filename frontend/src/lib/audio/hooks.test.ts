// @vitest-environment jsdom
/**
 * Hooks du son, sur le vrai moteur branché à un faux Web Audio : état et déverrouillage,
 * mixeur (serveur, reprise des anciens réglages, enregistrement différé), campagne (canaux lus,
 * événements `audio.*` appliqués, relectures), commandes d'un canal, position et barre de
 * progression, effets pour toute la table, table d'effets, bibliothèque (envoi, catalogue,
 * YouTube, listes de lecture), préécoute, sons spatiaux de la carte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelState, PlaybackAsset } from '@vtt/contracts';
import { DEFAULT_MIXER } from '@vtt/contracts/audio-sync';
import { renderHook } from '@/test/render-hook';

type Handler = (body: Record<string, unknown> | undefined, url: string) => unknown;
const routes = vi.hoisted(() => new Map<string, Handler>());
const calls = vi.hoisted(() => [] as { method: string; url: string; body: unknown }[]);
const realtime = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown) => void>(),
  live: true,
  generation: 1,
}));

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>();
  return {
    ...real,
    api: vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const handler = routes.get(`${method} ${url.split('?')[0]}`);
      if (!handler) throw new Error(`Route non prévue : ${method} ${url}`);
      return handler(body, url);
    }),
  };
});
vi.mock('../realtime', () => ({
  useCampaignEvents: (c: string | null, types: string[], handler: (e: unknown) => void) => {
    realtime.handlers.set(`${c}:${types.join(',')}`, handler);
    return { live: realtime.live, generation: realtime.generation };
  },
}));

import { ApiError } from '../api';
import { ServerClock } from './sync/clock';
import { FakeAudioContext, FakeElement } from './test/fake-audio';
import { AudioEngine } from './engine/engine';
import {
  audioContentType,
  audioKeys,
  useAudioAssets,
  useAudioCatalog,
  useAudioLibrary,
  useAudioStatus,
  useCampaignAudio,
  useChannel,
  useChannelPosition,
  useChannelProgress,
  useLiveSounds,
  useMixer,
  usePreview,
  useSoundboard,
  useSoundCues,
  useSpatialAudio,
} from './hooks';

const CAMP = '0199a0c3-0000-7000-8000-000000000001';
const BASE = `/v1/audio/campaigns/${CAMP}`;
const NOW = 1_000_000;

const asset = (id: string, o: Partial<PlaybackAsset> = {}): PlaybackAsset => ({
  id,
  name: id,
  kind: 'music',
  source: 'upload',
  status: 'ready',
  url: `https://cdn.test/${id}.mp3`,
  youtubeId: null,
  durationMs: 120_000,
  gainDb: -6,
  volume: 1,
  deleted: false,
  ...o,
});

const channel = (o: Partial<ChannelState> = {}): ChannelState => ({
  campaignId: CAMP,
  channel: 'music',
  version: 1,
  status: 'playing',
  track: asset('a'),
  next: null,
  playlistId: null,
  queueIndex: 0,
  queueLength: 1,
  repeat: 'off',
  shuffle: false,
  positionMs: 0,
  anchorAt: new Date(NOW - 30_000).toISOString(),
  endsAt: new Date(NOW + 90_000).toISOString(),
  volume: 1,
  crossfadeMs: 1500,
  updatedBy: null,
  updatedAt: new Date(NOW).toISOString(),
  ...o,
});

const event = (type: string, payload: Record<string, unknown> = {}, redacted = false) => ({
  seq: 1,
  redacted,
  event: { id: `e-${type}`, type, roomId: CAMP, aggregate: { type: 'audio', id: 'x' }, payload },
});
const fire = (key: string, e: unknown) => realtime.handlers.get(key)!(e);

let engine: AudioEngine;
let ctx: FakeAudioContext;

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  realtime.handlers.clear();
  realtime.live = true;
  realtime.generation = 1;
  localStorage.clear();
  ctx = new FakeAudioContext();
  engine = new AudioEngine({
    createContext: () => ctx as unknown as BaseAudioContext,
    createElement: () => new FakeElement() as unknown as HTMLAudioElement,
    clock: new ServerClock(
      async () => ({ serverTime: NOW }),
      () => NOW,
    ),
    listenForUnlock: false,
    scan: false,
  });
  (globalThis as { __vttAudioEngine?: unknown }).__vttAudioEngine = engine;
  routes.set('GET /v1/audio/clock', () => ({ serverTime: NOW }));
  routes.set('GET /v1/audio/me/mixer', () => ({
    volumes: { master: 0.8, music: 0.5, ambience: 1, sfx: 1, zones: 1, dice: 1 },
    muted: {
      master: false,
      music: false,
      ambience: false,
      sfx: false,
      preview: false,
      spatial: false,
    },
    version: 3,
  }));
  routes.set('PUT /v1/audio/me/mixer', (b) => {
    const body = b as { volumes?: object; muted?: object };
    return {
      volumes: { ...DEFAULT_MIXER.volumes, ...body.volumes },
      muted: { ...DEFAULT_MIXER.muted, ...body.muted },
      version: 4,
    };
  });
  routes.set(`GET ${BASE}/channels`, () => ({
    serverTime: NOW,
    channels: {
      music: channel(),
      ambience: channel({ channel: 'ambience', status: 'stopped', track: null }),
    },
  }));
  routes.set(`POST ${BASE}/channels/music/commands`, (b) =>
    channel({
      version: 2,
      status: (b as { type: string }).type === 'pause' ? 'paused' : 'playing',
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('moteur', () => {
  it('état, sons en cours, déverrouillage', async () => {
    const r = await renderHook(() => ({ status: useAudioStatus(), live: useLiveSounds() }));
    expect(r.result.current.live).toEqual([]);
    await r.act(() => r.result.current.status.unlock());
    expect(['running', 'locked', 'suspended', 'idle']).toContain(r.result.current.status.status);
    await r.unmount();
  });
});

describe('mixeur', () => {
  it('réglages du serveur, volume et muet enregistrés après une pause, remise à zéro', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.resetModules();
    const fresh = await import('./hooks');
    const r = await renderHook(() => fresh.useMixer());
    await r.waitFor(() => expect(r.result.current.volumes?.music).toBe(0.5));
    await r.act(() => {
      r.result.current.setVolume('music', 1.4);
      r.result.current.toggleMute('sfx');
    });
    expect(r.result.current.volumes!.music).toBe(1);
    expect(r.result.current.muted!.sfx).toBe(true);
    await r.act(async () => {
      vi.advanceTimersByTime(500);
    });
    await r.waitFor(() =>
      expect(calls.some((c) => c.method === 'PUT' && c.url === '/v1/audio/me/mixer')).toBe(true),
    );
    await r.act(() => r.result.current.reset());
    expect(JSON.parse(localStorage.getItem('vtt-audio-mixer')!).volumes.music).toBe(1);
    await r.unmount();
  });

  it('jamais réglé sur le serveur : les anciens réglages du navigateur sont repris', async () => {
    localStorage.setItem(
      'audioMixerVolumes',
      JSON.stringify({ backgroundMusic: 0.2, dice3d: 0.6 }),
    );
    routes.set('GET /v1/audio/me/mixer', () => ({
      volumes: { master: 1, music: 1, ambience: 1, sfx: 1, zones: 1, dice: 1 },
      muted: {
        master: false,
        music: false,
        ambience: false,
        sfx: false,
        preview: false,
        spatial: false,
      },
      version: 0,
    }));
    vi.resetModules();
    const fresh = await import('./hooks');
    const r = await renderHook(() => fresh.useMixer());
    await r.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    await r.unmount();
  });
});

describe('campagne', () => {
  it('rattachée, canaux lus, événements appliqués, relectures ; détachée au démontage', async () => {
    const r = await renderHook(() => useCampaignAudio(CAMP, { gm: true }));
    await r.waitFor(() => expect(r.result.current.ready).toBe(true));
    expect(engine.campaignId).toBe(CAMP);
    expect(engine.channelState('music')?.status).toBe('playing');
    const key = `${CAMP}:audio.*`;
    const spy = vi.spyOn(r.client, 'invalidateQueries');
    fire(key, event('audio.channel_changed', { state: channel({ version: 5, status: 'paused' }) }));
    expect(engine.channelState('music')?.status).toBe('paused');
    fire(
      key,
      event('audio.cue_played', {
        cueId: 'c1',
        asset: asset('sfx', { kind: 'sfx' }),
        startAt: new Date(NOW).toISOString(),
        volume: 1,
      }),
    );
    fire(key, event('audio.cues_stopped', { cueIds: ['c1'] }));
    fire(key, event('audio.cues_stopped', { all: true }));
    fire(key, event('audio.asset_created'));
    fire(key, event('audio.playlist_updated'));
    fire(key, event('audio.soundboard_updated'));
    fire(key, event('audio.channel_changed', {}, true));
    expect(spy.mock.calls.map(([f]) => JSON.stringify(f?.queryKey))).toEqual(
      expect.arrayContaining([
        JSON.stringify(audioKeys.assets(CAMP)),
        JSON.stringify(audioKeys.playlists(CAMP)),
        JSON.stringify(audioKeys.soundboard(CAMP)),
      ]),
    );
    fire(
      'null:audio.mixer_updated',
      event('audio.mixer_updated', {
        volumes: { master: 0.3, music: 1, ambience: 1, sfx: 1, zones: 1, dice: 1 },
        muted: {
          master: false,
          music: false,
          ambience: false,
          sfx: false,
          preview: false,
          spatial: false,
        },
        version: 99,
      }),
    );
    // Fin d'une vidéo YouTube : le MJ passe à la suivante
    engine.onYoutubeEnded!(channel({ version: 7 }));
    await r.waitFor(() =>
      expect(calls.some((c) => (c.body as { type?: string } | undefined)?.type === 'next')).toBe(
        true,
      ),
    );
    // Retour sur l'onglet : l'état est relu ; moteur détaché entre-temps : rattaché
    engine.detachCampaign();
    document.dispatchEvent(new Event('visibilitychange'));
    await r.waitFor(() => expect(engine.campaignId).toBe(CAMP));
    await r.unmount();
    expect(engine.campaignId).toBeNull();
  });

  it('lecture des canaux en échec : erreur ; temps réel coupé : relu régulièrement', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    realtime.live = false;
    realtime.generation = 2;
    routes.set(`GET ${BASE}/channels`, () => {
      throw new Error('hors ligne');
    });
    const r = await renderHook(() => useCampaignAudio(CAMP));
    await r.waitFor(() => expect(r.result.current.error?.message).toBe('hors ligne'));
    const before = calls.length;
    await r.act(async () => {
      vi.advanceTimersByTime(10_500);
    });
    expect(calls.length).toBeGreaterThan(before);
    await r.unmount();
    const none = await renderHook(() => useCampaignAudio(null));
    expect(none.result.current).toEqual({ ready: false, error: null });
    await none.unmount();
  });
});

describe('canal', () => {
  it('chaque commande part au serveur et s’applique ; refus : l’état courant du serveur est repris', async () => {
    engine.attachCampaign(CAMP);
    const r = await renderHook(() => useChannel(CAMP, 'music'));
    const c = () => r.result.current;
    await r.act(() => c().play({ assetId: 'a' }));
    await r.act(() => c().play({ playlistId: 'p', index: 2 }));
    await r.act(() => c().pause());
    await r.act(() => c().resume());
    await r.act(() => c().seek(-50.4));
    await r.act(() => c().stop());
    await r.act(() => c().next());
    await r.act(() => c().previous());
    await r.act(() => c().configure({ repeat: 'all' } as never));
    expect(calls.map((x) => (x.body as { type: string }).type)).toEqual([
      'play',
      'play',
      'pause',
      'resume',
      'seek',
      'stop',
      'next',
      'previous',
      'configure',
    ]);
    expect((calls[4]!.body as { positionMs: number }).positionMs).toBe(0);
    routes.set(`POST ${BASE}/channels/music/commands`, () => {
      throw new ApiError({
        status: 409,
        title: 'Conflit',
        current: channel({ version: 9, status: 'stopped' }),
      } as never);
    });
    await r.act(() =>
      c()
        .pause()
        .catch(() => undefined),
    );
    expect(r.result.current.error?.status).toBe(409);
    expect(engine.channelState('music')?.version).toBe(9);
    await r.unmount();
  });

  it('position et barre de progression d’un canal qui joue', async () => {
    engine.attachCampaign(CAMP);
    engine.resetChannels({
      music: channel(),
      ambience: channel({ channel: 'ambience', status: 'stopped', track: null }),
    });
    const bar = { current: document.createElement('div') };
    const r = await renderHook(() => ({
      position: useChannelPosition('music', 50),
      idle: useChannelPosition('ambience'),
      progress: useChannelProgress('music', bar),
    }));
    expect(r.result.current.position).toBeGreaterThan(0);
    expect(r.result.current.idle).toBe(0);
    expect(bar.current.style.transform).toMatch(/^scaleX\(0\.\d+\)$/);
    await new Promise((res) => setTimeout(res, 80));
    await r.unmount();
  });
});

describe('effets', () => {
  it('lancé pour toute la table, arrêté un à un ou tous', async () => {
    routes.set(`POST ${BASE}/cues`, () => ({ cueId: 'x', startAt: new Date(NOW).toISOString() }));
    routes.set(`POST ${BASE}/cues/stop`, () => undefined);
    const r = await renderHook(() => useSoundCues(CAMP));
    const { cueId } = await r.act(() =>
      r.result.current.play(asset('boum', { kind: 'sfx' }), { volume: 0.5 }),
    );
    expect(calls[0]!.body).toMatchObject({ assetId: 'boum', volume: 0.5 });
    routes.set(`POST ${BASE}/cues/${cueId}/stop`, () => undefined);
    await r.act(() => r.result.current.stop(cueId));
    await r.act(() => r.result.current.stopAll());
    await r.unmount();
  });
});

describe('table d’effets', () => {
  it('ajouter (sans doublon), retirer, déplacer ; refus : la version du serveur revient', async () => {
    let saved = { assetIds: ['a', 'b'], version: 1 };
    routes.set(`GET ${BASE}/soundboard`, () => saved);
    routes.set(
      `PUT ${BASE}/soundboard`,
      (b) =>
        (saved = { assetIds: (b as { assetIds: string[] }).assetIds, version: saved.version + 1 }),
    );
    const r = await renderHook(() => useSoundboard(CAMP));
    await r.waitFor(() => expect(r.result.current.assetIds).toEqual(['a', 'b']));
    await r.act(() => r.result.current.add('c'));
    await r.act(() => r.result.current.add('c'));
    await r.act(() => r.result.current.move('c', -1));
    await r.act(() => r.result.current.move('a', -1));
    await r.act(() => r.result.current.remove('b'));
    expect(r.result.current.assetIds).toEqual(['a', 'c']);
    expect(r.result.current.has('a')).toBe(true);
    routes.set(`PUT ${BASE}/soundboard`, () => {
      throw new Error('refus');
    });
    await r.act(() => r.result.current.add('z').catch(() => undefined));
    await r.waitFor(() => expect(r.result.current.assetIds).toEqual(['a', 'c']));
    await r.unmount();
  });
});

describe('bibliothèque', () => {
  it('envoi d’un fichier (progression), catalogue, YouTube, modification, suppression, listes de lecture', async () => {
    const progress: number[] = [];
    class FakeXhr {
      upload: {
        onprogress:
          ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
      } = { onprogress: null };
      status = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      headers: Record<string, string> = {};
      open() {}
      setRequestHeader(k: string, v: string) {
        this.headers[k] = v;
      }
      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const lib = [asset('a') as never];
    routes.set(`GET ${BASE}/assets`, () => ({ items: lib, nextCursor: null }));
    routes.set(`GET ${BASE}/playlists`, () => ({
      items: [{ id: 'pl', name: 'Combat', assetIds: [] }],
    }));
    routes.set(`POST ${BASE}/assets/uploads`, () => ({
      uploadUrl: 'https://r2.test/put',
      headers: { 'content-type': 'audio/mpeg' },
      uploadToken: 'tok',
    }));
    routes.set(`POST ${BASE}/assets`, (b) => asset(`n-${(b as { source: string }).source}`));
    routes.set(`PATCH ${BASE}/assets/a`, () => asset('a', { name: 'Renommé' }));
    routes.set(`DELETE ${BASE}/assets/a`, () => undefined);
    routes.set(`POST ${BASE}/playlists`, () => ({ id: 'p2', name: 'Calme', assetIds: [] }));
    routes.set(`PATCH ${BASE}/playlists/p2`, () => ({
      id: 'p2',
      name: 'Très calme',
      assetIds: [],
    }));
    routes.set(`DELETE ${BASE}/playlists/p2`, () => undefined);
    const r = await renderHook(() => useAudioLibrary(CAMP));
    await r.waitFor(() => expect(r.result.current.loading).toBe(false));
    const l = () => r.result.current;
    const file = new File(['x'.repeat(10)], 'Taverne.MP3');
    const up = await r.act(() =>
      l().upload(file, { name: 'Taverne', kind: 'music' }, (p) => progress.push(p)),
    );
    expect(up.id).toBe('n-upload');
    expect(progress).toEqual([0.5]);
    await expect(
      l().upload(new File(['x'], 'son.exe'), { name: 'x', kind: 'sfx' }),
    ).rejects.toMatchObject({ status: 415 });
    await r.act(() => l().addFromCatalog('cat-1', { name: 'Pluie' }));
    await r.act(() => l().addYoutube('https://youtu.be/x', 'Clip'));
    await r.act(() => l().update('a', { name: 'Renommé' }));
    await r.act(() => l().remove('a'));
    await r.act(() => l().createPlaylist('Calme', ['a']));
    await r.act(() => l().updatePlaylist('p2', { name: 'Très calme' }));
    await r.act(() => l().deletePlaylist('p2'));
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(9);
    await r.unmount();
  });

  it('envoi refusé ou interrompu par le stockage', async () => {
    let outcome: 'refus' | 'coupure' = 'refus';
    class FakeXhr {
      upload = { onprogress: null };
      status = 403;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        if (outcome === 'refus') this.onload?.();
        else this.onerror?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    routes.set(`GET ${BASE}/assets`, () => ({ items: [], nextCursor: null }));
    routes.set(`GET ${BASE}/playlists`, () => ({ items: [] }));
    routes.set(`POST ${BASE}/assets/uploads`, () => ({
      uploadUrl: 'https://r2.test/put',
      headers: {},
      uploadToken: 'tok',
    }));
    const r = await renderHook(() => useAudioLibrary(CAMP, { enabled: false }));
    await expect(
      r.result.current.upload(new File(['x'], 'a.ogg'), { name: 'a', kind: 'sfx' }),
    ).rejects.toThrow('Envoi refusé');
    outcome = 'coupure';
    await expect(
      r.result.current.upload(new File(['x'], 'a.wav'), { name: 'a', kind: 'sfx' }),
    ).rejects.toThrow('Envoi interrompu');
    await r.unmount();
  });

  it('types acceptés selon l’extension', () => {
    expect(audioContentType(new File([], 'a.FLAC'))).toBe('audio/flac');
    expect(audioContentType(new File([], 'sans-extension'))).toBeNull();
  });

  it('sons résolus (en cours d’analyse : relus), catalogue d’une bibliothèque', async () => {
    routes.set(`GET ${BASE}/assets/resolve`, () => ({
      items: [asset('a'), asset('b', { status: 'processing', url: null } as never)],
    }));
    routes.set('GET /v1/audio/catalog', () => ({
      categories: [{ id: 'nature', label: 'Nature' }],
      items: [{ id: 'pluie' }],
    }));
    const r = await renderHook(() => ({
      assets: useAudioAssets(CAMP, ['b', 'a', 'a']),
      none: useAudioAssets(CAMP, []),
      catalog: useAudioCatalog('yner', 'ambience'),
    }));
    await r.waitFor(() => {
      expect(Object.keys(r.result.current.assets).sort()).toEqual(['a', 'b']);
      expect(r.result.current.catalog.items).toHaveLength(1);
    });
    expect(calls.find((c) => c.url.includes('resolve'))!.url).toContain('ids=a,b');
    expect(calls.find((c) => c.url.includes('catalog'))!.url).toBe(
      '/v1/audio/catalog?library=yner&kind=ambience',
    );
    expect(r.result.current.none).toEqual({});
    await r.unmount();
  });
});

describe('préécoute', () => {
  it('une à la fois, arrêtée au démontage', async () => {
    const r = await renderHook(() => usePreview());
    await r.act(() => r.result.current.play({ id: 'a', url: 'https://cdn.test/a.mp3', name: 'A' }));
    expect(r.result.current.playingId).toBe('a');
    await r.act(() => r.result.current.play(asset('b')));
    expect(r.result.current.playingId).toBe('b');
    await r.act(() => r.result.current.stop());
    expect(r.result.current.playingId).toBeNull();
    await r.act(() => r.result.current.play({ id: 'c', url: '' }));
    expect(r.result.current.playingId).toBeNull();
    await r.unmount();
  });
});

describe('sons spatiaux de la carte', () => {
  it('entendus selon la position de l’auditeur ; coupés ; sans auditeur : rien', async () => {
    routes.set(`GET ${BASE}/assets/resolve`, () => ({
      items: [asset('feu', { kind: 'ambience' })],
    }));
    let input = {
      listener: { x: 100, y: 100 } as { x: number; y: number } | null,
      sources: [
        { id: 'zone:feu', assetId: 'feu', x: 120, y: 100, radius: 200, volume: 1, walls: 1 },
        {
          id: 'zone:loin',
          url: 'https://cdn.test/loin.mp3',
          x: 5000,
          y: 5000,
          radius: 50,
          volume: 1,
        },
        { id: 'zone:vide', x: 0, y: 0, radius: 50, volume: 1 },
      ],
      enabled: true,
    };
    const r = await renderHook(() => useSpatialAudio(CAMP, input));
    await r.waitFor(() => expect(r.result.current.activeIds).toContain('zone:feu'));
    input = { ...input, enabled: false };
    await r.act(async () => {
      await new Promise((res) => setTimeout(res, 120));
    });
    input = { ...input, enabled: true, listener: null };
    await r.act(async () => {
      await new Promise((res) => setTimeout(res, 120));
    });
    await r.unmount();
  });
});
