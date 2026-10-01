import type { ChannelState, PlaybackAsset } from '@vtt/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerClock } from '../sync/clock';
import {
  FakeAudioContext,
  FakeElement,
  pathToDestination,
  type FakeNode,
} from '../test/fake-audio';
import { BufferCache } from './cache';
import { AudioEngine, IDLE_SUSPEND_MS } from './engine';
import { AudioGraph, nodeStats } from './graph';
import { disposeAllVoices } from './registry';
import { ElementPool, MediaVoice } from './voices';

vi.mock('../api', () => ({ audioApi: { clock: async () => ({ serverTime: 0 }) } }));

const CAMPAIGN = '0199a0c3-0000-7000-8000-000000000001';
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

function setup(serverNow = { t: 1_000_000 }) {
  const ctx = new FakeAudioContext();
  const elements: FakeElement[] = [];
  const clock = new ServerClock(
    async () => ({ serverTime: serverNow.t }),
    () => serverNow.t,
  );
  const engine = new AudioEngine({
    createContext: () => ctx as unknown as BaseAudioContext,
    createElement: () => {
      const el = new FakeElement();
      elements.push(el);
      return el as unknown as HTMLAudioElement;
    },
    clock,
    listenForUnlock: false,
  });
  return { ctx, engine, elements, serverNow };
}

const state = (o: Partial<ChannelState>): ChannelState => ({
  campaignId: CAMPAIGN,
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
  anchorAt: new Date(1_000_000).toISOString(),
  endsAt: new Date(1_000_000 + 120_000).toISOString(),
  volume: 1,
  crossfadeMs: 1500,
  updatedBy: null,
  updatedAt: new Date(1_000_000).toISOString(),
  ...o,
});

beforeEach(() => {
  nodeStats.live = 0;
});

describe('graphe', () => {
  it('bus → master → limiteur (−1 dBFS) → destination', () => {
    const ctx = new FakeAudioContext();
    const g = new AudioGraph(ctx as unknown as BaseAudioContext);
    for (const bus of ['music', 'ambience', 'sfx', 'zones', 'dice', 'preview'] as const)
      expect(pathToDestination(g.bus(bus) as unknown as FakeNode)).toEqual([
        'gain',
        'gain',
        'limiter',
        'destination',
      ]);
    expect(g.limiter.threshold.value).toBe(-1);
  });
});

describe('voix', () => {
  it('dispose() libère tous les nœuds, idempotent ; une source par élément du pool', () => {
    const ctx = new FakeAudioContext();
    const g = new AudioGraph(ctx as unknown as BaseAudioContext);
    const pool = new ElementPool(
      ctx as unknown as BaseAudioContext,
      () => new FakeElement() as unknown as HTMLAudioElement,
      4,
    );
    const voices = Array.from(
      { length: 3 },
      (_, i) =>
        new MediaVoice(ctx as unknown as BaseAudioContext, pool, `u${i}`, g.bus('music'), {
          pan: i === 0,
        }),
    );
    expect(nodeStats.live).toBe(4);
    for (const v of voices) v.dispose();
    voices[0]!.dispose();
    expect(nodeStats.live).toBe(0);
    // Réutilisation : pas de nouvelle source pour les éléments libérés
    for (let i = 0; i < 6; i++)
      new MediaVoice(ctx as unknown as BaseAudioContext, pool, `v${i}`, g.bus('music')).dispose();
    expect(ctx.mediaSources).toBe(3);
    expect(pool.sources).toBe(3);
  });

  it('pool plein : la voix la plus ancienne est volée', () => {
    const ctx = new FakeAudioContext();
    const g = new AudioGraph(ctx as unknown as BaseAudioContext);
    const pool = new ElementPool(
      ctx as unknown as BaseAudioContext,
      () => new FakeElement() as unknown as HTMLAudioElement,
      2,
    );
    const a = new MediaVoice(ctx as unknown as BaseAudioContext, pool, 'a', g.bus('sfx'));
    new MediaVoice(ctx as unknown as BaseAudioContext, pool, 'b', g.bus('sfx'));
    new MediaVoice(ctx as unknown as BaseAudioContext, pool, 'c', g.bus('sfx'));
    expect(a.disposed).toBe(true);
    expect(ctx.mediaSources).toBe(2);
  });
});

