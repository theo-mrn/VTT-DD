/**
 * Module « active » : salle active d'un joueur (docs/discord.md), suivie par ses jets Discord et
 * par l'activité. Choisie parmi les campagnes dont il est membre (joueur ou MJ) ; quitter la
 * campagne ou la supprimer l'efface (clé étrangère sur l'appartenance).
 *
 *   GET /v1/campaigns/active                  la salle active (résumé, rôle compris), 404 sinon
 *   PUT /v1/campaigns/active { campaignId }   la choisit, membre seulement (404 sinon)
 */
import { HttpError } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { activeCampaigns, campaignMembers, campaigns } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { headcounts, myCampaignSummaries } from '../campaigns/repository.js';
import { CampaignId, currentUser, MyCampaignSummary } from '../schemas.js';

const codePg = (err: unknown) =>
  ((err as { cause?: { code?: string } })?.cause ?? (err as { code?: string }))?.code;

const pasDeSalle = () => new HttpError(404, 'Ressource introuvable', 'no_active_campaign');

/** Résumé de la campagne pour ce joueur, s'il en est membre. */
async function resume(deps: Deps, req: FastifyRequest, campaignId: string) {
  const userId = currentUser(req);
  const headcount = headcounts(deps.db);
  const rows = await deps.db
    .select({
      campaign: campaigns,
      role: campaignMembers.role,
      memberCount: headcount.memberCount,
      playerCount: headcount.playerCount,
    })
    .from(campaignMembers)
    .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
    .innerJoin(headcount, eq(headcount.campaignId, campaigns.id))
    .where(and(eq(campaignMembers.userId, userId), eq(campaignMembers.campaignId, campaignId)));
  if (rows.length === 0) return null;
  const [summary] = await myCampaignSummaries(deps, rows, userId, req.headers.authorization);
  return summary ?? null;
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/campaigns/active',
    { ...auth, schema: { response: { 200: MyCampaignSummary } } },
    async (req) => {
      const [active] = await deps.db
        .select({ campaignId: activeCampaigns.campaignId })
        .from(activeCampaigns)
        .where(eq(activeCampaigns.userId, currentUser(req)));
      const summary = active ? await resume(deps, req, active.campaignId) : null;
      if (!summary) throw pasDeSalle();
      return summary;
    },
  );

  r.put(
    '/v1/campaigns/active',
    {
      ...auth,
      schema: {
        body: z.object({ campaignId: CampaignId }),
        response: { 200: MyCampaignSummary },
      },
    },
    async (req) => {
      const { campaignId } = req.body;
      const summary = await resume(deps, req, campaignId);
      // Pas membre : même réponse qu'une campagne inexistante
      if (!summary) throw HttpError.notFound('Campagne introuvable');
      try {
        await deps.db
          .insert(activeCampaigns)
          .values({ userId: currentUser(req), campaignId })
          .onConflictDoUpdate({
            target: activeCampaigns.userId,
            set: { campaignId, updatedAt: sql`now()` },
          });
      } catch (err) {
        // Sorti de la campagne entre la lecture et l'écriture
        if (codePg(err) === '23503') throw HttpError.notFound('Campagne introuvable');
        throw err;
      }
      return summary;
    },
  );
};
