/**
 * Module « messages » : discussion de la campagne, dans la table de jeu (anciennes
 * sous-collections Salle/{id}/chat et rooms/{id}/chat). Contrat : docs/api-campaign.md.
 *
 *   GET    /v1/campaigns/:id/messages?before=&after=&limit=   (membres)
 *   GET    /v1/campaigns/:id/messages/:messageId              (membres qui peuvent le lire)
 *   POST   /v1/campaigns/:id/messages                         { body, recipients? } (membres)
 *   PATCH  /v1/campaigns/:id/messages/:messageId              { body } (auteur)
 *   DELETE /v1/campaigns/:id/messages/:messageId              (auteur ou MJ)
 *
 * Un message peut être chuchoté (`recipients`) : qui le lit, voir `common.ts`. Les listes ne
 * renvoient que les messages lisibles par l'appelant, du plus ancien au plus récent. Sans
 * curseur : les `limit` derniers ; `before` : la page précédente (plus anciens) ; `after` :
 * ceux arrivés depuis le dernier reçu (rattrapage après une coupure du temps réel).
 *
 * Temps réel : `campaign.message_posted`, `_updated` et `_deleted`, sans le texte ; le client
 * relit le message (ou la suite de la liste) en REST.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignMessages } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { access } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext, Uuid } from '../schemas.js';
import {
  loadMessage,
  Message,
  MessageBody,
  messageApi,
  messageEvent,
  profileIds,
  readableBy,
  RecipientsInput,
  whisperColumns,
  type MessageRow,
} from './common.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
/** Fenêtre de la limite de débit des messages. */
const RATE_WINDOW_SECONDS = 60;

const MessageId = Uuid('Identifiant de message invalide');
const MessageParams = z.object({ id: CampaignId, messageId: MessageId });

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  async function messagesApi(rows: MessageRow[], authorization: string | undefined) {
    const profiles = await deps.profiles.profiles(profileIds(rows), authorization);
    return rows.map((m) => messageApi(m, profiles));
  }

  const viewer = async (tx: Parameters<typeof access>[0], campaignId: string, userId: string) => ({
    access: await access(tx, campaignId, userId),
    userId,
  });

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
      const v = await viewer(db, req.params.id, currentUser(req));
      const { before, after, limit } = req.query;
      const readable = readableBy(v);
      let rows: MessageRow[];
      if (after) {
        rows = await db
          .select()
          .from(campaignMessages)
          .where(and(readable, gt(campaignMessages.id, after)))
          .orderBy(asc(campaignMessages.id))
          .limit(limit);
      } else {
        rows = (
          await db
            .select()
            .from(campaignMessages)
            .where(and(readable, before ? lt(campaignMessages.id, before) : undefined))
            .orderBy(desc(campaignMessages.id))
            .limit(limit)
        ).reverse();
      }
      return messagesApi(rows, req.headers.authorization);
    },
  );

  r.get(
    '/v1/campaigns/:id/messages/:messageId',
    { ...auth, schema: { params: MessageParams, response: { 200: Message } } },
    async (req) => {
      const v = await viewer(db, req.params.id, currentUser(req));
      const message = await loadMessage(db, v, req.params.messageId);
      const [api] = await messagesApi([message], req.headers.authorization);
      return api!;
    },
  );

  r.post(
    '/v1/campaigns/:id/messages',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        body: z.object({ body: MessageBody, recipients: RecipientsInput.nullish() }),
        response: { 201: Message },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const message = await db.transaction(async (tx) => {
        const v = await viewer(tx, req.params.id, userId);
        // Débit par membre et par campagne, compté en base : vaut pour toutes les instances.
        // L'attente annoncée court jusqu'à la sortie du plus ancien message de la fenêtre.
        const [recent] = await tx
          .select({
            n: sql<number>`count(*)::int`,
            wait: sql<number>`greatest(1, ceil(extract(epoch from min(${campaignMessages.createdAt}) + make_interval(secs => ${RATE_WINDOW_SECONDS}) - now())))::int`,
          })
          .from(campaignMessages)
          .where(
            and(
              eq(campaignMessages.campaignId, v.access.campaign.id),
              eq(campaignMessages.authorId, userId),
              gt(
                campaignMessages.createdAt,
                sql`now() - make_interval(secs => ${RATE_WINDOW_SECONDS})`,
              ),
            ),
          );
        if (recent!.n >= deps.config.RATE_LIMIT_MESSAGES_MAX) {
          const wait = Math.min(RATE_WINDOW_SECONDS, recent!.wait ?? RATE_WINDOW_SECONDS);
          reply.header('retry-after', String(wait));
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
            campaignId: v.access.campaign.id,
            authorId: userId,
            body: req.body.body,
            ...(await whisperColumns(tx, v, req.body.recipients)),
          })
          .returning();
        await messageEvent(tx, eventContext(req), v, {
          type: 'campaign.message_posted',
          message: message!,
        });
        return message!;
      });
      reply.code(201);
      const [api] = await messagesApi([message], req.headers.authorization);
      return api!;
    },
  );

  r.patch(
    '/v1/campaigns/:id/messages/:messageId',
    {
      ...auth,
      schema: {
        params: MessageParams,
        body: z.object({ body: MessageBody }),
        response: { 200: Message },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const message = await db.transaction(async (tx) => {
        const v = await viewer(tx, req.params.id, userId);
        const current = await loadMessage(tx, v, req.params.messageId, true);
        if (current.authorId !== userId)
          throw new HttpError(
            403,
            'Accès refusé',
            'not_author',
            'Seul l’auteur modifie son message',
          );
        // Texte identique : rien ne change, pas d'événement
        if (current.body === req.body.body) return current;
        const [updated] = await tx
          .update(campaignMessages)
          .set({ body: req.body.body, editedAt: deps.now() })
          .where(eq(campaignMessages.id, current.id))
          .returning();
        await messageEvent(tx, eventContext(req), v, {
          type: 'campaign.message_updated',
          message: updated!,
        });
        return updated!;
      });
      const [api] = await messagesApi([message], req.headers.authorization);
      return api!;
    },
  );

  r.delete(
    '/v1/campaigns/:id/messages/:messageId',
    { ...auth, schema: { params: MessageParams } },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        const v = await viewer(tx, req.params.id, userId);
        const message = await loadMessage(tx, v, req.params.messageId, true);
        if (message.authorId !== userId && v.access.role !== 'gm')
          throw HttpError.forbidden('Seuls l’auteur et le MJ suppriment ce message');
        await tx.delete(campaignMessages).where(eq(campaignMessages.id, message.id));
        await messageEvent(tx, eventContext(req), v, {
          type: 'campaign.message_deleted',
          message,
        });
      });
      reply.code(204);
    },
  );
};
