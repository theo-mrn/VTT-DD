/**
 * Noms et avatars des membres d'une campagne : profils publics d'identity
 * (GET /v1/users/:id, avec le jeton de l'utilisateur qui consulte la campagne),
 * gardés 5 minutes dans le cache du service. Une panne d'identity ne bloque
 * jamais la campagne : les noms restent vides.
 */
import type { Cache } from '@vtt/platform';
import { z } from 'zod';

export interface Profile {
  name: string | null;
  avatarUrl: string | null;
}

export interface ProfilesClient {
  profiles(userIds: string[], authorization: string | undefined): Promise<Map<string, Profile>>;
}

const EMPTY: Profile = { name: null, avatarUrl: null };
const TIMEOUT_MS = 2_000;
const TTL_SECONDS = 300;

const PublicProfile = z.object({ name: z.string(), avatarUrl: z.string().nullable() });

export const noProfiles: ProfilesClient = {
  profiles: async (ids) => new Map(ids.map((id) => [id, EMPTY])),
};

export function profilesClient(o: {
  url: string;
  cache: Cache;
  fetch?: typeof globalThis.fetch;
  onError?: (error: unknown) => void;
}): ProfilesClient {
  const doFetch = o.fetch ?? globalThis.fetch;

  async function load(userId: string, authorization: string): Promise<Profile> {
    const res = await doFetch(new URL(`/v1/users/${encodeURIComponent(userId)}`, o.url), {
      headers: { authorization, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Compte supprimé : profil vide, mis en cache comme les autres
    if (res.status === 404) return EMPTY;
    if (!res.ok) throw new Error(`identity a répondu ${res.status}`);
    const p = PublicProfile.parse(await res.json());
    return { name: p.name, avatarUrl: p.avatarUrl };
  }

  return {
    async profiles(userIds, authorization) {
      const result = new Map<string, Profile>();
      await Promise.all(
        userIds.map(async (id) => {
          if (!authorization) return result.set(id, EMPTY);
          try {
            // Une erreur n'est pas mise en cache : la prochaine lecture réessaie
            const p = await o.cache.getOrSet(`profile:${id}`, () => load(id, authorization), {
              ttlSeconds: TTL_SECONDS,
            });
            result.set(id, p);
          } catch (e) {
            o.onError?.(e);
            result.set(id, EMPTY);
          }
        }),
      );
      return result;
    },
  };
}
