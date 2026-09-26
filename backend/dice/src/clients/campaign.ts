/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé) : il décide
 * qui peut lancer dans la campagne, qui voit les jets privés et cachés (le
 * MJ) et qui peut supprimer un jet.
 *
 * La réponse est gardée quelques secondes en mémoire. Une panne de campaign
 * n'ouvre aucun droit : la requête échoue (503).
 *
 * Pour les variables d'un jet sans personnage indiqué, comme l'ancienne app
 * (personnage incarné `users/{uid}.persoId`), dice lit aussi le détail de la
 * campagne avec le jeton de l'appelant (GET /v1/campaigns/:id) : son système
 * et le personnage qu'il incarne.
 */
import { HttpError } from '@vtt/platform';
import { z } from 'zod';
import { INTERNAL_SECRET_HEADER } from '../internal/secret.js';

export type CampaignRole = 'gm' | 'player' | 'spectator';

export interface CampaignDetails {
  systemId: string;
  /** Personnage incarné par l'appelant dans la campagne. */
  playedCharacterId: string | null;
}

export interface CampaignRights {
  /** Rôle de `userId` dans `campaignId` ; `null` s'il n'en est pas membre (ou si elle n'existe pas). */
  role(campaignId: string, userId: string): Promise<CampaignRole | null>;
  /** Système et personnage incarné, vus par l'appelant ; `null` si indisponible. */
  details(campaignId: string, authorization: string | undefined): Promise<CampaignDetails | null>;
}

const Details = z.object({
  system: z.object({ id: z.string() }),
  playedCharacterId: z.string().nullable(),
});

const Response = z.object({
  member: z.boolean(),
  role: z.enum(['gm', 'player', 'spectator']).nullable(),
});

/** Borne du cache : au-delà, les entrées les plus anciennes sont évincées. */
const MAX_CACHE = 10_000;
const TIMEOUT_MS = 3_000;

export function unavailable(service: string): HttpError {
  return new HttpError(
    503,
    'Service indisponible',
    `${service}_unavailable`,
    `Le service ${service} ne répond pas`,
  );
}

/** Sans campaign configuré : aucun jet de campagne possible. */
export const noCampaigns: CampaignRights = {
  role: async () => {
    throw unavailable('campaign');
  },
  details: async () => null,
};

export function campaignRights(o: {
  url: string;
  secret: string;
  cacheMs: number;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  onError?: (error: unknown) => void;
}): CampaignRights {
  const doFetch = o.fetch ?? globalThis.fetch;
  const now = o.now ?? Date.now;
  const cache = new Map<string, { role: CampaignRole | null; until: number }>();

  return {
    async role(campaignId, userId) {
      const key = `${campaignId}:${userId}`;
      const entry = cache.get(key);
      if (entry && entry.until > now()) return entry.role;
      cache.delete(key);

      let role: CampaignRole | null;
      try {
        const url = new URL(`/internal/campaigns/${encodeURIComponent(campaignId)}/rights`, o.url);
        url.searchParams.set('userId', userId);
        const res = await doFetch(url, {
          headers: { [INTERNAL_SECRET_HEADER]: o.secret, accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`campaign a répondu ${res.status}`);
        const r = Response.parse(await res.json());
        role = r.member ? r.role : null;
      } catch (error) {
        // Pas de mise en cache d'une panne : la prochaine requête réessaie
        o.onError?.(error);
        throw unavailable('campaign');
      }

      if (o.cacheMs > 0) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(key, { role, until: now() + o.cacheMs });
      }
      return role;
    },

    async details(campaignId, authorization) {
      if (!authorization) return null;
      try {
        const res = await doFetch(
          new URL(`/v1/campaigns/${encodeURIComponent(campaignId)}`, o.url),
          {
            headers: { authorization, accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );
        if (!res.ok) throw new Error(`campaign a répondu ${res.status}`);
        const d = Details.parse(await res.json());
        return { systemId: d.system.id, playedCharacterId: d.playedCharacterId };
      } catch (error) {
        // Comme l'ancienne app : sans personnage incarné lisible, pas de variables
        o.onError?.(error);
        return null;
      }
    },
  };
}
