import { describe, expect, it } from 'vitest';
import type { PlaybackAsset } from './audio.js';
import {
  busGain,
  cueDecision,
  DEFAULT_MIXER,
  driftAction,
  estimateOffset,
  loopPosition,
  migrateLegacyMixer,
  planChannel,
  PRELOAD_BEFORE_MS,
  reduceChannel,
  selectActiveSources,
  zoneMix,
} from './audio-sync.js';

describe('estimateOffset', () => {
  it('garde l’échantillon de plus petit aller-retour', () => {
    // Horloge du serveur en avance de 1 000 ms ; aller-retours asymétriques
    const samples = [
      { t0: 0, t1: 200, serverTime: 1_150 }, // retour lent : estimation faussée de 50 ms
      { t0: 1_000, t1: 1_020, serverTime: 2_010 }, // le plus court : exact
      { t0: 2_000, t1: 2_300, serverTime: 3_020 },
    ];
    expect(estimateOffset(samples)).toEqual({ offsetMs: 1_000, rttMs: 20 });
  });

  it('ignore les valeurs aberrantes, null sans échantillon valide', () => {
    expect(estimateOffset([])).toBeNull();
    expect(
      estimateOffset([
        { t0: 10, t1: 5, serverTime: 0 },
        { t0: 0, t1: Number.NaN, serverTime: 0 },
      ]),
    ).toBeNull();
    expect(
      estimateOffset([
        { t0: 10, t1: 5, serverTime: 999 },
        { t0: 0, t1: 40, serverTime: -480 },
      ]),
    ).toEqual({ offsetMs: -500, rttMs: 40 });
  });
});

describe('driftAction', () => {
  it('seuils : rien, vitesse, seek', () => {
    expect(driftAction(10_000, 9_960)).toEqual({ type: 'none' });
    expect(driftAction(10_000, 9_900)).toEqual({ type: 'rate', rate: 1.02 });
    expect(driftAction(10_000, 10_100)).toEqual({ type: 'rate', rate: 0.98 });
    expect(driftAction(10_000, 9_000)).toEqual({ type: 'seek', positionMs: 10_000 });
    expect(driftAction(10_000, 11_000)).toEqual({ type: 'seek', positionMs: 10_000 });
  });

  it('hystérésis : une correction continue jusqu’à 15 ms', () => {
    expect(driftAction(10_000, 9_970, true)).toEqual({ type: 'rate', rate: 1.02 });
    expect(driftAction(10_000, 9_990, true)).toEqual({ type: 'none' });
  });
});

describe('cueDecision', () => {
  it('joue un effet récent depuis le début, retarde un départ futur', () => {
    expect(cueDecision(1_000, 1_500)).toEqual({ play: true, delayMs: 0 });
    expect(cueDecision(2_000, 1_900)).toEqual({ play: true, delayMs: 100 });
  });
  it('ignore un rejeu tardif (reconnexion, onglet endormi)', () => {
    expect(cueDecision(1_000, 4_001)).toEqual({ play: false });
    expect(cueDecision(1_000, 4_000)).toEqual({ play: true, delayMs: 0 });
    expect(cueDecision(Number.NaN, 0)).toEqual({ play: false });
  });
  it('décalage d’horloge : la décision se prend sur l’heure du serveur', () => {
    const offset = 5_000; // client en retard de 5 s sur le serveur
    const localNow = 100_000;
    expect(cueDecision(localNow + offset - 1_000, localNow + offset).play).toBe(true);
  });
});

describe('reduceChannel', () => {
  const s = (version: number) => ({ version, tag: `v${version}` });
  it('garde la plus grande version, ignore doublons et désordre', () => {
    expect(reduceChannel(null, s(1))).toEqual(s(1));
    const local = s(3);
    expect(reduceChannel(local, s(3))).toBe(local);
    expect(reduceChannel(local, s(2))).toBe(local);
    expect(reduceChannel(local, s(4))).toEqual(s(4));
    expect(reduceChannel(local, null)).toBe(local);
    // Arrivées dans le désordre : même état final
    const events = [s(2), s(5), s(4), s(5), s(1)];
    expect(events.reduce<ReturnType<typeof s> | null>(reduceChannel, null)).toEqual(s(5));
  });
});

describe('loopPosition', () => {
  it('modulo la durée, négatifs compris', () => {
    expect(loopPosition(25_000, 10_000)).toBe(5_000);
    expect(loopPosition(-1_000, 10_000)).toBe(9_000);
    expect(loopPosition(5, 0)).toBe(0);
  });
});

const asset = (id: string, durationMs: number | null = 60_000): PlaybackAsset => ({
  id,
  name: id,
  kind: 'music',
  source: 'upload',
  status: 'ready',
  url: `https://cdn.test/${id}.mp3`,
  youtubeId: null,
  durationMs,
  gainDb: 0,
  volume: 1,
  deleted: false,
});

