/**
 * Module « handouts » : projection et documents (docs/projection.md).
 *
 *   GET    /v1/campaigns/:id/handouts                         bibliothèque (MJ)
 *   POST   /v1/campaigns/:id/handouts                         { name, url } (MJ)
 *   PATCH  /v1/campaigns/:id/handouts/:handoutId              { name } (MJ)
 *   DELETE /v1/campaigns/:id/handouts/:handoutId              (MJ) partages compris
 *   POST   /v1/campaigns/:id/handouts/:handoutId/share        { mode, recipients } (MJ)
 *   POST   /v1/campaigns/:id/handout-shares/:shareId/stop     fin de la projection (MJ)
 *   GET    /v1/campaigns/:id/documents                        reçus (MJ : tout), projection en cours
 *
 * Un partage à certains joueurs part en `gm_only` avec `visibleToUsers` : le temps réel ne le
 * remet qu'au MJ et à eux.
 */
import {
  CreateHandout,
  DocumentsResponse,
  Handout,
  HANDOUT_PROJECTION_TTL_MS,
  HANDOUT_VIDEO_LEAD_MS,
  ShareHandout,
  UpdateHandout,
  uuidv7,
  type Visibility,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { campaignHandouts, campaignHandoutShares, campaignMembers } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { access, actorRole, gmAccess } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext, Uuid } from '../schemas.js';

type HandoutRow = typeof campaignHandouts.$inferSelect;
type ShareRow = typeof campaignHandoutShares.$inferSelect;

/** Documents reçus listés, au plus. */
export const MAX_DOCUMENTS = 200;

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  webm: 'video/webm',
  mp4: 'video/mp4',
};

export const handoutApi = (h: HandoutRow) => ({
  id: h.id,
  campaignId: h.campaignId,
  name: h.name,
  url: h.url,
  contentType: h.contentType,
  createdAt: h.createdAt.toISOString(),
});

export const shareApi = (s: ShareRow) => ({
  id: s.id,
  handoutId: s.handoutId,
  mode: s.mode,
  recipients: s.recipients ?? null,
  sharedBy: s.sharedBy,
  sharedAt: s.sharedAt.toISOString(),
  startsAt: s.startsAt.toISOString(),
  stoppedAt: s.stoppedAt ? s.stoppedAt.toISOString() : null,
});

/** Audience d'un partage : toute la table, ou le MJ et ses destinataires. */
const audience = (
  recipients: readonly string[] | null,
): { visibility: Visibility; visibleToUsers?: string[] } =>
  recipients
    ? { visibility: 'gm_only', visibleToUsers: [...recipients] }
    : { visibility: 'public' };

