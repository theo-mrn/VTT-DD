import { describe, expect, it } from 'vitest';
import {
  advanceUntil,
  applyCommand,
  INITIAL_STATE,
  MachineError,
  removeFromQueue,
  replaceQueue,
  type AssetInfo,
  type MachineContext,
  type MachineState,
} from './machine.js';

const T = 1_000_000;
const assets = new Map<string, AssetInfo>(
  [
    ['a', 60_000],
    ['b', 30_000],
    ['c', 90_000],
    ['yt', null],
  ].map(([id, d]) => [
    id as string,
    { id: id as string, durationMs: d as number | null, playable: true },
  ]),
);
assets.set('wip', { id: 'wip', durationMs: null, playable: false });
const ctx: MachineContext = {
  assets,
  playlist: { id: 'p', assetIds: ['a', 'b', 'c'] },
  random: () => 0.5,
};
const init = () => INITIAL_STATE(T, 'music');
const play = (s: MachineState, cmd: Parameters<typeof applyCommand>[1], at = T) =>
  applyCommand(s, cmd, at, ctx);
const playlist = () => play(init(), { type: 'play', playlistId: 'p' });

describe('applyCommand', () => {
  it('play d’un son seul : file d’une piste, lecture, fin prévue', () => {
    const s = play(init(), { type: 'play', assetId: 'a', positionMs: 10_000 });
    expect(s).toMatchObject({ status: 'playing', assetId: 'a', queue: ['a'], queueIndex: 0 });
    expect(s.positionMs).toBe(10_000);
    // repeat all sur une seule piste : elle se suit elle-même, avec le fondu
    expect(s.endsAtMs).toBe(T + 50_000 - 1_500);
  });

  it('play d’une playlist : fin moins le fondu, suivante connue', () => {
    const s = playlist();
    expect(s).toMatchObject({ assetId: 'a', playlistId: 'p', queue: ['a', 'b', 'c'] });
    expect(s.endsAtMs).toBe(T + 60_000 - 1_500);
  });

  it('play : erreurs', () => {
    const err = (cmd: Parameters<typeof applyCommand>[1]) => {
      try {
        play(init(), cmd);
      } catch (e) {
        return (e as MachineError).code;
      }
      return null;
    };
    expect(err({ type: 'play' })).toBe('invalid_command');
    expect(err({ type: 'play', assetId: 'a', playlistId: 'p' })).toBe('invalid_command');
    expect(err({ type: 'play', assetId: 'wip' })).toBe('asset_not_ready');
    expect(err({ type: 'play', playlistId: 'p', index: 9 })).toBe('invalid_command');
    expect(() =>
      applyCommand(init(), { type: 'play', playlistId: 'vide' }, T, {
        ...ctx,
        playlist: { id: 'vide', assetIds: [] },
      }),
    ).toThrow(expect.objectContaining({ code: 'empty_playlist' }));
  });

  it('pause puis resume : la position vient du serveur, idempotents', () => {
    const s = playlist();
    const paused = play(s, { type: 'pause' }, T + 12_345);
    expect(paused).toMatchObject({ status: 'paused', positionMs: 12_345, endsAtMs: null });
    expect(play(paused, { type: 'pause' }, T + 20_000)).toBe(paused);
    const resumed = play(paused, { type: 'resume' }, T + 30_000);
    expect(resumed).toMatchObject({
      status: 'playing',
      positionMs: 12_345,
      anchorAtMs: T + 30_000,
    });
    expect(resumed.endsAtMs).toBe(T + 30_000 + 60_000 - 12_345 - 1_500);
    expect(play(resumed, { type: 'resume' }, T + 31_000)).toBe(resumed);
    expect(() => play(init(), { type: 'resume' })).toThrow(
      expect.objectContaining({ code: 'no_track' }),
    );
  });

  it('seek : nouvelle ancre, même état, borné à la durée', () => {
    const s = play(playlist(), { type: 'seek', positionMs: 99_999 }, T + 1_000);
    expect(s).toMatchObject({ status: 'playing', positionMs: 59_999, anchorAtMs: T + 1_000 });
  });

  it('stop : position 0, piste et file gardées ; idempotent', () => {
    const s = play(playlist(), { type: 'stop' }, T + 5_000);
    expect(s).toMatchObject({
      status: 'stopped',
      positionMs: 0,
      assetId: 'a',
      queue: ['a', 'b', 'c'],
    });
    expect(play(s, { type: 'stop' })).toBe(s);
  });

  it('next et previous : voisines avec retour au début et à la fin', () => {
    let s = playlist();
    s = play(s, { type: 'previous' });
    expect(s.assetId).toBe('c');
    s = play(s, { type: 'next' });
    expect(s.assetId).toBe('a');
    const paused = play(play(s, { type: 'pause' }, T + 1), { type: 'next' }, T + 2);
    expect(paused).toMatchObject({ status: 'paused', assetId: 'b', positionMs: 0 });
  });

  it('next saute les pistes pas prêtes', () => {
    const c = { ...ctx, playlist: { id: 'p', assetIds: ['a', 'wip', 'b'] } };
    const s = applyCommand(init(), { type: 'play', playlistId: 'p' }, T, c);
    expect(applyCommand(s, { type: 'next' }, T, c).assetId).toBe('b');
  });

  it('configure : sans effet si rien ne change, sinon ré-ancrage sans saut', () => {
    const s = playlist();
    expect(play(s, { type: 'configure', volume: 1 })).toBe(s);
    const c = play(s, { type: 'configure', crossfadeMs: 0 }, T + 10_000);
    expect(c).toMatchObject({ positionMs: 10_000, anchorAtMs: T + 10_000 });
    expect(c.endsAtMs).toBe(T + 60_000);
    // Boucle de piste : pas de transition automatique
    expect(play(s, { type: 'configure', repeat: 'track' }).endsAtMs).toBeNull();
  });

  it('configure shuffle : la piste courante reste en place, ordre rétabli ensuite', () => {
    const s = play(playlist(), { type: 'next' });
    const sh = play(s, { type: 'configure', shuffle: true });
    expect(sh.assetId).toBe('b');
    expect(sh.queue[sh.queueIndex!]).toBe('b');
    expect([...sh.queue].sort()).toEqual(['a', 'b', 'c']);
    const back = play(sh, { type: 'configure', shuffle: false });
    expect(back.queue).toEqual(['a', 'b', 'c']);
    expect(back.queueIndex).toBe(1);
  });
});

