/**
 * Module « invitations » : liens d'invitation d'une campagne et adhésion.
 *
 *   POST /v1/campaigns/:id/invitations   { expiresIn?, maxUses? } → { code, url, expiresAt, maxUses } (MJ)
 *        événement campaign.invitation_created (gm_only, sans le code)
 *   POST /v1/campaigns/join              { code } → la campagne ; l'appelant devient joueur
 *
 * `code` est un code d'invitation (« inv_… ») ou le code court de la
 * campagne, publique ou privée. Refus : 404 `campaign_not_found`, 403 `banned`,
 * 410 invitation périmée. Pas de limite de joueurs.
 *
 * `expiresIn` est en secondes (7 jours par défaut, 30 jours au plus) ;
 * `maxUses` est le nombre d'adhésions permises (10 par défaut, 100 au plus).
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignBans, campaignInvitations, campaignMembers, campaigns } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { CAMPAIGN_CODE_FORMAT, normalizeCampaignCode } from '../campaigns/code.js';
import { campaignDetail, campaignEvent, gmAccess } from '../campaigns/repository.js';
import { CampaignId, CampaignResponse, currentUser, eventContext } from '../schemas.js';
import { hashCode, INVITATION_CODE_FORMAT, newInvitationCode } from './codes.js';

const DAY = 24 * 3600;
export const DEFAULT_EXPIRY = 7 * DAY;
export const DEFAULT_MAX_USES = 10;

const expired = (detail: string, code: string) =>
  new HttpError(410, 'Invitation périmée', code, detail);

const notFound = () =>
  new HttpError(
    404,
    'Ressource introuvable',
    'campaign_not_found',
    'Aucune campagne ni invitation ne correspond à ce code',
  );

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/campaigns/:id/invitations',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        body: z
          .object({
            expiresIn: z
              .number()
              .int()
              .min(60)
              .max(30 * DAY)
              .optional(),
            maxUses: z.number().int().min(1).max(100).optional(),
          })
          .default({}),
        response: {
          201: z.object({
            code: z.string(),
            url: z.string(),
            expiresAt: z.string(),
            maxUses: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const code = newInvitationCode();
      const expiresAt = new Date(
        deps.now().getTime() + (req.body.expiresIn ?? DEFAULT_EXPIRY) * 1000,
      );
      const maxUses = req.body.maxUses ?? DEFAULT_MAX_USES;
      await db.transaction(async (tx) => {
        const a = await gmAccess(tx, req.params.id, userId);
        const id = uuidv7();
        await tx.insert(campaignInvitations).values({
          id,
          campaignId: a.campaign.id,
          codeHash: hashCode(code),
          createdBy: userId,
          expiresAt,
          maxUses,
        });
        // Réservé au MJ, et sans le code : qui le lirait pourrait rejoindre la campagne
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.invitation_created',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: { invitationId: id, expiresAt: expiresAt.toISOString() },
          visibility: 'gm_only',
        });
      });
      // Le code n'est renvoyé qu'ici, jamais journalisé ni stocké en clair
      reply.code(201).header('cache-control', 'no-store');
      return {
        code,
        url: new URL(`/join/${code}`, deps.config.APP_URL).toString(),
        expiresAt: expiresAt.toISOString(),
        maxUses,
      };
    },
  );

  r.post(
    '/v1/campaigns/join',
    {
      ...auth,
      // Limite par IP : les codes de campagne sont courts, on ne les laisse pas deviner en boucle
      config: {
        rateLimit: { max: deps.config.RATE_LIMIT_JOIN_MAX, timeWindow: '1 minute' },
      } as FastifyContextConfig,
      schema: {
        body: z.object({ code: z.string().trim().min(1).max(200) }),
        response: { 200: CampaignResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const code = req.body.code;
      const byInvitation = INVITATION_CODE_FORMAT.test(code);
      const campaignCode = normalizeCampaignCode(code);
      if (!byInvitation && !CAMPAIGN_CODE_FORMAT.test(campaignCode)) throw notFound();

      const joined = await db.transaction(async (tx) => {
        let invitation: typeof campaignInvitations.$inferSelect | undefined;
        let campaignId: string | undefined;
        if (byInvitation) {
          [invitation] = await tx
            .select()
            .from(campaignInvitations)
            .where(eq(campaignInvitations.codeHash, hashCode(code)));
          campaignId = invitation?.campaignId;
        } else {
          [{ id: campaignId } = { id: undefined }] = await tx
            .select({ id: campaigns.id })
            .from(campaigns)
            .where(eq(campaigns.code, campaignCode));
        }
        if (!campaignId) throw notFound();

        // Campagne verrouillée (toujours avant l'invitation, comme les autres routes) : deux
        // adhésions simultanées ne dépassent pas les utilisations de l'invitation
        const [campaign] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .for('update');
        if (!campaign) throw notFound();
        if (invitation) {
          [invitation] = await tx
            .select()
            .from(campaignInvitations)
            .where(eq(campaignInvitations.id, invitation.id))
            .for('update');
          if (!invitation) throw notFound();
        }
        const [already] = await tx
          .select()
          .from(campaignMembers)
          .where(
            and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)),
          );
        // Déjà membre : rien à consommer, on renvoie la campagne
        if (already) return { campaign, role: already.role };

        const [banned] = await tx
          .select()
          .from(campaignBans)
          .where(and(eq(campaignBans.campaignId, campaignId), eq(campaignBans.userId, userId)));
        if (banned)
          throw new HttpError(
            403,
            'Accès refusé',
            'banned',
            'Vous avez été banni de cette campagne',
          );

        if (invitation) {
          if (invitation.expiresAt.getTime() <= deps.now().getTime())
            throw expired('Cette invitation a expiré', 'invitation_expired');
          if (invitation.uses >= invitation.maxUses)
            throw expired(
              'Cette invitation a atteint son nombre d’utilisations',
              'invitation_exhausted',
            );
        }
        if (invitation)
          await tx
            .update(campaignInvitations)
            .set({ uses: sql`${campaignInvitations.uses} + 1` })
            .where(eq(campaignInvitations.id, invitation.id));
        await tx.insert(campaignMembers).values({ campaignId, userId, role: 'player' });
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.member_joined',
          campaignId,
          userId,
          role: 'player',
          payload: {
            userId,
            role: 'player',
            ...(invitation ? { invitationId: invitation.id } : { byCampaignCode: true }),
          },
        });
        return { campaign, role: 'player' as const };
      });
      return campaignDetail(deps, joined, req);
    },
  );
};
