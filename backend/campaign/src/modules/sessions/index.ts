/**
 * Module « sessions » : sessions de jeu prévues par le MJ (ancienne
 * sous-collection Salle/{id}/sessions).
 *
 *   GET    /v1/rooms/:id/sessions               prochaines sessions (membres)
 *   POST   /v1/rooms/:id/sessions               { date, titre? } (MJ)
 *   DELETE /v1/rooms/:id/sessions/:sessionId    (MJ)
 *
 * Une session est « à venir » tant que sa date n'est pas passée, comme dans
 * l'ancienne app ; les sessions passées ne sont plus listées.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, eq, gt } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { roomSessions } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { acces, accesMj, evenementSalle, verrouillerSalle } from '../salles/depot.js';
import { contexte, IdSalle, moi, Uuid } from '../schemas.js';

/** Sessions à venir par salle, au plus. */
export const SESSIONS_MAX = 50;

const Session = z.object({ id: z.string(), date: z.string(), titre: z.string().nullable() });

const sessionApi = (s: typeof roomSessions.$inferSelect) => ({
  id: s.id,
  date: s.prevueLe.toISOString(),
  titre: s.titre,
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const Params = z.object({ id: IdSalle });

  const aVenir = (roomId: string) =>
    and(eq(roomSessions.roomId, roomId), gt(roomSessions.prevueLe, deps.maintenant()));

  r.get(
    '/v1/rooms/:id/sessions',
    { ...auth, schema: { params: Params, response: { 200: z.array(Session) } } },
    async (req) => {
      const a = await acces(db, req.params.id, moi(req));
      const sessions = await db
        .select()
        .from(roomSessions)
        .where(aVenir(a.salle.id))
        .orderBy(asc(roomSessions.prevueLe), asc(roomSessions.id))
        .limit(SESSIONS_MAX);
      return sessions.map(sessionApi);
    },
  );

  r.post(
    '/v1/rooms/:id/sessions',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          date: z.iso.datetime({ offset: true, message: 'Date ISO 8601 attendue' }),
          titre: z
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
      const userId = moi(req);
      const date = new Date(req.body.date);
      if (date.getTime() <= deps.maintenant().getTime())
        throw HttpError.badRequest('La session doit être dans le futur', 'date_passee');
      const session = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await accesMj(tx, req.params.id, userId);
        const [prevues] = await tx
          .select({ n: count() })
          .from(roomSessions)
          .where(aVenir(a.salle.id));
        if (prevues!.n >= SESSIONS_MAX)
          throw HttpError.conflict(`${SESSIONS_MAX} sessions à venir au plus`, 'trop_de_sessions');
        const [session] = await tx
          .insert(roomSessions)
          .values({
            id: uuidv7(),
            roomId: a.salle.id,
            prevueLe: date,
            titre: req.body.titre,
            creePar: userId,
          })
          .returning();
        await evenementSalle(tx, contexte(req), {
          type: 'room.session_scheduled',
          roomId: a.salle.id,
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
    '/v1/rooms/:id/sessions/:sessionId',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdSalle, sessionId: Uuid('Identifiant de session invalide') }),
      },
    },
    async (req, reply) => {
      const userId = moi(req);
      await db.transaction(async (tx) => {
        const a = await accesMj(tx, req.params.id, userId);
        const [session] = await tx
          .delete(roomSessions)
          .where(
            and(eq(roomSessions.roomId, a.salle.id), eq(roomSessions.id, req.params.sessionId)),
          )
          .returning();
        if (!session) throw HttpError.notFound('Session introuvable');
        await evenementSalle(tx, contexte(req), {
          type: 'room.session_cancelled',
          roomId: a.salle.id,
          userId,
          role: a.role,
          payload: { id: session.id },
        });
      });
      reply.code(204);
    },
  );
};
