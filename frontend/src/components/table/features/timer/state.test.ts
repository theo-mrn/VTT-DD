import { describe, expect, it } from 'vitest';
import { formatRemaining, fromWire, toWire } from './state';

describe('minuteur', () => {
  it('affiche le reste en minutes et secondes, en heures au-delà', () => {
    expect(formatRemaining(65_000)).toBe('1:05');
    expect(formatRemaining(3_725_000)).toBe('1:02:05');
  });

  it('voyage en reste à courir, chaque appareil sur sa propre horloge', () => {
    const t = { label: 'Pont', durationMs: 60_000, endsAt: 1_030_000, remainingMs: 60_000 };
    const w = toWire(t, 1_000_000)!;
    expect(w).toMatchObject({ remainingMs: 30_000, running: true });
    expect(fromWire(w, 5_000)?.endsAt).toBe(35_000);
  });
});