describe('advanceUntil', () => {
  it('enchaîne à l’heure prévue : ancre = ancien endsAt', () => {
    const s = playlist();
    const { state, steps } = advanceUntil(s, s.endsAtMs! + 400, ctx);
    expect(steps).toBe(1);
    expect(state).toMatchObject({ assetId: 'b', positionMs: 0, anchorAtMs: s.endsAtMs });
    expect(state.endsAtMs).toBe(s.endsAtMs! + 30_000 - 1_500);
  });

  it('rien avant l’échéance ; repeat off : arrêt après la dernière', () => {
    const s = playlist();
    expect(advanceUntil(s, s.endsAtMs! - 1, ctx).steps).toBe(0);
    let off = play(s, { type: 'configure', repeat: 'off' });
    off = play(off, { type: 'next' });
    off = play(off, { type: 'next' });
    expect(off.assetId).toBe('c');
    const { state } = advanceUntil(off, T + 10 * 60_000, ctx);
    expect(state).toMatchObject({ status: 'stopped', positionMs: 0, assetId: 'c' });
  });

  it('rattrapage après panne : plusieurs pistes en une transition', () => {
    const s = playlist();
    // a (58,5 s) → b (28,5 s) → c : 100 s plus tard, c joue
    const { state, steps } = advanceUntil(s, T + 100_000, ctx);
    expect(steps).toBe(2);
    expect(state.assetId).toBe('c');
    expect(state.anchorAtMs).toBe(T + 58_500 + 28_500);
  });

  it('borné à 100 pas', () => {
    const tiny = new Map(assets);
    tiny.set('t', { id: 't', durationMs: 10, playable: true });
    const c = { ...ctx, assets: tiny };
    const s = applyCommand(init(), { type: 'play', assetId: 't' }, T, c);
    expect(advanceUntil(s, T + 1_000_000, c).steps).toBe(100);
  });

  it('YouTube sans durée : pas d’enchaînement automatique', () => {
    const s = play(init(), { type: 'play', assetId: 'yt' });
    expect(s.endsAtMs).toBeNull();
    expect(advanceUntil(s, T + 1e9, ctx).steps).toBe(0);
  });
});

describe('suppression et modification de playlist', () => {
  it('piste en cours supprimée : la suivante prend sa place', () => {
    const s = playlist();
    const r = removeFromQueue(s, 'a', T + 5_000, ctx);
    expect(r).toMatchObject({ assetId: 'b', queue: ['b', 'c'], queueIndex: 0, positionMs: 0 });
  });

  it('autre piste supprimée : la lecture continue sans saut', () => {
    const s = playlist();
    const r = removeFromQueue(s, 'b', T + 5_000, ctx);
    expect(r).toMatchObject({ assetId: 'a', queue: ['a', 'c'], positionMs: 5_000 });
  });

  it('dernière piste supprimée : arrêt', () => {
    const s = play(init(), { type: 'play', assetId: 'a' });
    expect(removeFromQueue(s, 'a', T, ctx)).toMatchObject({ status: 'stopped', queue: [] });
  });

  it('playlist réordonnée : la piste courante continue', () => {
    const s = play(playlist(), { type: 'next' }, T);
    const r = replaceQueue(s, ['c', 'b', 'a'], T + 1_000, ctx);
    expect(r).toMatchObject({ assetId: 'b', queueIndex: 1, positionMs: 1_000 });
  });
});
