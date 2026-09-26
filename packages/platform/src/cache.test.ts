import { describe, expect, it, vi } from 'vitest';
import { Cache, MemoryStore, type CacheStore } from './cache.js';

function make(store: CacheStore = new MemoryStore()) {
  return new Cache(store, { namespace: 'test', defaultTtlSeconds: 60, jitter: 0 });
}

describe('Cache', () => {
  it('ne rappelle pas la source quand la valeur est en cache', async () => {
    const cache = make();
    const loader = vi.fn(async () => ({ hp: 17 }));
    expect(await cache.getOrSet('c1', loader)).toEqual({ hp: 17 });
    expect(await cache.getOrSet('c1', loader)).toEqual({ hp: 17 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('un seul appel à la source pour des lectures simultanées', async () => {
    const cache = make();
    let calls = 0;
    const loader = () =>
      new Promise<number>((r) => {
        calls++;
        setTimeout(() => r(42), 10);
      });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.getOrSet('k', loader)),
    );
    expect(results.every((v) => v === 42)).toBe(true);
    expect(calls).toBe(1);
  });

  it("n'écrit rien quand la source échoue, et libère la clé", async () => {
    const cache = make();
    await expect(
      cache.getOrSet('k', async () => Promise.reject(new Error('db down'))),
    ).rejects.toThrow('db down');
    expect(await cache.getOrSet('k', async () => 1)).toBe(1);
  });

  it('expire selon le TTL', async () => {
    let now = 0;
    const cache = make(new MemoryStore(() => now));
    await cache.set('k', 'v', { ttlSeconds: 10 });
    now = 9_000;
    expect(await cache.get('k')).toBe('v');
    now = 10_001;
    expect(await cache.get('k')).toBeUndefined();
  });

  it('invalide toutes les clés d’un tag', async () => {
    const cache = make();
    await cache.set('char:1', 1, { tags: ['room:A'] });
    await cache.set('char:2', 2, { tags: ['room:A'] });
    await cache.set('char:3', 3, { tags: ['room:B'] });
    expect(await cache.invalidateTags('room:A')).toBe(2);
    expect(await cache.get('char:1')).toBeUndefined();
    expect(await cache.get('char:3')).toBe(3);
  });

  it('sert depuis la source si le cache est en panne', async () => {
    const broken: CacheStore = {
      ...new MemoryStore(),
      get: () => Promise.reject(new Error('redis down')),
      set: () => Promise.reject(new Error('redis down')),
      addToSet: () => Promise.reject(new Error('redis down')),
    } as unknown as CacheStore;
    const onError = vi.fn();
    const cache = new Cache(broken, { namespace: 't', defaultTtlSeconds: 5 }, onError);
    expect(await cache.getOrSet('k', async () => 'fresh')).toBe('fresh');
    expect(onError).toHaveBeenCalled();
  });

  it('verrou : un seul détenteur', async () => {
    const cache = make();
    expect(await cache.acquire('job', 5)).toBe(true);
    expect(await cache.acquire('job', 5)).toBe(false);
    await cache.release('job');
    expect(await cache.acquire('job', 5)).toBe(true);
  });
});
