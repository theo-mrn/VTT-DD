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
import {
  CAMPAIGN_TIMEOUT_MS,
  campaignRoleLookup,
  unavailable,
  type CampaignRightsOptions,
  type CampaignRole,
} from '@vtt/platform';
import { z } from 'zod';

export { unavailable, type CampaignRole };

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

/** Sans campaign configuré : aucun jet de campagne possible. */
export const noCampaigns: CampaignRights = {
  role: async () => {
    throw unavailable('campaign');
  },
  details: async () => null,
};

export function campaignRights(o: CampaignRightsOptions): CampaignRights {
  const doFetch = o.fetch ?? globalThis.fetch;

  return {
    role: campaignRoleLookup(o),

    async details(campaignId, authorization) {
      if (!authorization) return null;
      try {
        const res = await doFetch(
          new URL(`/v1/campaigns/${encodeURIComponent(campaignId)}`, o.url),
          {
            headers: { authorization, accept: 'application/json' },
            signal: AbortSignal.timeout(CAMPAIGN_TIMEOUT_MS),
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
