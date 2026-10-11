/**
 * Rôle d'un utilisateur dans une campagne, demandé au service campaign
 * (GET /internal/campaigns/:id/rights?userId=, secret partagé) : seul le MJ installe un pack
 * dans sa campagne. Réponse gardée quelques secondes en mémoire ; une panne de campaign n'ouvre
 * aucun droit (503 campaign_unavailable), comme dans audio et character.
 */
import { campaignRoleLookup, type CampaignRightsOptions, type CampaignRole } from '@vtt/platform';
import { unavailable } from './errors.js';

export type { CampaignRole };

export interface CampaignRights {
  /** Rôle de `userId` dans `campaignId` ; `null` s'il n'en est pas membre (ou si elle n'existe pas). */
  role(campaignId: string, userId: string): Promise<CampaignRole | null>;
}

const MAX_CACHE = 10_000;
/** Sans campaign configuré : aucune campagne accessible. */
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
