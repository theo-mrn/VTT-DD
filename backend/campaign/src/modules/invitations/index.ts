/**
 * Module « invitations » : liens d'invitation, invitations nominatives et adhésion.
 *
 *   POST   /v1/campaigns/:id/invitations         { expiresIn?, maxUses? } → { code, url, expiresAt, maxUses } (MJ)
 *          événement campaign.invitation_created (gm_only, sans le code)
 *   POST   /v1/campaigns/join                    { code } → la campagne ; l'appelant devient joueur
 *   POST   /v1/campaigns/:id/join                rejoindre une campagne publique, ou une campagne
 *                                                où l'on est invité nominativement
 *   POST   /v1/campaigns/:id/invitees            { userIds } : inviter des utilisateurs (MJ)
 *   DELETE /v1/campaigns/:id/invitees/:userId    annuler (MJ) ou décliner (l'invité)
 *   GET    /v1/campaigns/invited                 campagnes où l'appelant est invité
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
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  campaignBans,
  campaignInvitations,
  campaignInvitees,
  campaignMembers,
  campaigns,
} from '../../db/schema.js';
import type { Tx } from '../../db/outbox.js';
import type { Module } from '../../deps.js';
import { CAMPAIGN_CODE_FORMAT, normalizeCampaignCode } from '../campaigns/code.js';
import {
  campaignDetail,
  campaignEvent,
  campaignNotFound,
  campaignSummaries,
  clearInvitation,
  gmAccess,
  headcounts,
  lockCampaign,
  userApi,
} from '../campaigns/repository.js';
import {
  CampaignId,
  CampaignResponse,
  currentUser,
  eventContext,
  InvitedCampaign,
  UserId,
} from '../schemas.js';
import { hashCode, INVITATION_CODE_FORMAT, newInvitationCode } from './codes.js';

const DAY = 24 * 3600;
export const DEFAULT_EXPIRY = 7 * DAY;
export const DEFAULT_MAX_USES = 10;
/** Invitations nominatives en attente par campagne, au plus. */
export const MAX_INVITEES = 50;

const expired = (detail: string, code: string) =>
  new HttpError(410, 'Invitation périmée', code, detail);

const banned = () =>
  new HttpError(403, 'Accès refusé', 'banned', 'Vous avez été banni de cette campagne');

const notFound = () =>
  new HttpError(
    404,
    'Ressource introuvable',
    'campaign_not_found',
    'Aucune campagne ni invitation ne correspond à ce code',
  );

type InvitationRow = typeof campaignInvitations.$inferSelect;

/** Ce que désigne un code : une invitation (et sa campagne), ou une campagne par son code. */
async function joinTarget(
  tx: Tx,
  code: string,
  campaignCode: string,
  byInvitation: boolean,
): Promise<{ invitation?: InvitationRow; campaignId?: string }> {
  if (byInvitation) {
    const [invitation] = await tx
      .select()
      .from(campaignInvitations)
      .where(eq(campaignInvitations.codeHash, hashCode(code)));
    return { invitation, campaignId: invitation?.campaignId };
  }
  const [{ id: campaignId } = { id: undefined }] = await tx
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.code, campaignCode));
  return { campaignId };
}

