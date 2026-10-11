/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé) : il décide qui rejoint la
 * salle vocale (les membres) et qui y parle (MJ et joueurs ; un spectateur écoute).
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

/** Sans campaign configuré : aucune salle vocale (503). */
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
