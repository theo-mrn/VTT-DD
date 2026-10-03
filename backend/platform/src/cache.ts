import { metrics } from '@opentelemetry/api';
import type { Redis } from 'ioredis';

/** Stockage clé/valeur minimal : Redis en prod, mémoire en test et en dev. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Écrit seulement si la clé n'existe pas. Sert de verrou distribué. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(keys: string[]): Promise<void>;
  addToSet(key: string, members: string[], ttlSeconds: number): Promise<void>;
  members(key: string): Promise<string[]>;
  ping(): Promise<boolean>;
}

export class RedisStore implements CacheStore {
  constructor(private readonly redis: Redis) {}
  get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttl: number) {
    await this.redis.set(key, value, 'EX', ttl);
  }
  async setIfAbsent(key: string, value: string, ttl: number) {
    return (await this.redis.set(key, value, 'EX', ttl, 'NX')) === 'OK';
  }
  async del(keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }
  async addToSet(key: string, members: string[], ttl: number) {
    await this.redis
      .multi()
      .sadd(key, ...members)
      .expire(key, ttl)
      .exec();
  }
  members(key: string) {
    return this.redis.smembers(key);
  }
  async ping() {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}

export class MemoryStore implements CacheStore {
  private readonly data = new Map<string, { v: string | Set<string>; exp: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.exp <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    const e = this.live(key);
    return typeof e?.v === 'string' ? e.v : null;
  }
  async set(key: string, value: string, ttl: number) {
    this.data.set(key, { v: value, exp: this.now() + ttl * 1000 });
  }
  async setIfAbsent(key: string, value: string, ttl: number) {
    if (this.live(key)) return false;
    await this.set(key, value, ttl);
    return true;
  }
  async del(keys: string[]) {
    keys.forEach((k) => this.data.delete(k));
  }
  async addToSet(key: string, members: string[], ttl: number) {
    const e = this.live(key);
    const set = e && typeof e.v !== 'string' ? e.v : new Set<string>();
    members.forEach((m) => set.add(m));
    this.data.set(key, { v: set, exp: this.now() + ttl * 1000 });
  }
  async members(key: string) {
    const e = this.live(key);
    return e && typeof e.v !== 'string' ? [...e.v] : [];
  }
  async ping() {
    return true;
  }
}

export interface CacheOptions {
  /** Préfixe de toutes les clés, en général le nom du service. */
  namespace: string;
  defaultTtlSeconds: number;
  /** Variation aléatoire du TTL (0.1 = ±10 %) pour éviter les expirations simultanées. */
  jitter?: number;
}

export interface GetOrSetOptions {
  ttlSeconds?: number;
  /** Tags pour invalider un groupe de clés, ex. `room:<id>`. */
  tags?: string[];
}

const meter = metrics.getMeter('@vtt/platform');
const hits = meter.createCounter('cache.hits', { description: 'Lectures servies par le cache' });
const misses = meter.createCounter('cache.misses', {
  description: 'Lectures ayant appelé la source',
});

/**
 * Cache-aside JSON avec :
 * - protection contre la ruée : un seul appel à la source par clé et par instance ;
 * - TTL avec jitter ;
 * - invalidation par tag (typiquement déclenchée par un événement du bus).
 * Une panne du cache n'empêche jamais de servir la requête.
 */
export class Cache {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly jitter: number;

  constructor(
    private readonly store: CacheStore,
    private readonly opts: CacheOptions,
    private readonly onError: (err: unknown, op: string) => void = () => {},
  ) {
    this.jitter = opts.jitter ?? 0.1;
  }

  key(k: string) {
    return `${this.opts.namespace}:${k}`;
  }
  private tagKey(t: string) {
    return `${this.opts.namespace}:tag:${t}`;
  }
  private ttl(base?: number) {
    const t = base ?? this.opts.defaultTtlSeconds;
    const delta = t * this.jitter * (Math.random() * 2 - 1);
    return Math.max(1, Math.round(t + delta));
  }

  async get<T>(k: string): Promise<T | undefined> {
    try {
      const raw = await this.store.get(this.key(k));
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (err) {
      this.onError(err, 'get');
      return undefined;
    }
  }

  async set<T>(k: string, value: T, o: GetOrSetOptions = {}): Promise<void> {
    const ttl = this.ttl(o.ttlSeconds);
    try {
      await this.store.set(this.key(k), JSON.stringify(value), ttl);
      for (const t of o.tags ?? []) {
        // Le set de tag vit un peu plus longtemps que les clés qu'il référence
        await this.store.addToSet(this.tagKey(t), [this.key(k)], ttl * 2);
      }
    } catch (err) {
      this.onError(err, 'set');
    }
  }

  async getOrSet<T>(k: string, loader: () => Promise<T>, o: GetOrSetOptions = {}): Promise<T> {
    const cached = await this.get<T>(k);
    if (cached !== undefined) {
      hits.add(1, { namespace: this.opts.namespace });
      return cached;
    }
    misses.add(1, { namespace: this.opts.namespace });

    const pending = this.inflight.get(k) as Promise<T> | undefined;
    if (pending) return pending;

    const p = (async () => {
      try {
        const value = await loader();
        await this.set(k, value, o);
        return value;
      } finally {
        this.inflight.delete(k);
      }
    })();
    this.inflight.set(k, p);
    return p;
  }

  async del(...keys: string[]): Promise<void> {
    try {
      await this.store.del(keys.map((k) => this.key(k)));
    } catch (err) {
      this.onError(err, 'del');
    }
  }

  async invalidateTags(...tags: string[]): Promise<number> {
    let count = 0;
    try {
      for (const t of tags) {
        const keys = await this.store.members(this.tagKey(t));
        await this.store.del([...keys, this.tagKey(t)]);
        count += keys.length;
      }
    } catch (err) {
      this.onError(err, 'invalidateTags');
    }
    return count;
  }

  /** Verrou distribué simple (SET NX EX). Renvoie false si déjà pris. */
  async acquire(k: string, ttlSeconds: number): Promise<boolean> {
    return this.store.setIfAbsent(this.key(`lock:${k}`), '1', ttlSeconds);
  }

  async release(k: string): Promise<void> {
    await this.store.del([this.key(`lock:${k}`)]);
  }

  ping() {
    return this.store.ping();
  }
}