function handoutEvent(
  tx: Tx,
  ctx: EventContext,
  e: {
    type: `handout.${string}`;
    campaignId: string;
    userId: string;
    id: string;
    payload: Record<string, unknown>;
    visibility: Visibility;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: e.campaignId,
    actor: { userId: e.userId, role: actorRole('gm'), characterId: null },
    aggregate: { type: 'handout', id: e.id },
    payload: e.payload,
    visibility: e.visibility,
  });
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const Params = z.object({ id: CampaignId });
  const HandoutParams = Params.extend({ handoutId: Uuid('Identifiant de document invalide') });

  const findHandout = async (tx: Tx, campaignId: string, handoutId: string) => {
    const [h] = await tx
      .select()
      .from(campaignHandouts)
      .where(and(eq(campaignHandouts.campaignId, campaignId), eq(campaignHandouts.id, handoutId)));
    if (!h) throw HttpError.notFound('Document introuvable');
    return h;
  };

  r.get(
    '/v1/campaigns/:id/handouts',
    {
      ...auth,
      schema: { params: Params, response: { 200: z.object({ items: z.array(Handout) }) } },
    },
    async (req) => {
      const a = await gmAccess(db, req.params.id, currentUser(req));
      const rows = await db
        .select()
        .from(campaignHandouts)
        .where(eq(campaignHandouts.campaignId, a.campaign.id))
        .orderBy(desc(campaignHandouts.createdAt), desc(campaignHandouts.id));
      return { items: rows.map(handoutApi) };
    },
  );

  r.post(
    '/v1/campaigns/:id/handouts',
    { ...auth, schema: { params: Params, body: CreateHandout, response: { 201: Handout } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const id = req.params.id;
      // Seulement un fichier envoyé dans cette campagne (et compté dans son stockage)
      if (!deps.uploads.isOwnFile(req.body.url, 'campaigns', id))
        throw new HttpError(
          422,
          'Adresse refusée',
          'handout_url_not_allowed',
          'Le document doit être un fichier envoyé dans la campagne',
        );
      const ext = /\.([a-z0-9]+)$/i.exec(req.body.url)?.[1]?.toLowerCase() ?? '';
      const contentType = TYPES[ext];
      if (!contentType)
        throw new HttpError(
          415,
          'Format refusé',
          'unsupported_media_type',
          'Image ou vidéo attendue',
        );
      const handout = await db.transaction(async (tx) => {
        const a = await gmAccess(tx, id, userId);
        const [h] = await tx
          .insert(campaignHandouts)
          .values({
            id: uuidv7(),
            campaignId: a.campaign.id,
            name: req.body.name,
            url: req.body.url,
            contentType,
            createdBy: userId,
            createdAt: deps.now(),
          })
          .returning();
        await handoutEvent(tx, eventContext(req), {
          type: 'handout.created',
          campaignId: a.campaign.id,
          userId,
          id: h!.id,
          payload: handoutApi(h!),
          visibility: 'gm_only',
        });
        return h!;
      });
      reply.code(201);
      return handoutApi(handout);
    },
  );

  r.patch(
    '/v1/campaigns/:id/handouts/:handoutId',
    { ...auth, schema: { params: HandoutParams, body: UpdateHandout, response: { 200: Handout } } },
    async (req) => {
      const userId = currentUser(req);
      return db.transaction(async (tx) => {
        const a = await gmAccess(tx, req.params.id, userId);
        await findHandout(tx, a.campaign.id, req.params.handoutId);
        const [h] = await tx
          .update(campaignHandouts)
          .set({ name: req.body.name })
          .where(eq(campaignHandouts.id, req.params.handoutId))
          .returning();
        await handoutEvent(tx, eventContext(req), {
          type: 'handout.updated',
          campaignId: a.campaign.id,
          userId,
          id: h!.id,
          payload: handoutApi(h!),
          visibility: 'gm_only',
        });
        return handoutApi(h!);
      });
    },
  );

  r.delete(
    '/v1/campaigns/:id/handouts/:handoutId',
    { ...auth, schema: { params: HandoutParams } },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        const a = await gmAccess(tx, req.params.id, userId);
        await findHandout(tx, a.campaign.id, req.params.handoutId);
        // Ses partages suivent (cascade) : il disparaît des documents de chacun
        await tx.delete(campaignHandouts).where(eq(campaignHandouts.id, req.params.handoutId));
        await handoutEvent(tx, eventContext(req), {
          type: 'handout.deleted',
          campaignId: a.campaign.id,
          userId,
          id: req.params.handoutId,
          payload: { id: req.params.handoutId },
          visibility: 'public',
        });
      });
      reply.code(204);
    },
  );

  r.post(
    '/v1/campaigns/:id/handouts/:handoutId/share',
    {
      ...auth,
      schema: {
        params: HandoutParams,
        body: ShareHandout,
        response: { 201: z.object({ id: z.uuid() }) },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const share = await db.transaction(async (tx) => {
        const a = await gmAccess(tx, req.params.id, userId);
        const h = await findHandout(tx, a.campaign.id, req.params.handoutId);
        const recipients = req.body.recipients ? [...new Set(req.body.recipients)] : null;
        if (recipients) {
          const members = await tx
            .select({ userId: campaignMembers.userId })
            .from(campaignMembers)
            .where(
              and(
                eq(campaignMembers.campaignId, a.campaign.id),
                inArray(campaignMembers.userId, recipients),
              ),
            );
          if (members.length !== recipients.length)
            throw new HttpError(
              422,
              'Destinataire inconnu',
              'unknown_recipient',
              'Chaque destinataire doit être membre de la campagne',
            );
        }
        const now = deps.now();
        // Vidéo projetée : départ commun, le temps qu'elle se charge chez tous
        const lead =
          req.body.mode === 'show' && h.contentType.startsWith('video/')
            ? HANDOUT_VIDEO_LEAD_MS
            : 0;
        const [s] = await tx
          .insert(campaignHandoutShares)
          .values({
            id: uuidv7(),
            campaignId: a.campaign.id,
            handoutId: h.id,
            mode: req.body.mode,
            recipients,
            sharedBy: userId,
            sharedAt: now,
            startsAt: new Date(now.getTime() + lead),
          })
          .returning();
        const { visibility, visibleToUsers } = audience(recipients);
        await handoutEvent(tx, eventContext(req), {
          type: 'handout.shared',
          campaignId: a.campaign.id,
          userId,
          id: h.id,
          payload: {
            ...shareApi(s!),
            handout: handoutApi(h),
            ...(visibleToUsers ? { visibleToUsers } : {}),
          },
          visibility,
        });
        return s!;
      });
      reply.code(201);
      return { id: share.id };
    },
  );

  r.post(
    '/v1/campaigns/:id/handout-shares/:shareId/stop',
    {
      ...auth,
      schema: { params: Params.extend({ shareId: Uuid('Identifiant de partage invalide') }) },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        const a = await gmAccess(tx, req.params.id, userId);
        const [s] = await tx
          .update(campaignHandoutShares)
          .set({ stoppedAt: deps.now() })
          .where(
            and(
              eq(campaignHandoutShares.campaignId, a.campaign.id),
              eq(campaignHandoutShares.id, req.params.shareId),
              isNull(campaignHandoutShares.stoppedAt),
            ),
          )
          .returning();
        if (!s) throw HttpError.notFound('Projection introuvable ou déjà arrêtée');
        const { visibility, visibleToUsers } = audience(s.recipients ?? null);
        await handoutEvent(tx, eventContext(req), {
          type: 'handout.stopped',
          campaignId: a.campaign.id,
          userId,
          id: s.handoutId,
          payload: {
            id: s.id,
            stoppedAt: s.stoppedAt!.toISOString(),
            ...(visibleToUsers ? { visibleToUsers } : {}),
          },
          visibility,
        });
      });
      reply.code(204);
    },
  );

  r.get(
    '/v1/campaigns/:id/documents',
    { ...auth, schema: { params: Params, response: { 200: DocumentsResponse } } },
    async (req) => {
      const userId = currentUser(req);
      const a = await access(db, req.params.id, userId);
      const mine =
        a.role === 'gm'
          ? undefined
          : or(
              isNull(campaignHandoutShares.recipients),
              sql`${userId}::uuid = ANY(${campaignHandoutShares.recipients})`,
            );
      const rows = await db
        .select({ share: campaignHandoutShares, handout: campaignHandouts })
        .from(campaignHandoutShares)
        .innerJoin(campaignHandouts, eq(campaignHandouts.id, campaignHandoutShares.handoutId))
        .where(and(eq(campaignHandoutShares.campaignId, a.campaign.id), mine))
        .orderBy(desc(campaignHandoutShares.sharedAt), desc(campaignHandoutShares.id))
        .limit(MAX_DOCUMENTS);
      const items = rows.map((r) => ({ ...shareApi(r.share), handout: handoutApi(r.handout) }));
      const now = deps.now();
      const projection =
        items.find(
          (d) =>
            d.mode === 'show' &&
            !d.stoppedAt &&
            now.getTime() - new Date(d.sharedAt).getTime() < HANDOUT_PROJECTION_TTL_MS,
        ) ?? null;
      return { items, projection, serverTime: now.toISOString() };
    },
  );
};
