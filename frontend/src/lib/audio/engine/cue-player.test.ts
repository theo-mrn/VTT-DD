import { describe, expect, it } from 'vitest';
import { CuePlayer } from './cue-player';
import type { EngineHost } from './host';

// Moteur verrouillé : un effet reçu n'est pas joué, rien n'est décodé
const host = {
  clock: { now: () => Date.now() },
  running: () => false,
  wantSound: () => undefined,
} as unknown as EngineHost;

describe('CuePlayer.list', () => {
  it('renvoie la même référence tant que rien ne change (useSyncExternalStore)', () => {
    const cues = new CuePlayer(host);
    const first = cues.list;
    expect(cues.list).toBe(first);
    expect(cues.list).toBe(first);
  });
});
