/**
 * Module « campaigns » : campagnes, membres et rôles (contrat :
 * docs/api-campaign.md). Toutes les routes demandent un jeton d'accès.
 *
 *   GET    /v1/campaigns?role=                   mes campagnes (aperçu des membres, prochaine
 *                                                 session, personnages engagés et incarné)
 *   GET    /v1/campaigns/public                  campagnes publiques (recherche, pages)
 *   POST   /v1/campaigns                         créer (le créateur est MJ propriétaire, code généré)
 *   GET    /v1/campaigns/:id                     détail (membres)
 *   PATCH  /v1/campaigns/:id                     modifier (MJ)
 *   POST   /v1/campaigns/:id/code                nouveau code (MJ) : l'ancien ne vaut plus
 *   DELETE /v1/campaigns/:id                     supprimer (MJ propriétaire)
 *   POST   /v1/campaigns/:id/image               URL d'envoi de l'image (MJ ; rien d'écrit, l'image
 *                                                 est enregistrée par PATCH → campaign.updated)
 *   PATCH  /v1/campaigns/:id/members/:userId     changer un rôle (MJ)
 *   DELETE /v1/campaigns/:id/members/:userId     exclure, ?ban=true (MJ) ou quitter (soi-même)
 *   GET    /v1/campaigns/:id/bans                bannissements (MJ)
 *   DELETE /v1/campaigns/:id/bans/:userId        lever un bannissement (MJ)
 */
import {
  changesPayload,
  FileUploadRequest,
  FileUploadTicket,
  uuidv7,
  type UploadUsageId,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignBans, campaignCharacters, campaignMembers, campaigns } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { isAcceptedImageUrl, publicBase } from '../../storage/images.js';
import { removeFromCombat } from '../combat/repository.js';
import { campaignReader, requireWriter } from '../notes/common.js';
import { reserveFor } from '../storage/index.js';
import {
  Accent,
  CampaignId,
  CampaignResponse,
  CampaignSummary,
  currentUser,
  Description,
  eventContext,
  MyCampaignSummary,
  Name,
  Pitch,
  Role,
  SystemId,
  Tags,
  UserId,
} from '../schemas.js';
import { newCampaignCode, normalizeCampaignCode } from './code.js';
import {
  access,
  campaignDetail,
  campaignEvent,
  campaignSummaries,
  gmAccess,
  headcounts,
  lockCampaign,
  myCampaignSummaries,
  userApi,
} from './repository.js';

const Params = z.object({ id: CampaignId });
const MemberParams = z.object({ id: CampaignId, userId: UserId });

/** Campagnes publiques par page. */
export const PER_PAGE = 20;

/** Tentatives de génération d'un code libre (collision très improbable). */
const CODE_ATTEMPTS = 5;

/** Limite par IP des demandes d'URL d'envoi, comme les avatars. */
const UPLOAD_LIMIT = {
  rateLimit: { max: 20, timeWindow: '1 minute' },
} as FastifyContextConfig;

/** Champs modifiables par PATCH /v1/campaigns/:id, comparés pour `changes` de campaign.updated. */
const editable = (c: typeof campaigns.$inferSelect) => ({
  name: c.name,
  description: c.description,
  systemId: c.systemId,
  systemVersion: c.systemVersion,
  imageUrl: c.imageUrl,
  isPublic: c.isPublic,
  characterCreation: c.characterCreation,
  pitch: c.pitch,
  accent: c.accent,
  tags: c.tags,
});

const invalidImage = () =>
  HttpError.badRequest(
    'L’image doit venir de la bibliothèque, ou avoir été envoyée par POST /v1/campaigns/:id/image',
    'invalid_image',
  );

