/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé) : il décide
 * qui lit l'historique d'une campagne (les membres), ce qu'il en voit (le MJ
 * voit tout) et qui vérifie la chaîne de hash (le MJ).
 *
 * La réponse est gardée quelques secondes en mémoire. Une panne de campaign
 * n'ouvre aucun droit : la requête échoue (503).
 */
import {
  campaignRoleLookup,
  unavailable,
  type CampaignRightsOptions,
  type CampaignRole,
} from '@vtt/platform';

export { unavailable, type CampaignRole };

export interface CampaignRights {
  /** Rôle de `userId` dans `campaignId` ; `null` s'il n'en est pas membre (ou si elle n'existe pas). */
  role(campaignId: string, userId: string): Promise<CampaignRole | null>;
}

/** Sans campaign configuré : aucun historique lisible. */
export const noCampaigns: CampaignRights = {
  role: async () => {
    throw unavailable('campaign');
  },
};

export function campaignRights(o: CampaignRightsOptions): CampaignRights {
  return {
    role: campaignRoleLookup(o),
  };
}
