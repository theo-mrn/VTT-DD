// @vitest-environment jsdom
/**
 * Lecture YouTube vue d'un joueur : chaque état reçu du serveur (lecture, pause, reprise,
 * autre morceau) doit se traduire sur le lecteur YouTube, sans lecteur orphelin. Le lecteur
 * est simulé (API IFrame factice), le reste est le vrai moteur.
 */
import type { ChannelState, PlaybackAsset } from '@vtt/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerClock } from '../sync/clock';
import { FakeAudioContext, FakeElement } from '../test/fake-audio';
import { AudioEngine } from './engine';
import { disposeAllVoices, sweepYoutubeHost } from './registry';

vi.mock('../api', () => ({ audioApi: { clock: async () => ({ serverTime: 0 }) } }));

const CAMPAIGN = '0199a0c3-0000-7000-8000-000000000001';
const PLAYING = 1;
const PAUSED = 2;

class FakePlayer {
  static all: FakePlayer[] = [];
  state = -1;
  time = 0;
  destroyed = false;
  volume = 100;
  constructor(
    readonly el: HTMLElement,
    readonly o: { videoId: string; events?: { onReady?: () => void } },
  ) {
    FakePlayer.all.push(this);
    queueMicrotask(() => o.events?.onReady?.());
  }
  get videoId() {
    return this.o.videoId;
  }
  playVideo() {
    this.state = PLAYING;
  }
  pauseVideo() {
    this.state = PAUSED;
  }
  seekTo(s: number) {
    this.time = s;
  }
  setVolume(v: number) {
    this.volume = v;
  }
  getCurrentTime() {
    return this.time;
  }
  getDuration() {
    return 0;
  }
  getPlayerState() {
    return this.state;
  }
  destroy() {
    this.destroyed = true;
    this.state = -1;
  }
}

const yt = (id: string, name = id): PlaybackAsset => ({
  id: `0199a0c3-0000-7000-8000-00000000000${id.length}`.slice(0, 36),
  name,
  kind: 'music',
  source: 'youtube',
  status: 'ready',
  url: null,
  youtubeId: id,
  durationMs: null,
  gainDb: 0,
  volume: 1,
  deleted: false,
});

const TAVERN = { ...yt('tavern00001', 'Tavern1'), id: '0199a0c3-0000-7000-8000-0000000000a1' };
const EPIC = { ...yt('epic0000003', 'Epic 3'), id: '0199a0c3-0000-7000-8000-0000000000a2' };

function state(o: Partial<ChannelState>): ChannelState {
  return {
    campaignId: CAMPAIGN,
    channel: 'music',
    version: 1,
    status: 'playing',
    track: TAVERN,
    next: null,
    playlistId: null,
    queueIndex: 0,
    queueLength: 1,
    repeat: 'all',
    shuffle: false,
    positionMs: 0,
    anchorAt: new Date(1_000_000).toISOString(),
    endsAt: null,
    volume: 1,
    crossfadeMs: 0,
    updatedBy: null,
    updatedAt: new Date(1_000_000).toISOString(),
    ...o,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
/** Lecteurs vivants (non détruits) et ceux qui jouent. */
const alive = () => FakePlayer.all.filter((p) => !p.destroyed);
const playing = () => alive().filter((p) => p.state === PLAYING);

describe('YouTube : ce que reçoit un joueur', () => {
  let engine: AudioEngine;
  const serverNow = { t: 1_000_000 };

  beforeEach(async () => {
    FakePlayer.all = [];
    (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
    serverNow.t = 1_000_000;
    engine = new AudioEngine({
      createContext: () => new FakeAudioContext() as unknown as BaseAudioContext,
      createElement: () => new FakeElement() as unknown as HTMLAudioElement,
      clock: new ServerClock(
        async () => ({ serverTime: serverNow.t }),
        () => serverNow.t,
      ),
      listenForUnlock: false,
      scan: false,
    });
    engine.attachCampaign(CAMPAIGN);
    await engine.unlock();
  });

  afterEach(() => {
    engine.detachCampaign();
    disposeAllVoices();
  });

  it('lecture, pause, reprise, autre morceau : le lecteur suit chaque état', async () => {
    engine.applyChannel(state({ version: 10 }));
    await flush();
    expect(playing().map((p) => p.videoId)).toEqual(['tavern00001']);

    // Pause du MJ : plus rien ne joue
    serverNow.t = 1_030_000;
    engine.applyChannel(
      state({
        version: 11,
        status: 'paused',
        positionMs: 30_000,
        anchorAt: new Date(1_030_000).toISOString(),
      }),
    );
    await flush();
    expect(playing()).toHaveLength(0);

    // Reprise : le même morceau repart à 30 s
    serverNow.t = 1_040_000;
    engine.applyChannel(
      state({ version: 12, positionMs: 30_000, anchorAt: new Date(1_040_000).toISOString() }),
    );
    await flush();
    expect(playing().map((p) => p.videoId)).toEqual(['tavern00001']);
    expect(playing()[0]!.time).toBeCloseTo(30, 0);
    // Même lecteur repris (déjà chargé, déjà autorisé par le navigateur), pas un nouveau
    expect(FakePlayer.all).toHaveLength(1);

    // Autre morceau : l'ancien s'arrête, un seul lecteur joue
    serverNow.t = 1_050_000;
    engine.applyChannel(
      state({ version: 13, track: EPIC, anchorAt: new Date(1_050_000).toISOString() }),
    );
    await flush();
    expect(playing().map((p) => p.videoId)).toEqual(['epic0000003']);
    // L'ancien morceau est gardé en pause (reprise instantanée), jamais en lecture
    expect(
      alive()
        .filter((p) => p.videoId === 'tavern00001')
        .every((p) => p.state !== PLAYING),
    ).toBe(true);
  });

  it('un état en retard (événement arrivé après la relecture) est ignoré', async () => {
    engine.applyChannel(state({ version: 20, track: EPIC }));
    engine.applyChannel(state({ version: 19, track: TAVERN }));
    await flush();
    expect(playing().map((p) => p.videoId)).toEqual(['epic0000003']);
  });

  it('balayage : un lecteur YouTube laissé par un ancien code est supprimé', () => {
    let host = document.getElementById('vtt-youtube-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'vtt-youtube-host';
      document.body.appendChild(host);
    }
    const orphelin = document.createElement('iframe');
    host.appendChild(orphelin);
    expect(sweepYoutubeHost()).toBe(1);
    expect(orphelin.isConnected).toBe(false);
  });
});
