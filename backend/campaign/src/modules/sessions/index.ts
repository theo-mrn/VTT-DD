/**
 * Module « sessions » : sessions de jeu prévues par le MJ (ancienne
 * sous-collection Salle/{id}/sessions).
 *
 *   GET    /v1/campaigns/:id/sessions               prochaines sessions (membres)
 *   POST   /v1/campaigns/:id/sessions               { date, title? } (MJ)
 *   DELETE /v1/campaigns/:id/sessions/:sessionId    (MJ)
 *
 * Une session est « à venir » tant que sa date n'est pas passée, comme dans
 * l'ancienne app ; les sessions passées ne sont plus listées.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, eq, gt } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignSessions } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { access, campaignEvent, gmAccess, lockCampaign } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext, Uuid } from '../schemas.js';

/** Sessions à venir par campagne, au plus. */
export const MAX_SESSIONS = 50;

const Session = z.object({ id: z.string(), date: z.string(), title: z.string().nullable() });

const sessionApi = (s: typeof campaignSessions.$inferSelect) => ({
  id: s.id,
  date: s.scheduledAt.toISOString(),
  title: s.title,
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const Params = z.object({ id: CampaignId });

  const upcoming = (campaignId: string) =>
    and(eq(campaignSessions.campaignId, campaignId), gt(campaignSessions.scheduledAt, deps.now()));

  r.get(
    '/v1/campaigns/:id/sessions',
    { ...auth, schema: { params: Params, response: { 200: z.array(Session) } } },
    async (req) => {
      const a = await access(db, req.params.id, currentUser(req));
      const sessions = await db
        .select()
        .from(campaignSessions)
        .where(upcoming(a.campaign.id))
        .orderBy(asc(campaignSessions.scheduledAt), asc(campaignSessions.id))
        .limit(MAX_SESSIONS);
      return sessions.map(sessionApi);
    },
  );

  r.post(
    '/v1/campaigns/:id/sessions',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          date: z.iso.datetime({ offset: true, message: 'Date ISO 8601 attendue' }),
          title: z
            .string()
            .trim()
            .max(100, '100 caractères au plus')
            .nullish()
            // Un titre vide revient à ne pas en donner
            .transform((v) => v || null),
        }),
        response: { 201: Session },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const date = new Date(req.body.date);
      if (date.getTime() <= deps.now().getTime())
        throw HttpError.badRequest('La session doit être dans le futur', 'date_in_past');
      const session = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const [scheduled] = await tx
          .select({ n: count() })
          .from(campaignSessions)
          .where(upcoming(a.campaign.id));
        if (scheduled!.n >= MAX_SESSIONS)
          throw HttpError.conflict(`${MAX_SESSIONS} sessions à venir au plus`, 'too_many_sessions');
        const [session] = await tx
          .insert(campaignSessions)
          .values({
            id: uuidv7(),
            campaignId: a.campaign.id,
            scheduledAt: date,
            title: req.body.title,
            createdBy: userId,
          })
          .returning();
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.session_scheduled',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: sessionApi(session!),
        });
        return session!;
      });
      reply.code(201);
      return sessionApi(session);
    },
  );

  r.delete(
    '/v1/campaigns/:id/sessions/:sessionId',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId, sessionId: Uuid('Identifiant de session invalide') }),
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        const a = await gmAccess(tx, req.params.id, userId);
        const [session] = await tx
          .delete(campaignSessions)
          .where(
            and(
              eq(campaignSessions.campaignId, a.campaign.id),
              eq(campaignSessions.id, req.params.sessionId),
            ),
          )
          .returning();
        if (!session) throw HttpError.notFound('Session introuvable');
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.session_cancelled',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: { id: session.id },
        });
      });
      reply.code(204);
    },
  );
};