describe('planChannel', () => {
  const T0 = Date.parse('2026-09-28T10:00:00.000Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  const A = asset('a');
  const B = asset('b');
  // A (60 s) démarre à T0 depuis 0 ; fondu 2 s : B commence à T0 + 58 s
  const base = {
    status: 'playing' as const,
    positionMs: 0,
    anchorAt: iso(T0),
    repeat: 'all' as const,
    endsAt: iso(T0 + 58_000),
    crossfadeMs: 2_000,
    track: A,
    next: B,
  };

  it('arrêté ou en pause : silence', () => {
    expect(planChannel({ ...base, status: 'paused' }, T0).voices).toEqual([]);
    expect(planChannel({ ...base, status: 'stopped' }, T0).voices).toEqual([]);
  });

  it('en lecture : la piste courante à la position de la ligne de temps', () => {
    const p = planChannel(base, T0 + 10_000);
    expect(p.voices).toHaveLength(1);
    expect(p.voices[0]).toMatchObject({ positionMs: 10_000, fadeOutAtMs: T0 + 58_000 });
    expect(p.preload).toBeNull();
    expect(p.nextChangeAtMs).toBe(T0 + 58_000 - PRELOAD_BEFORE_MS);
  });

  it('préchargement 20 s avant, puis fondu enchaîné sans attendre le serveur', () => {
    expect(planChannel(base, T0 + 40_000).preload).toBe(B);
    const during = planChannel(base, T0 + 59_000);
    expect(during.voices.map((v) => [v.asset.id, v.positionMs])).toEqual([
      ['a', 59_000],
      ['b', 1_000],
    ]);
    expect(during.voices[1]).toMatchObject({ startAtMs: T0 + 58_000, fadeInMs: 2_000 });
    const after = planChannel(base, T0 + 61_000);
    expect(after.voices.map((v) => [v.asset.id, v.positionMs])).toEqual([['b', 3_000]]);
    expect(after.nextChangeAtMs).toBeNull();
  });

  it('dernière piste sans répétition : fin sans fondu', () => {
    const last = { ...base, repeat: 'off' as const, next: null, endsAt: iso(T0 + 60_000) };
    expect(planChannel(last, T0 + 59_000).voices[0]?.fadeOutAtMs).toBeNull();
    expect(planChannel(last, T0 + 60_500).voices).toEqual([]);
  });

  it('boucle de piste et durée inconnue', () => {
    const loop = { ...base, repeat: 'track' as const, endsAt: null, next: null };
    expect(planChannel(loop, T0 + 125_000).voices[0]).toMatchObject({
      positionMs: 5_000,
      loop: true,
    });
    const yt = { ...base, track: asset('y', null), endsAt: null, next: null };
    expect(planChannel(yt, T0 + 500_000).voices[0]?.positionMs).toBe(500_000);
  });
});

describe('spatialisation', () => {
  const src = { id: 'zone:1', x: 100, y: 100, radius: 100, volume: 0.8 };
  it('mêmes courbes que le legacy', () => {
    expect(zoneMix({ x: 100, y: 100 }, src)).toEqual({ gain: 0.8, pan: 0 });
    const m = zoneMix({ x: 50, y: 100 }, src);
    expect(m.gain).toBeCloseTo(0.8 * (1 - 0.25));
    expect(m.pan).toBeCloseTo(50 / 60);
    expect(zoneMix({ x: 0, y: 100 }, src).pan).toBe(0); // hors rayon : muet
    expect(zoneMix({ x: 170, y: 100 }, src).pan).toBe(-1);
    expect(zoneMix(null, src)).toEqual({ gain: 0, pan: 0 });
  });

  it('plafond de sources, hystérésis', () => {
    const sources = Array.from({ length: 12 }, (_, i) => ({ ...src, id: `z${i}`, x: 100 + i }));
    const active = selectActiveSources({ x: 100, y: 100 }, sources, 8);
    expect(active.map((a) => a.source.id)).toEqual([
      'z0',
      'z1',
      'z2',
      'z3',
      'z4',
      'z5',
      'z6',
      'z7',
    ]);
    // z9 déjà active garde sa place face à z8 à peine plus forte
    const kept = selectActiveSources({ x: 100, y: 100 }, sources, 9, new Set(['z9']));
    expect(kept.map((a) => a.source.id)).toContain('z9');
    expect(kept.map((a) => a.source.id)).not.toContain('z8');
  });
});

describe('mixeur', () => {
  it('reprise des anciens réglages du navigateur', () => {
    expect(
      migrateLegacyMixer(
        JSON.stringify({ quickSounds: 0.3, musicZones: 2, backgroundMusic: 0.5, dice3d: 'x' }),
      ),
    ).toEqual({ sfx: 0.3, zones: 1, music: 0.5 });
    expect(migrateLegacyMixer('pas du json')).toBeNull();
    expect(migrateLegacyMixer('[1]')).toBeNull();
    expect(migrateLegacyMixer(JSON.stringify({ autre: 1 }))).toBeNull();
    expect(migrateLegacyMixer(null)).toBeNull();
  });

  it('gain d’un bus : volume × master, coupures', () => {
    const m = {
      volumes: { ...DEFAULT_MIXER.volumes, master: 0.5, music: 0.4 },
      muted: { ...DEFAULT_MIXER.muted },
    };
    expect(busGain(m, 'music')).toBeCloseTo(0.2);
    expect(busGain({ ...m, muted: { ...m.muted, music: true } }, 'music')).toBe(0);
    expect(busGain({ ...m, muted: { ...m.muted, master: true } }, 'sfx')).toBe(0);
  });
});
