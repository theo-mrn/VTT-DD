import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueue } from './outbox';

describe('file d’envoi des états', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('jamais deux envois dans le même instant ; le dernier état d’une clé remplace l’ancien', () => {
    const envoyes: string[] = [];
    enqueue('a', () => envoyes.push('a1'));
    enqueue('b', () => envoyes.push('b'));
    enqueue('a', () => envoyes.push('a2'));
    vi.advanceTimersByTime(0);
    expect(envoyes).toEqual(['b']);
    vi.advanceTimersByTime(60);
    expect(envoyes).toEqual(['b', 'a2']);
    vi.advanceTimersByTime(500);
    expect(envoyes).toEqual(['b', 'a2']);
  });
});
