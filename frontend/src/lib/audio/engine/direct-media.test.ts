/**
 * Mode direct (Safari) : les fichiers ne passent jamais par Web Audio ; le volume de
 * l'élément porte le gain de la voix × le mixeur du bus, fondus compris.
 */
import type { ChannelState, PlaybackAsset } from '@vtt/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerClock } from '../sync/clock';
import { FakeAudioContext, FakeElement } from '../test/fake-audio';
import { AudioEngine } from './engine';
import { disposeAllVoices } from './registry';

vi.mock('../api', () => ({ audioApi: { clock: async () => ({ serverTime: 0 }) } }));

const CAMPAIGN = '0199a0c3-0000-7000-8000-000000000001';
const asset: PlaybackAsset = {
  id: '0199a0c3-0000-7000-8000-0000000000b1',
  name: 'Forêt',
  kind: 'ambience',
  source: 'catalog',
  status: 'ready',
  url: 'https://cdn.test/foret.mp3',
  youtubeId: null,
  durationMs: 120_000,
  gainDb: 0,
  volume: 1,
  deleted: false,
};
const state = (o: Partial<ChannelState> = {}): ChannelState => ({
  campaignId: CAMPAIGN,
  channel: 'ambience',
  version: 1,
  status: 'playing',
  track: asset,
  next: null,
  playlistId: null,
  queueIndex: 0,
  queueLength: 1,
  repeat: 'track',
  shuffle: false,
  positionMs: 0,
  anchorAt: new Date(1_000_000).toISOString(),
  endsAt: null,
  volume: 0.8,
  crossfadeMs: 0,
  updatedBy: null,
  updatedAt: new Date(1_000_000).toISOString(),
  ...o,
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mode direct (Safari)', () => {
  afterEach(() => disposeAllVoices());

  it('aucune source Web Audio, volume = voix × table × mixeur, qui suit le mixeur', async () => {
    const ctx = new FakeAudioContext();
    const elements: FakeElement[] = [];
    const engine = new AudioEngine({
      createContext: () => ctx as unknown as BaseAudioContext,
      createElement: () => {
        const el = new FakeElement();
        elements.push(el);
        return el as unknown as HTMLAudioElement;
      },
      clock: new ServerClock(
        async () => ({ serverTime: 1_000_000 }),
        () => 1_000_000,
      ),
      listenForUnlock: false,
      scan: false,
      directMedia: true,
    });
    engine.attachCampaign(CAMPAIGN);
    await engine.unlock();
    engine.applyChannel(state());
    await wait(120); // fondu d'entrée (60 ms)

    expect(ctx.mediaSources).toBe(0);
    const el = elements.find((e) => !e.paused)!;
    expect(el.src).toBe('https://cdn.test/foret.mp3');
    expect(el.volume).toBeCloseTo(0.8, 2);

    // Mixeur : ambiance à 50 %, général à 50 % → 0,8 × 0,5 × 0,5
    engine.setMixer({
      volumes: { master: 0.5, music: 1, ambience: 0.5, sfx: 1, zones: 1, dice: 1 },
      muted: {
        master: false,
        music: false,
        ambience: false,
        sfx: false,
        zones: false,
        dice: false,
      },
    });
    expect(el.volume).toBeCloseTo(0.2, 2);

    // Pause : fondu puis élément arrêté
    engine.applyChannel(state({ version: 2, status: 'paused' }));
    await wait(250);
    expect(el.paused).toBe(true);
    engine.detachCampaign();
  });
});