/** Invitation encore valable : ni expirée, ni épuisée. */
function checkInvitation(invitation: InvitationRow, now: Date): void {
  if (invitation.expiresAt.getTime() <= now.getTime())
    throw expired('Cette invitation a expiré', 'invitation_expired');
  if (invitation.uses >= invitation.maxUses)
    throw expired('Cette invitation a atteint son nombre d’utilisations', 'invitation_exhausted');
}

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
        const target = await joinTarget(tx, code, campaignCode, byInvitation);
        let invitation = target.invitation;
        const campaignId = target.campaignId;
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

        const [isBanned] = await tx
          .select()
          .from(campaignBans)
          .where(and(eq(campaignBans.campaignId, campaignId), eq(campaignBans.userId, userId)));
        if (isBanned) throw banned();

        if (invitation) checkInvitation(invitation, deps.now());
        if (invitation)
          await tx
            .update(campaignInvitations)
            .set({ uses: sql`${campaignInvitations.uses} + 1` })
            .where(eq(campaignInvitations.id, invitation.id));
        await tx.insert(campaignMembers).values({ campaignId, userId, role: 'player' });
        await clearInvitation(tx, campaignId, userId);
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

  // ─── Rejoindre sans code : campagne publique ou invitation nominative ──────

  r.post(
    '/v1/campaigns/:id/join',
    {
      ...auth,
      schema: { params: z.object({ id: CampaignId }), response: { 200: CampaignResponse } },
    },
    async (req) => {
      const userId = currentUser(req);
      const joined = await db.transaction(async (tx) => {
        const [campaign] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, req.params.id))
          .for('update');
        if (!campaign) throw campaignNotFound();
        const [already] = await tx
          .select()
          .from(campaignMembers)
          .where(
            and(eq(campaignMembers.campaignId, campaign.id), eq(campaignMembers.userId, userId)),
          );
        if (already) return { campaign, role: already.role };
        const [invited] = await tx
          .select()
          .from(campaignInvitees)
          .where(
            and(eq(campaignInvitees.campaignId, campaign.id), eq(campaignInvitees.userId, userId)),
          );
        // Campagne privée sans invitation : son existence n'est pas révélée
        if (!campaign.isPublic && !invited) throw campaignNotFound();
        const [isBanned] = await tx
          .select()
          .from(campaignBans)
          .where(and(eq(campaignBans.campaignId, campaign.id), eq(campaignBans.userId, userId)));
        if (isBanned) throw banned();

        await tx
          .insert(campaignMembers)
          .values({ campaignId: campaign.id, userId, role: 'player' });
        await clearInvitation(tx, campaign.id, userId);
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.member_joined',
          campaignId: campaign.id,
          userId,
          role: 'player',
          payload: {
            userId,
            role: 'player',
            ...(invited ? { byInvitee: true } : { publicCampaign: true }),
          },
        });
        return { campaign, role: 'player' as const };
      });
      return campaignDetail(deps, joined, req);
    },
  );

  // ─── Invitations nominatives ───────────────────────────────────────────────

  r.post(
    '/v1/campaigns/:id/invitees',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        body: z.object({
          userIds: z
            .array(UserId)
            .min(1)
            .max(20)
            .transform((ids) => [...new Set(ids)]),
        }),
        response: { 200: CampaignResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const a = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const ids = req.body.userIds;
        const [members, bans, pending] = await Promise.all([
          tx
            .select({ userId: campaignMembers.userId })
            .from(campaignMembers)
            .where(
              and(
                eq(campaignMembers.campaignId, a.campaign.id),
                inArray(campaignMembers.userId, ids),
              ),
            ),
          tx
            .select({ userId: campaignBans.userId })
            .from(campaignBans)
            .where(
              and(eq(campaignBans.campaignId, a.campaign.id), inArray(campaignBans.userId, ids)),
            ),
          tx
            .select({ userId: campaignInvitees.userId })
            .from(campaignInvitees)
            .where(eq(campaignInvitees.campaignId, a.campaign.id)),
        ]);
        if (bans.length)
          throw HttpError.conflict(
            'Un utilisateur banni ne peut pas être invité : levez d’abord son bannissement',
            'user_banned',
          );
        // Déjà membre ou déjà invité : rien à faire pour lui
        const skip = new Set([...members, ...pending].map((m) => m.userId));
        const fresh = ids.filter((id) => !skip.has(id));
        if (pending.length + fresh.length > MAX_INVITEES)
          throw HttpError.conflict(
            `${MAX_INVITEES} invitations en attente au plus`,
            'too_many_invitees',
          );
        for (const invitee of fresh) {
          await tx
            .insert(campaignInvitees)
            .values({ campaignId: a.campaign.id, userId: invitee, invitedBy: userId });
          await campaignEvent(tx, eventContext(req), {
            type: 'campaign.member_invited',
            campaignId: a.campaign.id,
            userId,
            role: a.role,
            payload: { userId: invitee },
            visibility: 'gm_only',
          });
        }
        return a;
      });
      return campaignDetail(deps, a, req);
    },
  );

  r.delete(
    '/v1/campaigns/:id/invitees/:userId',
    { ...auth, schema: { params: z.object({ id: CampaignId, userId: UserId }) } },
    async (req, reply) => {
      const me = currentUser(req);
      const target = req.params.userId;
      await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        // L'invité décline sans être membre ; sinon, seul le MJ annule
        const role = target === me ? null : (await gmAccess(tx, req.params.id, me)).role;
        const [removed] = await tx
          .delete(campaignInvitees)
          .where(
            and(
              eq(campaignInvitees.campaignId, req.params.id),
              eq(campaignInvitees.userId, target),
            ),
          )
          .returning();
        if (!removed) {
          if (target === me) throw campaignNotFound();
          throw HttpError.notFound('Cet utilisateur n’est pas invité');
        }
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.invitee_removed',
          campaignId: removed.campaignId,
          userId: me,
          role,
          payload: { userId: target, declined: target === me },
          visibility: 'gm_only',
        });
      });
      reply.code(204);
    },
  );

  r.get(
    '/v1/campaigns/invited',
    { ...auth, schema: { response: { 200: z.array(InvitedCampaign) } } },
    async (req) => {
      const userId = currentUser(req);
      const headcount = headcounts(db);
      const rows = await db
        .select({
          campaign: campaigns,
          invitedBy: campaignInvitees.invitedBy,
          invitedAt: campaignInvitees.invitedAt,
          memberCount: headcount.memberCount,
          playerCount: headcount.playerCount,
        })
        .from(campaignInvitees)
        .innerJoin(campaigns, eq(campaigns.id, campaignInvitees.campaignId))
        .innerJoin(headcount, eq(headcount.campaignId, campaigns.id))
        .where(eq(campaignInvitees.userId, userId))
        .orderBy(desc(campaignInvitees.invitedAt), asc(campaigns.id));
      const [summaries, profiles] = await Promise.all([
        campaignSummaries(
          deps,
          rows.map((r) => ({ ...r, role: null })),
          req.headers.authorization,
        ),
        deps.profiles.profiles(
          [...new Set(rows.map((r) => r.invitedBy))],
          req.headers.authorization,
        ),
      ]);
      return summaries.map((s, i) => ({
        ...s,
        invitedBy: userApi(rows[i]!.invitedBy, profiles),
        invitedAt: rows[i]!.invitedAt.toISOString(),
      }));
    },
  );
};
