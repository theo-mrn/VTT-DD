/**
 * Module « messages » : discussion de la campagne (ancienne sous-collection
 * Salle/{id}/chat). Lue en polling en attendant le service realtime : les
 * événements campaign.message_* sont déjà écrits dans l'outbox.
 *
 *   GET    /v1/campaigns/:id/messages?before=&after=&limit=   (membres)
 *   POST   /v1/campaigns/:id/messages                         { body } (membres)
 *   DELETE /v1/campaigns/:id/messages/:messageId              (auteur ou MJ)
 *
 * Les messages sont renvoyés du plus ancien au plus récent. Sans curseur : les
 * `limit` derniers ; `before` : la page précédente (messages plus anciens) ;
 * `after` : les nouveaux messages depuis le dernier reçu (polling).
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignMessages } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { access, campaignEvent, userApi } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext, UserRef, Uuid } from '../schemas.js';

export const MAX_BODY = 1000;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

const MessageId = Uuid('Identifiant de message invalide');

const Message = z.object({
  id: z.string(),
  author: UserRef,
  body: z.string(),
  createdAt: z.string(),
});

type MessageRow = typeof campaignMessages.$inferSelect;

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  async function messagesApi(rows: MessageRow[], authorization: string | undefined) {
    const profiles = await deps.profiles.profiles(
      [...new Set(rows.map((m) => m.authorId))],
      authorization,
    );
    return rows.map((m) => ({
      id: m.id,
      author: userApi(m.authorId, profiles),
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  r.get(
    '/v1/campaigns/:id/messages',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        querystring: z
          .object({
            before: MessageId.optional(),
            after: MessageId.optional(),
            limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
          })
          .refine((q) => !(q.before && q.after), 'before et after ne se combinent pas'),
        response: { 200: z.array(Message) },
      },
    },
    async (req) => {
      const a = await access(db, req.params.id, currentUser(req));
      const { before, after, limit } = req.query;
      const inCampaign = eq(campaignMessages.campaignId, a.campaign.id);
      let rows: MessageRow[];
      if (after) {
        rows = await db
          .select()
          .from(campaignMessages)
          .where(and(inCampaign, gt(campaignMessages.id, after)))
          .orderBy(asc(campaignMessages.id))
          .limit(limit);
      } else {
        rows = (
          await db
            .select()
            .from(campaignMessages)
            .where(and(inCampaign, before ? lt(campaignMessages.id, before) : undefined))
            .orderBy(desc(campaignMessages.id))
            .limit(limit)
        ).reverse();
      }
      return messagesApi(rows, req.headers.authorization);
    },
  );

  r.post(
    '/v1/campaigns/:id/messages',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        body: z.object({
          body: z
            .string()
            .trim()
            .min(1, 'Message vide')
            .max(MAX_BODY, `${MAX_BODY} caractères au plus`),
        }),
        response: { 201: Message },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const message = await db.transaction(async (tx) => {
        const a = await access(tx, req.params.id, userId);
        // Débit par membre et par campagne, compté en base : vaut pour toutes les instances
        const [recent] = await tx
          .select({ n: count() })
          .from(campaignMessages)
          .where(
            and(
              eq(campaignMessages.campaignId, a.campaign.id),
              eq(campaignMessages.authorId, userId),
              gt(campaignMessages.createdAt, sql`now() - interval '1 minute'`),
            ),
          );
        if (recent!.n >= deps.config.RATE_LIMIT_MESSAGES_MAX) {
          reply.header('retry-after', '60');
          throw new HttpError(
            429,
            'Trop de requêtes',
            'too_many_messages',
            'Trop de messages en peu de temps : patientez un instant',
          );
        }
        const [message] = await tx
          .insert(campaignMessages)
          .values({
            id: uuidv7(),
            campaignId: a.campaign.id,
            authorId: userId,
            body: req.body.body,
          })
          .returning();
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.message_posted',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: { id: message!.id, authorId: userId, body: message!.body },
        });
        return message!;
      });
      reply.code(201);
      const [api] = await messagesApi([message], req.headers.authorization);
      return api!;
    },
  );

  r.delete(
    '/v1/campaigns/:id/messages/:messageId',
    { ...auth, schema: { params: z.object({ id: CampaignId, messageId: MessageId }) } },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        const a = await access(tx, req.params.id, userId);
        const [message] = await tx
          .select()
          .from(campaignMessages)
          .where(
            and(
              eq(campaignMessages.campaignId, a.campaign.id),
              eq(campaignMessages.id, req.params.messageId),
            ),
          );
        if (!message) throw HttpError.notFound('Message introuvable');
        if (message.authorId !== userId && a.role !== 'gm')
          throw HttpError.forbidden('Seuls l’auteur et le MJ suppriment ce message');
        await tx.delete(campaignMessages).where(eq(campaignMessages.id, message.id));
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.message_deleted',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: { id: message.id, authorId: message.authorId },
        });
      });
      reply.code(204);
    },
  );
};
