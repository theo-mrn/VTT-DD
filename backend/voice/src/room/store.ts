/**
 * Salle vocale de chaque campagne (docs/voix.md § 3.1) : qui est là, sa session Cloudflare,
 * s'il parle et s'il est muet. Rien en base : une présence vit `VOICE_PRESENCE_TTL_S`
 * secondes, prolongée par le battement du navigateur ; un onglet fermé sans au revoir
 * disparaît seul.
 *
 * Valkey (plusieurs réplicas) : une clé par participant (`voice:<campagne>:p:<utilisateur>`,
 * avec durée de vie) et l'ensemble des membres (`voice:<campagne>:members`) ; en mémoire sans
 * Valkey (dev, tests).
 */
import { VOICE_PRESENCE_TTL_S } from '@vtt/contracts';
import type { Redis } from 'ioredis';

/** Ce que le service garde d'un participant ; `sessionId` ne sort jamais du service. */
export interface Presence {
  userId: string;
  sessionId: string;
  /** Piste du micro poussée (MJ, joueur) ; absente : écoute seulement. */
  micTrack: string | null;
  muted: boolean;
  joinedAt: string;
  /** Canal privé (docs/voix.md § 5) : avec qui ; absent des présences d'avant. */
  privateWith?: string | null;
  /** Sa voix privée publiée : nom de la piste (unique par canal) et `mid` dans sa session. */
  privateTrack?: string | null;
  privateMid?: string | null;
}

export interface RoomStore {
  get(campaignId: string, userId: string): Promise<Presence | null>;
  /** Écrit (ou prolonge) la présence. */
  put(campaignId: string, p: Presence): Promise<void>;
  remove(campaignId: string, userId: string): Promise<void>;
  /** Présences encore vivantes. */
  list(campaignId: string): Promise<Presence[]>;
}

/** L'ensemble des membres vit plus longtemps que les présences : nettoyé à la lecture. */
const MEMBERS_TTL_S = 6 * 3600;

const keys = {
  presence: (c: string, u: string) => `voice:${c}:p:${u}`,
  members: (c: string) => `voice:${c}:members`,
};

export function redisRooms(redis: Redis): RoomStore {
  return {
    async get(c, u) {
      const v = await redis.get(keys.presence(c, u));
      return v ? (JSON.parse(v) as Presence) : null;
    },
    async put(c, p) {
      await redis
        .multi()
        .set(keys.presence(c, p.userId), JSON.stringify(p), 'EX', VOICE_PRESENCE_TTL_S)
        .sadd(keys.members(c), p.userId)
        .expire(keys.members(c), MEMBERS_TTL_S)
        .exec();
    },
    async remove(c, u) {
      await redis.multi().del(keys.presence(c, u)).srem(keys.members(c), u).exec();
    },
    async list(c) {
      const ids = await redis.smembers(keys.members(c));
      if (!ids.length) return [];
      const values = await redis.mget(ids.map((u) => keys.presence(c, u)));
      const gone = ids.filter((_, i) => !values[i]);
      if (gone.length) await redis.srem(keys.members(c), ...gone);
      return values.filter((v): v is string => !!v).map((v) => JSON.parse(v) as Presence);
    },
  };
}

export function memoryRooms(now: () => number = Date.now): RoomStore {
  const rooms = new Map<string, Map<string, { p: Presence; until: number }>>();
  const room = (c: string) => {
    let r = rooms.get(c);
    if (!r) rooms.set(c, (r = new Map()));
    return r;
  };
  const alive = (c: string) => {
    const r = room(c);
    for (const [u, e] of r) if (e.until <= now()) r.delete(u);
    return r;
  };
  return {
    async get(c, u) {
      return alive(c).get(u)?.p ?? null;
    },
    async put(c, p) {
      room(c).set(p.userId, { p, until: now() + VOICE_PRESENCE_TTL_S * 1000 });
    },
    async remove(c, u) {
      room(c).delete(u);
    },
    async list(c) {
      return [...alive(c).values()].map((e) => e.p);
    },
  };
}
