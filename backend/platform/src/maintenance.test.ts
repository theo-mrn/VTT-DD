import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { periodic, withAdvisoryLock } from './maintenance.js';
import { memoryObjectStore, removePrefix } from './storage.js';

/** Pool factice : une seule session détient chaque verrou. */
function fakePool(held: Set<string>) {
  const client = {
    query: vi.fn(async (q: string, [name]: [string]) => {
      if (q.includes('pg_try_advisory_lock')) {
        const ok = !held.has(name);
        held.add(name);
        return { rows: [{ ok }] };
      }
      held.delete(name);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return { pool: { connect: async () => client } as unknown as pg.Pool, client };
}

describe('entretien', () => {
  afterEach(() => vi.useRealTimers());

  it('verrou consultatif : une seule passe à la fois, verrou rendu même en échec', async () => {
    const held = new Set<string>();
    const { pool, client } = fakePool(held);
    let inner: boolean | undefined;
    const outer = await withAdvisoryLock(pool, 'purge', async () => {
      inner = await withAdvisoryLock(pool, 'purge', async () => undefined);
    });
    expect([outer, inner]).toEqual([true, false]);
    await expect(
      withAdvisoryLock(pool, 'purge', async () => {
        throw new Error('boum');
      }),
    ).rejects.toThrow('boum');
    expect(held.size).toBe(0);
    expect(client.release).toHaveBeenCalledTimes(3);
  });

  it('périodique : passes espacées, une erreur n’arrête pas la suivante, arrêt propre', async () => {
    vi.useFakeTimers();
    const error = vi.fn();
    let n = 0;
    const stop = periodic({
      name: 'test',
      everyMs: 1000,
      firstInMs: 10,
      logger: { error } as never,
      run: async () => {
        n += 1;
        if (n === 1) throw new Error('boum');
      },
    });
    await vi.advanceTimersByTimeAsync(10);
    expect([n, error.mock.calls.length]).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(n).toBe(2);
    await stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(n).toBe(2);
  });

  it('dossier supprimé en entier, rien hors du préfixe', async () => {
    const now = new Date();
    const { store, objects } = memoryObjectStore({
      'characters/a/1.webp': now,
      'characters/a/2.webp': now,
      'characters/ab/3.webp': now,
    });
    expect(await removePrefix(store, 'characters/a/')).toBe(2);
    expect([...objects.keys()]).toEqual(['characters/ab/3.webp']);
    await expect(removePrefix(store, 'characters/a')).rejects.toThrow('préfixe');
  });
});
