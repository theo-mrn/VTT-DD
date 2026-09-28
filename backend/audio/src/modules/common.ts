/** Aides partagées par les routes : utilisateur, contexte d'événement, droits. */
import { HttpError } from '@vtt/platform';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CampaignRole } from '../clients/campaign.js';
import type { Deps } from '../deps.js';

export const Uuid = (message: string) => z.uuid(message).transform((s) => s.toLowerCase());
export const CampaignParams = z.object({ id: Uuid('Identifiant de campagne invalide') });

export const currentUser = (req: FastifyRequest) => req.user!.userId.toLowerCase();

export const eventContext = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const PROBLEM = 'application/problem+json';

/** Rôle de l'appelant ; non-membre (ou campagne inconnue) : 404 campaign_not_found. */
export async function memberRole(
  deps: Pick<Deps, 'campaigns'>,
  campaignId: string,
  userId: string,
): Promise<CampaignRole> {
  const role = await deps.campaigns.role(campaignId, userId);
  if (!role)
    throw new HttpError(404, 'Ressource introuvable', 'campaign_not_found', 'Campagne introuvable');
  return role;
}

/** MJ de la campagne, sinon 403 (404 si non-membre). */
export async function requireGm(
  deps: Pick<Deps, 'campaigns'>,
  campaignId: string,
  userId: string,
): Promise<CampaignRole> {
  const role = await memberRole(deps, campaignId, userId);
  if (role !== 'gm') throw HttpError.forbidden('Réservé au MJ de la campagne');
  return role;
}

/** Rôle de l'auteur d'un événement (enveloppe commune). */
export const actorOf = (userId: string, role: CampaignRole) => ({
  userId,
  role: role === 'gm' ? ('gm' as const) : ('player' as const),
  characterId: null,
});

/** Réponse problem+json avec des champs en plus (409 version_conflict { current }). */
export function sendProblem(
  reply: FastifyReply,
  status: number,
  title: string,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return reply
    .code(status)
    .type(PROBLEM)
    .send({ type: 'about:blank', title, status, code, ...extra });
}