describe('moteur', () => {
  it('veille : suspendu après 10 s sans voix ni effet, réveillé par la demande suivante', async () => {
    vi.useFakeTimers();
    const flush = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    // Voix laissées par les tests précédents (registre partagé)
    disposeAllVoices();
    const { engine, ctx, elements } = setup();
    engine.attachCampaign(CAMPAIGN);
    await engine.unlock();
    // Une voix inscrite garde le contexte éveillé
    engine.applyChannel(state({}));
    vi.advanceTimersByTime(IDLE_SUSPEND_MS + 1_000);
    engine.scan();
    expect(ctx.state).toBe('running');
    // Plus rien : veille au bout du délai, sans bandeau « activer le son »
    engine.applyChannel(state({ version: 2, status: 'stopped', positionMs: 0, endsAt: null }));
    vi.advanceTimersByTime(500);
    engine.scan();
    expect(ctx.state).toBe('running');
    vi.advanceTimersByTime(IDLE_SUSPEND_MS);
    engine.scan();
    expect(ctx.state).toBe('suspended');
    expect(engine.status).toBe('running');
    expect(engine.needsUnlock).toBe(false);
    // Nouveau morceau : la voix part tout de suite, le contexte reprend
    engine.applyChannel(state({ version: 3, track: asset('b') }));
    expect(elements.some((e) => !e.paused && e.src === 'https://cdn.test/b.mp3')).toBe(true);
    await flush();
    expect(ctx.state).toBe('running');
    expect(engine.status).toBe('running');
    engine.detachCampaign();
    vi.useRealTimers();
  });

  it('verrouillé : rien ne joue mais le bandeau est demandé ; déverrouillé : départ à la position de la ligne de temps', async () => {
    const { engine, elements, serverNow } = setup();
    engine.attachCampaign(CAMPAIGN);
    serverNow.t = 1_000_000 + 42_000;
    engine.applyChannel(state({}));
    expect(engine.status).toBe('locked');
    expect(engine.needsUnlock).toBe(true);
    expect(elements.filter((e) => !e.paused)).toHaveLength(0);
    await engine.unlock();
    expect(engine.status).toBe('running');
    const playing = elements.find((e) => !e.paused)!;
    expect(playing.src).toBe('https://cdn.test/a.mp3');
    expect(playing.currentTime).toBeCloseTo(42, 3);
    engine.detachCampaign();
    expect(nodeStats.live).toBe(0);
  });

  it('versions : un état plus ancien ou en double est ignoré', async () => {
    const { engine } = setup();
    engine.attachCampaign(CAMPAIGN);
    await engine.unlock();
    engine.applyChannel(state({ version: 3, status: 'paused' }));
    engine.applyChannel(state({ version: 2, status: 'playing' }));
    engine.applyChannel(state({ version: 3, status: 'playing' }));
    expect(engine.channelState('music')?.status).toBe('paused');
    engine.applyChannel(state({ campaignId: '0199a0c3-0000-7000-8000-000000000009', version: 9 }));
    expect(engine.channelState('music')?.version).toBe(3);
    engine.detachCampaign();
  });

  it('dérive : léger retard → vitesse 1,02 ; gros retard → seek', async () => {
    vi.useFakeTimers();
    const { engine, elements, serverNow } = setup();
    engine.attachCampaign(CAMPAIGN);
    await engine.unlock();
    engine.applyChannel(state({}));
    const el = elements.find((e) => !e.paused)!;
    serverNow.t += 1_000;
    el.currentTime = 0.9; // 100 ms de retard
    vi.advanceTimersByTime(1_000);
    expect(el.playbackRate).toBe(1.02);
    serverNow.t += 1_000;
    el.currentTime = 0.5; // 1,5 s de retard
    vi.advanceTimersByTime(1_000);
    expect(el.currentTime).toBeCloseTo(2, 3);
    expect(el.playbackRate).toBe(1);
    engine.detachCampaign();
    vi.useRealTimers();
  });

  it('pause : fondu court puis silence ; mixeur appliqué aux bus', async () => {
    const { engine, elements, ctx } = setup();
    engine.attachCampaign(CAMPAIGN);
    await engine.unlock();
    engine.applyChannel(state({}));
    engine.applyChannel(state({ version: 2, status: 'paused', positionMs: 5_000, endsAt: null }));
    await new Promise((r) => setTimeout(r, 200));
    expect(elements.every((e) => e.paused)).toBe(true);
    engine.setMixer({
      volumes: { master: 0.5, music: 0.4, ambience: 1, sfx: 1, zones: 1, dice: 1 },
      muted: { master: false, music: false, ambience: false, sfx: true, zones: false, dice: false },
    });
    expect((engine.bus('music') as unknown as { gain: { value: number } }).gain.value).toBe(0.4);
    expect((engine.bus('sfx') as unknown as { gain: { value: number } }).gain.value).toBe(0);
    expect(engine.externalGain('music')).toBeCloseTo(0.2);
    engine.setBusEnabled('dice', false);
    expect((engine.bus('dice') as unknown as { gain: { value: number } }).gain.value).toBe(0);
    expect(ctx.state).toBe('running');
    engine.detachCampaign();
  });

  it('effets : joués une seule fois par cueId, ignorés s’ils sont trop vieux, arrêt', async () => {
    const { engine, ctx, serverNow } = setup();
    engine.attachCampaign(CAMPAIGN);
    await engine.unlock();
    const sfx = asset('boom', { kind: 'sfx', durationMs: 2_000 });
    engine.cache();
    const cue = {
      cueId: 'c1',
      asset: sfx,
      startAt: new Date(serverNow.t + 250).toISOString(),
      volume: 1,
    };
    // Le cache charge par fetch : remplacé ici
    (engine as unknown as { buffers: BufferCache }).buffers = new BufferCache(
      ctx as unknown as BaseAudioContext,
      async () => new ArrayBuffer(8),
    );
    engine.cues.play(cue);
    engine.cues.play(cue);
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.bufferSources[0]!.started).toBeGreaterThan(0.2);
    engine.cues.play({ ...cue, cueId: 'c2', startAt: new Date(serverNow.t - 5_000).toISOString() });
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.bufferSources).toHaveLength(1);
    expect(engine.cues.list.map((c) => c.cueId)).toEqual(['c1']);
    engine.cues.stopAll();
    expect(engine.cues.list).toEqual([]);
    engine.detachCampaign();
  });
});

describe('cache des buffers', () => {
  it('un seul chargement pour des appels simultanés, éviction LRU', async () => {
    const ctx = new FakeAudioContext();
    let loads = 0;
    const cache = new BufferCache(
      ctx as unknown as BaseAudioContext,
      async () => {
        loads += 1;
        return new ArrayBuffer(100);
      },
      800,
    );
    await Promise.all([cache.get('a'), cache.get('a')]);
    expect(loads).toBe(1);
    await cache.get('b');
    await cache.get('a');
    await cache.get('c'); // 3 × 400 octets > 800 : b, le moins récent, sort
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });
});