/** Échappe les jokers de LIKE (%, _ et le caractère d'échappement \). */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Usages signés par la route commune de campaign. */
const CAMPAIGN_UPLOAD_USAGES: readonly UploadUsageId[] = [
  'campaign-image',
  'note-image',
  'map-background',
  'map-object',
  'npc-image',
];

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalog } = deps;
  const auth = { preValidation: app.authenticate };
  const base = publicBase(deps.config.S3_PUBLIC_URL);
  const presets = deps.config.PRESET_IMAGES_URL;

  const knownSystem = (id: string) => {
    const s = catalog.system(id);
    if (!s) throw HttpError.badRequest(`Système inconnu : ${id}`, 'unknown_system');
    return s;
  };

  r.get(
    '/v1/campaigns',
    {
      ...auth,
      schema: {
        querystring: z.object({ role: Role.optional() }),
        response: { 200: z.array(MyCampaignSummary) },
      },
    },
    async (req) => {
      const headcount = headcounts(db);
      const rows = await db
        .select({
          campaign: campaigns,
          role: campaignMembers.role,
          memberCount: headcount.memberCount,
          playerCount: headcount.playerCount,
        })
        .from(campaignMembers)
        .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
        .innerJoin(headcount, eq(headcount.campaignId, campaigns.id))
        .where(
          and(
            eq(campaignMembers.userId, currentUser(req)),
            req.query.role ? eq(campaignMembers.role, req.query.role) : undefined,
          ),
        )
        .orderBy(desc(campaigns.updatedAt), desc(campaigns.id));
      return myCampaignSummaries(deps, rows, currentUser(req), req.headers.authorization);
    },
  );

  r.get(
    '/v1/campaigns/public',
    {
      ...auth,
      schema: {
        querystring: z.object({
          search: z.string().trim().max(100).optional(),
          page: z.coerce.number().int().min(1).max(1000).default(1),
        }),
        response: {
          200: z.object({
            campaigns: z.array(CampaignSummary),
            page: z.number().int(),
            perPage: z.number().int(),
            total: z.number().int(),
          }),
        },
      },
    },
    async (req) => {
      const { search, page } = req.query;
      const pattern = search ? `%${escapeLike(search)}%` : null;
      const filter = and(
        eq(campaigns.isPublic, true),
        pattern
          ? or(
              ilike(campaigns.name, pattern),
              ilike(campaigns.description, pattern),
              eq(campaigns.code, normalizeCampaignCode(search!)),
            )
          : undefined,
      );
      const headcount = headcounts(db);
      const myMembership = db
        .select({ campaignId: campaignMembers.campaignId, role: campaignMembers.role })
        .from(campaignMembers)
        .where(eq(campaignMembers.userId, currentUser(req)))
        .as('me');
      const [rows, [total]] = await Promise.all([
        db
          .select({
            campaign: campaigns,
            role: myMembership.role,
            memberCount: headcount.memberCount,
            playerCount: headcount.playerCount,
          })
          .from(campaigns)
          .innerJoin(headcount, eq(headcount.campaignId, campaigns.id))
          .leftJoin(myMembership, eq(myMembership.campaignId, campaigns.id))
          .where(filter)
          .orderBy(desc(campaigns.updatedAt), desc(campaigns.id))
          .limit(PER_PAGE)
          .offset((page - 1) * PER_PAGE),
        db.select({ n: count() }).from(campaigns).where(filter),
      ]);
      return {
        campaigns: await campaignSummaries(deps, rows, req.headers.authorization),
        page,
        perPage: PER_PAGE,
        total: total!.n,
      };
    },
  );

  r.post(
    '/v1/campaigns',
    {
      ...auth,
      schema: {
        body: z.object({
          name: Name,
          systemId: SystemId,
          description: Description.optional(),
          isPublic: z.boolean().optional(),
          characterCreation: z.boolean().optional(),
          pitch: Pitch.optional(),
          accent: Accent.optional(),
          tags: Tags.optional(),
          // À la création, seule une image de la bibliothèque (l'envoi demande la campagne)
          imageUrl: z.string().max(2048).nullable().optional(),
        }),
        response: { 201: CampaignResponse },
      },
    },
    async (req, reply) => {
      const system = knownSystem(req.body.systemId);
      const userId = currentUser(req);
      const id = uuidv7();
      const imageUrl = req.body.imageUrl ?? null;
      if (!isAcceptedImageUrl(imageUrl, null, null, id, presets)) throw invalidImage();
      const campaign = await db.transaction(async (tx) => {
        let created: typeof campaigns.$inferSelect | undefined;
        // Code déjà pris : on en tire un autre (sans interrompre la transaction)
        for (let attempt = 0; !created && attempt < CODE_ATTEMPTS; attempt++) {
          [created] = await tx
            .insert(campaigns)
            .values({
              id,
              name: req.body.name,
              description: req.body.description ?? '',
              systemId: system.id,
              systemVersion: system.version,
              ownerId: userId,
              code: newCampaignCode(),
              isPublic: req.body.isPublic ?? false,
              characterCreation: req.body.characterCreation ?? true,
              pitch: req.body.pitch ?? '',
              accent: req.body.accent ?? 'gold',
              tags: req.body.tags ?? [],
              imageUrl,
            })
            .onConflictDoNothing({ target: campaigns.code })
            .returning();
        }
        if (!created) throw new Error('Aucun code de campagne libre après plusieurs essais');
        await tx.insert(campaignMembers).values({ campaignId: id, userId, role: 'gm' });
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.created',
          campaignId: id,
          userId,
          role: 'gm',
          payload: {
            name: created.name,
            code: created.code,
            isPublic: created.isPublic,
            system: { id: system.id, version: system.version },
            pitch: created.pitch,
            accent: created.accent,
            tags: created.tags,
            imageUrl: created.imageUrl,
          },
        });
        return created;
      });
      reply.code(201);
      return campaignDetail(deps, { campaign, role: 'gm' }, req);
    },
  );

  r.get(
    '/v1/campaigns/:id',
    { ...auth, schema: { params: Params, response: { 200: CampaignResponse } } },
    async (req) => campaignDetail(deps, await access(db, req.params.id, currentUser(req)), req),
  );

  r.patch(
    '/v1/campaigns/:id',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          name: Name.optional(),
          description: Description.optional(),
          systemId: SystemId.optional(),
          isPublic: z.boolean().optional(),
          characterCreation: z.boolean().optional(),
          pitch: Pitch.optional(),
          accent: Accent.optional(),
          tags: Tags.optional(),
          // Vérifiée ensuite : bibliothèque, ou dossier de la campagne sur le stockage
          imageUrl: z.string().max(2048).nullable().optional(),
        }),
        response: { 200: CampaignResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { name, description, systemId, imageUrl, isPublic, characterCreation } = req.body;
      const { pitch, accent, tags } = req.body;
      const campaign = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        if (
          imageUrl !== undefined &&
          !isAcceptedImageUrl(imageUrl, a.campaign.imageUrl, base, a.campaign.id, presets)
        )
          throw invalidImage();
        const system = systemId ? knownSystem(systemId) : undefined;
        if (system && system.id !== a.campaign.systemId) {
          // Les personnages engagés sont tous du système de la campagne
          const [engaged] = await tx
            .select({ n: count() })
            .from(campaignCharacters)
            .where(eq(campaignCharacters.campaignId, a.campaign.id));
          if (engaged!.n > 0)
            throw HttpError.conflict(
              'Retirez d’abord les personnages engagés pour changer de système',
              'characters_engaged',
            );
        }
        const fields = {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(system ? { systemId: system.id, systemVersion: system.version } : {}),
          ...(imageUrl !== undefined ? { imageUrl } : {}),
          ...(isPublic !== undefined ? { isPublic } : {}),
          ...(characterCreation !== undefined ? { characterCreation } : {}),
          ...(pitch !== undefined ? { pitch } : {}),
          ...(accent !== undefined ? { accent } : {}),
          ...(tags !== undefined ? { tags } : {}),
        };
        const [next] = await tx
          .update(campaigns)
          .set({ ...fields, version: a.campaign.version + 1, updatedAt: sql`now()` })
          .where(eq(campaigns.id, a.campaign.id))
          .returning();
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.updated',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          // Champs envoyés (après), et diff avant/après des champs modifiables
          payload: {
            version: next!.version,
            ...fields,
            ...changesPayload(editable(a.campaign), editable(next!)),
          },
        });
        return next!;
      });
      return campaignDetail(deps, { campaign, role: 'gm' }, req);
    },
  );

  r.post(
    '/v1/campaigns/:id/code',
    { ...auth, schema: { params: Params, response: { 200: CampaignResponse } } },
    async (req) => {
      const userId = currentUser(req);
      const campaign = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        let next: typeof campaigns.$inferSelect | undefined;
        // Code déjà pris : on en tire un autre (collision très improbable, et la contrainte
        // d'unicité reste le dernier garde-fou)
        for (let attempt = 0; !next && attempt < CODE_ATTEMPTS; attempt++) {
          const code = newCampaignCode();
          const [taken] = await tx
            .select({ id: campaigns.id })
            .from(campaigns)
            .where(eq(campaigns.code, code));
          if (taken) continue;
          [next] = await tx
            .update(campaigns)
            .set({ code, version: a.campaign.version + 1, updatedAt: sql`now()` })
            .where(eq(campaigns.id, a.campaign.id))
            .returning();
        }
        if (!next) throw new Error('Aucun code de campagne libre après plusieurs essais');
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.updated',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: {
            version: next.version,
            code: next.code,
            ...changesPayload({ code: a.campaign.code }, { code: next.code }),
          },
        });
        return next;
      });
      return campaignDetail(deps, { campaign, role: 'gm' }, req);
    },
  );

  r.delete('/v1/campaigns/:id', { ...auth, schema: { params: Params } }, async (req, reply) => {
    const userId = currentUser(req);
    await db.transaction(async (tx) => {
      await lockCampaign(tx, req.params.id);
      const a = await access(tx, req.params.id, userId);
      if (a.campaign.ownerId !== userId)
        throw HttpError.forbidden('Seul le MJ propriétaire peut supprimer la campagne');
      // Membres, invitations, engagements et combat suivent (ON DELETE CASCADE)
      await tx.delete(campaigns).where(eq(campaigns.id, a.campaign.id));
      await campaignEvent(tx, eventContext(req), {
        type: 'campaign.deleted',
        campaignId: a.campaign.id,
        userId,
        role: a.role,
        payload: { name: a.campaign.name },
      });
    });
    reply.code(204);
  });

  // Route commune d'envoi (docs/uploads.md) : image de la campagne, fonds et objets de la
  // carte, images des PNJ (MJ) ; images des notes (qui écrit des notes dans la campagne)
  r.post(
    '/v1/campaigns/:id/uploads',
    {
      config: UPLOAD_LIMIT,
      preValidation: (req, reply) => app.authenticate(req, reply),
      schema: {
        params: Params,
        body: FileUploadRequest,
        response: { 200: FileUploadTicket },
      },
    },
    async (req) => {
      const id = req.params.id;
      if (req.body.usage === 'note-image')
        requireWriter(await campaignReader(db, id, currentUser(req)), id);
      else await gmAccess(db, id, currentUser(req));
      // Place réservée sur le quota de la campagne avant la signature (docs/stockage.md)
      return deps.uploads.ticket(
        req.body,
        id,
        CAMPAIGN_UPLOAD_USAGES,
        req.log,
        reserveFor(deps, id),
      );
    },
  );

  // ─── Membres ───────────────────────────────────────────────────────────────

  r.patch(
    '/v1/campaigns/:id/members/:userId',
    {
      ...auth,
      schema: {
        params: MemberParams,
        body: z.object({ role: Role }),
        response: { 200: CampaignResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const target = req.params.userId;
      const campaign = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        if (target === a.campaign.ownerId)
          throw HttpError.conflict('Le MJ propriétaire reste MJ de sa campagne', 'owner');
        const [member] = await tx
          .select()
          .from(campaignMembers)
          .where(
            and(eq(campaignMembers.campaignId, a.campaign.id), eq(campaignMembers.userId, target)),
          );
        if (!member) throw HttpError.notFound('Membre introuvable');
        if (member.role !== req.body.role) {
          await tx
            .update(campaignMembers)
            .set({ role: req.body.role })
            .where(
              and(
                eq(campaignMembers.campaignId, a.campaign.id),
                eq(campaignMembers.userId, target),
              ),
            );
          // Un spectateur n'incarne personne
          if (req.body.role === 'spectator')
            await tx
              .update(campaignCharacters)
              .set({ playedBy: null })
              .where(
                and(
                  eq(campaignCharacters.campaignId, a.campaign.id),
                  eq(campaignCharacters.playedBy, target),
                ),
              );
          await campaignEvent(tx, eventContext(req), {
            type: 'campaign.member_role_changed',
            campaignId: a.campaign.id,
            userId,
            role: a.role,
            payload: { userId: target, role: req.body.role, previousRole: member.role },
          });
        }
        return a.campaign;
      });
      return campaignDetail(deps, { campaign, role: 'gm' }, req);
    },
  );

  r.delete(
    '/v1/campaigns/:id/members/:userId',
    {
      ...auth,
      schema: {
        params: MemberParams,
        querystring: z.object({ ban: z.stringbool().default(false) }),
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const target = req.params.userId;
      const { ban } = req.query;
      await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await access(tx, req.params.id, userId);
        if ((target !== userId || ban) && a.role !== 'gm')
          throw HttpError.forbidden('Seul le MJ peut exclure ou bannir un membre');
        if (ban && target === userId)
          throw HttpError.badRequest('On ne se bannit pas soi-même', 'cannot_ban_self');
        if (target === a.campaign.ownerId)
          throw HttpError.conflict(
            'Le MJ propriétaire ne quitte pas sa campagne : il peut la supprimer',
            'owner',
          );
        const [member] = await tx
          .delete(campaignMembers)
          .where(
            and(eq(campaignMembers.campaignId, a.campaign.id), eq(campaignMembers.userId, target)),
          )
          .returning();
        if (!member) throw HttpError.notFound('Membre introuvable');

        // Ses personnages quittent la campagne avec lui (et le combat en cours)
        const theirs = await tx
          .select({ characterId: campaignCharacters.characterId })
          .from(campaignCharacters)
          .where(
            and(
              eq(campaignCharacters.campaignId, a.campaign.id),
              eq(campaignCharacters.ownerId, target),
            ),
          );
        const ids = theirs.map((c) => c.characterId);
        const actor = { userId, role: a.role };
        if (ids.length) {
          await removeFromCombat(tx, eventContext(req), a.campaign.id, ids, actor);
          await tx
            .delete(campaignCharacters)
            .where(
              and(
                eq(campaignCharacters.campaignId, a.campaign.id),
                inArray(campaignCharacters.characterId, ids),
              ),
            );
          for (const characterId of ids) {
            await campaignEvent(tx, eventContext(req), {
              type: 'campaign.character_removed',
              campaignId: a.campaign.id,
              ...actor,
              payload: { characterId, reason: 'member_left' },
            });
          }
        }
        if (ban)
          await tx
            .insert(campaignBans)
            .values({ campaignId: a.campaign.id, userId: target, bannedBy: userId })
            .onConflictDoNothing();
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.member_left',
          campaignId: a.campaign.id,
          ...actor,
          payload: { userId: target, role: member.role, kicked: target !== userId, banned: ban },
        });
      });
      reply.code(204);
    },
  );

  // ─── Bannissements ─────────────────────────────────────────────────────────

  r.get(
    '/v1/campaigns/:id/bans',
    {
      ...auth,
      schema: {
        params: Params,
        response: {
          200: z.array(
            z.object({
              userId: z.string(),
              name: z.string().nullable(),
              avatarUrl: z.string().nullable(),
              bannedBy: z.string(),
              bannedAt: z.string(),
            }),
          ),
        },
      },
    },
    async (req) => {
      const a = await gmAccess(db, req.params.id, currentUser(req));
      const bans = await db
        .select()
        .from(campaignBans)
        .where(eq(campaignBans.campaignId, a.campaign.id))
        .orderBy(asc(campaignBans.bannedAt), asc(campaignBans.userId));
      const profiles = await deps.profiles.profiles(
        bans.map((b) => b.userId),
        req.headers.authorization,
      );
      return bans.map((b) => {
        const u = userApi(b.userId, profiles);
        return {
          userId: b.userId,
          name: u.name,
          avatarUrl: u.avatarUrl,
          bannedBy: b.bannedBy,
          bannedAt: b.bannedAt.toISOString(),
        };
      });
    },
  );

  r.delete(
    '/v1/campaigns/:id/bans/:userId',
    { ...auth, schema: { params: MemberParams } },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        const a = await gmAccess(tx, req.params.id, userId);
        const [lifted] = await tx
          .delete(campaignBans)
          .where(
            and(
              eq(campaignBans.campaignId, a.campaign.id),
              eq(campaignBans.userId, req.params.userId),
            ),
          )
          .returning();
        if (!lifted) throw HttpError.notFound('Cet utilisateur n’est pas banni');
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.member_unbanned',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: { userId: req.params.userId },
          visibility: 'gm_only',
        });
      });
      reply.code(204);
    },
  );
};
