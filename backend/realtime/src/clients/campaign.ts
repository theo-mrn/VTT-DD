/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé) avant tout
 * abonnement. La réponse est gardée dans le cache du service (Redis, partagé
 * entre les réplicas) quelques secondes, et oubliée dès qu'un événement de
 * campaign change les membres. Une panne de campaign n'ouvre aucun droit.
 */
import type { Cache } from '@vtt/platform';
import { z } from 'zod';
import type { CampaignRole } from '../routing.js';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

export class CampaignUnavailable extends Error {
  constructor() {
    super('Le service campaign ne répond pas');
  }
}

export interface CampaignRights {
  /** Rôle de `userId` dans `campaignId` ; null s'il n'en est pas membre (ou si elle n'existe pas). */
  role(campaignId: string, userId: string): Promise<CampaignRole | null>;
  /** Oublie le rôle mis en cache (changement de membres). */
  forget(campaignId: string, userId: string): Promise<void>;
}

const Response = z.object({
  member: z.boolean(),
  role: z.enum(['gm', 'player', 'spectator']).nullable(),
});

const TIMEOUT_MS = 3_000;

/** Sans campaign configuré : aucun abonnement possible. */
export const noCampaigns: CampaignRights = {
  role: async () => {
    throw new CampaignUnavailable();
  },
  forget: async () => undefined,
};

export function campaignRights(o: {
  url: string;
  secret: string;
  cache: Cache;
  ttlSeconds: number;
  fetch?: typeof globalThis.fetch;
  onError?: (error: unknown) => void;
}): CampaignRights {
  const doFetch = o.fetch ?? globalThis.fetch;
  const key = (campaignId: string, userId: string) => `rights:${campaignId}:${userId}`;

  async function load(campaignId: string, userId: string): Promise<CampaignRole | null> {
    try {
      const url = new URL(`/internal/campaigns/${encodeURIComponent(campaignId)}/rights`, o.url);
      url.searchParams.set('userId', userId);
      const res = await doFetch(url, {
        headers: { [INTERNAL_SECRET_HEADER]: o.secret, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`campaign a répondu ${res.status}`);
      const r = Response.parse(await res.json());
      return r.member ? r.role : null;
    } catch (error) {
      // Pas de mise en cache d'une panne : le prochain abonnement réessaie
      o.onError?.(error);
      throw new CampaignUnavailable();
    }
  }

  return {
    role(campaignId, userId) {
      if (o.ttlSeconds <= 0) return load(campaignId, userId);
      return o.cache.getOrSet(key(campaignId, userId), () => load(campaignId, userId), {
        ttlSeconds: o.ttlSeconds,
      });
    },
    forget: (campaignId, userId) => o.cache.del(key(campaignId, userId)),
  };
}
