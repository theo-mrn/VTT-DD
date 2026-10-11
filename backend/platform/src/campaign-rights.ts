/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé), pour les services qui en
 * décident leurs droits (voice, history, marketplace, dice, audio). Chacun garde son interface
 * et ses appels propres ; la recherche du rôle et son cache sont ici, une seule fois.
 *
 * La réponse est gardée `cacheMs` en mémoire. Une panne de campaign n'ouvre aucun droit : la
 * requête échoue (503) et rien n'est mis en cache.
 */
import { z } from 'zod';
import { HttpError } from './middleware/error-handler.js';
import { INTERNAL_SECRET_HEADER } from './internal-secret.js';

export type CampaignRole = 'gm' | 'player' | 'spectator';

export interface CampaignRightsOptions {
  url: string;
  secret: string;
  cacheMs: number;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  onError?: (error: unknown) => void;
}

const Rights = z.object({
  member: z.boolean(),
  role: z.enum(['gm', 'player', 'spectator']).nullable(),
});

/** Borne du cache : au-delà, les entrées les plus anciennes sont évincées. */
const MAX_CACHE = 10_000;
/** Délai d'un appel interne à campaign. */
export const CAMPAIGN_TIMEOUT_MS = 3_000;

/** Service interne injoignable : 503 `<service>_unavailable`. */
export function unavailable(service: string): HttpError {
  return new HttpError(
    503,
    'Service indisponible',
    `${service}_unavailable`,
    `Le service ${service} ne répond pas`,
  );
}

/**
 * Rôle de `userId` dans `campaignId` ; `null` s'il n'en est pas membre (ou si elle n'existe
 * pas). Lève 503 si campaign ne répond pas.
 */
export function campaignRoleLookup(
  o: CampaignRightsOptions,
): (campaignId: string, userId: string) => Promise<CampaignRole | null> {
  const doFetch = o.fetch ?? globalThis.fetch;
  const now = o.now ?? Date.now;
  const cache = new Map<string, { role: CampaignRole | null; until: number }>();

  return async (campaignId, userId) => {
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
        signal: AbortSignal.timeout(CAMPAIGN_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`campaign a répondu ${res.status}`);
      const r = Rights.parse(await res.json());
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
  };
}
