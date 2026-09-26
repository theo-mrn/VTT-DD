/**
 * Noms et avatars des membres d'une salle : profils publics d'identity
 * (GET /v1/users/:id, avec le jeton de l'utilisateur qui consulte la salle),
 * gardés 5 minutes dans le cache du service. Une panne d'identity ne bloque
 * jamais la salle : les noms restent vides.
 */
import type { Cache } from '@vtt/platform';
import { z } from 'zod';

export interface Profil {
  nom: string | null;
  avatarUrl: string | null;
}

export interface ClientProfils {
  profils(userIds: string[], authorization: string | undefined): Promise<Map<string, Profil>>;
}

const VIDE: Profil = { nom: null, avatarUrl: null };
const DELAI_MS = 2_000;
const TTL_SECONDES = 300;

const ProfilPublic = z.object({ name: z.string(), avatarUrl: z.string().nullable() });

export const sansProfils: ClientProfils = {
  profils: async (ids) => new Map(ids.map((id) => [id, VIDE])),
};

export function clientProfils(o: {
  url: string;
  cache: Cache;
  fetch?: typeof globalThis.fetch;
  signaler?: (erreur: unknown) => void;
}): ClientProfils {
  const appel = o.fetch ?? globalThis.fetch;

  async function charger(userId: string, authorization: string): Promise<Profil> {
    const res = await appel(new URL(`/v1/users/${encodeURIComponent(userId)}`, o.url), {
      headers: { authorization, accept: 'application/json' },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    // Compte supprimé : profil vide, mis en cache comme les autres
    if (res.status === 404) return VIDE;
    if (!res.ok) throw new Error(`identity a répondu ${res.status}`);
    const p = ProfilPublic.parse(await res.json());
    return { nom: p.name, avatarUrl: p.avatarUrl };
  }

  return {
    async profils(userIds, authorization) {
      const resultat = new Map<string, Profil>();
      await Promise.all(
        userIds.map(async (id) => {
          if (!authorization) return resultat.set(id, VIDE);
          try {
            // Une erreur n'est pas mise en cache : la prochaine lecture réessaie
            const p = await o.cache.getOrSet(`profil:${id}`, () => charger(id, authorization), {
              ttlSeconds: TTL_SECONDES,
            });
            resultat.set(id, p);
          } catch (e) {
            o.signaler?.(e);
            resultat.set(id, VIDE);
          }
        }),
      );
      return resultat;
    },
  };
}
