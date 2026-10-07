/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé) : seul le MJ installe un pack
 * dans sa campagne. Réponse gardée quelques secondes en mémoire ; une panne de campaign n'ouvre
 * aucun droit (503 campaign_unavailable), comme dans audio et character.
 */
import { INTERNAL_SECRET_HEADER } from '@vtt/platform';
import { z } from 'zod';
import { unavailable } from './errors.js';

export type CampaignRole = 'gm' | 'player' | 'spectator';

export interface CampaignRights {
  /** Rôle de `userId` dans `campaignId` ; `null` s'il n'en est pas membre (ou si elle n'existe pas). */
  role(campaignId: string, userId: string): Promise<CampaignRole | null>;
}

const Response = z.object({
  member: z.boolean(),
  role: z.enum(['gm', 'player', 'spectator']).nullable(),
});

const MAX_CACHE = 10_000;
const TIMEOUT_MS = 3_000;

/** Sans campaign configuré : aucune campagne accessible. */
export const noCampaigns: CampaignRights = {
  role: async () => {
    throw unavailable('campaign');
  },
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
  };
}
