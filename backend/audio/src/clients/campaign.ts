/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé) : il décide
 * qui gère la bibliothèque et pilote les canaux (le MJ) et qui écoute.
 *
 * La réponse est gardée quelques secondes en mémoire. Une panne de campaign
 * n'ouvre aucun droit : la requête échoue (503), comme dans dice.
 */
import type { ReserveStorage } from '@vtt/contracts';
import {
  CAMPAIGN_TIMEOUT_MS,
  campaignRoleLookup,
  HttpError,
  unavailable,
  type CampaignRightsOptions,
  type CampaignRole,
} from '@vtt/platform';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

export { unavailable, type CampaignRole };

export interface CampaignRights {
  /** Rôle de `userId` dans `campaignId` ; `null` s'il n'en est pas membre (ou si elle n'existe pas). */
  role(campaignId: string, userId: string): Promise<CampaignRole | null>;
  /**
   * Réserve la place d'un envoi sur le quota de la campagne (docs/stockage.md) ; lève l'erreur
   * de campaign s'il n'y en a plus (422 `storage_quota_exceeded`). campaign injoignable : l'envoi
   * passe, le prochain inventaire le comptera.
   */
  reserve?(r: ReserveStorage): Promise<void>;
}

/** Sans campaign configuré : aucun accès aux campagnes. */
export const noCampaigns: CampaignRights = {
  role: async () => {
    throw unavailable('campaign');
  },
};

export function campaignRights(o: CampaignRightsOptions): CampaignRights {
  const doFetch = o.fetch ?? globalThis.fetch;

  return {
    async reserve(r) {
      let res: globalThis.Response;
      try {
        res = await doFetch(new URL('/internal/storage/reserve', o.url), {
          method: 'POST',
          headers: { [INTERNAL_SECRET_HEADER]: o.secret, 'content-type': 'application/json' },
          body: JSON.stringify(r),
          signal: AbortSignal.timeout(CAMPAIGN_TIMEOUT_MS),
        });
      } catch (error) {
        o.onError?.(error);
        return;
      }
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
      if (res.status === 422 && body.code)
        throw new HttpError(422, 'Espace de la campagne plein', body.code, body.detail);
      o.onError?.(new Error(`campaign a répondu ${res.status} à la réservation`));
    },

    role: campaignRoleLookup(o),
  };
}
