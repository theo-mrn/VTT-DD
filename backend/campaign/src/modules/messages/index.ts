/**
 * Module « messages » : discussion de la salle (ancienne sous-collection
 * Salle/{id}/chat). Lue en polling en attendant le service realtime : les
 * événements room.message_* sont déjà écrits dans l'outbox.
 *
 *   GET    /v1/rooms/:id/messages?avant=&apres=&limite=   (membres)
 *   POST   /v1/rooms/:id/messages                         { texte } (membres)
 *   DELETE /v1/rooms/:id/messages/:messageId              (auteur ou MJ)
 *
 * Les messages sont renvoyés du plus ancien au plus récent. Sans curseur : les
 * `limite` derniers ; `avant` : la page précédente (messages plus anciens) ;
 * `apres` : les nouveaux messages depuis le dernier reçu (polling).
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { roomMessages } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { acces, evenementSalle, utilisateurApi } from '../salles/depot.js';
import { contexte, IdSalle, moi, Utilisateur, Uuid } from '../schemas.js';

export const TEXTE_MAX = 1000;
export const LIMITE_DEFAUT = 50;
export const LIMITE_MAX = 100;

const IdMessage = Uuid('Identifiant de message invalide');

const Message = z.object({
  id: z.string(),
  auteur: Utilisateur,
  texte: z.string(),
  createdAt: z.string(),
});

type LigneMessage = typeof roomMessages.$inferSelect;

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  async function messagesApi(lignes: LigneMessage[], authorization: string | undefined) {
    const profils = await deps.profils.profils(
      [...new Set(lignes.map((m) => m.auteurId))],
      authorization,
    );
    return lignes.map((m) => ({
      id: m.id,
      auteur: utilisateurApi(m.auteurId, profils),
      texte: m.texte,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  r.get(
    '/v1/rooms/:id/messages',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdSalle }),
        querystring: z
          .object({
            avant: IdMessage.optional(),
            apres: IdMessage.optional(),
            limite: z.coerce.number().int().min(1).max(LIMITE_MAX).default(LIMITE_DEFAUT),
          })
          .refine((q) => !(q.avant && q.apres), 'avant et apres ne se combinent pas'),
        response: { 200: z.array(Message) },
      },
    },
    async (req) => {
      const a = await acces(db, req.params.id, moi(req));
      const { avant, apres, limite } = req.query;
      const dansLaSalle = eq(roomMessages.roomId, a.salle.id);
      let lignes: LigneMessage[];
      if (apres) {
        lignes = await db
          .select()
          .from(roomMessages)
          .where(and(dansLaSalle, gt(roomMessages.id, apres)))
          .orderBy(asc(roomMessages.id))
          .limit(limite);
      } else {
        lignes = (
          await db
            .select()
            .from(roomMessages)
            .where(and(dansLaSalle, avant ? lt(roomMessages.id, avant) : undefined))
            .orderBy(desc(roomMessages.id))
            .limit(limite)
        ).reverse();
      }
      return messagesApi(lignes, req.headers.authorization);
    },
  );

  r.post(
    '/v1/rooms/:id/messages',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdSalle }),
        body: z.object({
          texte: z
            .string()
            .trim()
            .min(1, 'Message vide')
            .max(TEXTE_MAX, `${TEXTE_MAX} caractères au plus`),
        }),
        response: { 201: Message },
      },
    },
    async (req, reply) => {
      const userId = moi(req);
      const message = await db.transaction(async (tx) => {
        const a = await acces(tx, req.params.id, userId);
        // Débit par membre et par salle, compté en base : vaut pour toutes les instances
        const [recents] = await tx
          .select({ n: count() })
          .from(roomMessages)
          .where(
            and(
              eq(roomMessages.roomId, a.salle.id),
              eq(roomMessages.auteurId, userId),
              gt(roomMessages.createdAt, sql`now() - interval '1 minute'`),
            ),
          );
        if (recents!.n >= deps.config.RATE_LIMIT_MESSAGES_MAX) {
          reply.header('retry-after', '60');
          throw new HttpError(
            429,
            'Trop de requêtes',
            'trop_de_messages',
            'Trop de messages en peu de temps : patientez un instant',
          );
        }
        const [message] = await tx
          .insert(roomMessages)
          .values({ id: uuidv7(), roomId: a.salle.id, auteurId: userId, texte: req.body.texte })
          .returning();
        await evenementSalle(tx, contexte(req), {
          type: 'room.message_posted',
          roomId: a.salle.id,
          userId,
          role: a.role,
          payload: { id: message!.id, auteurId: userId, texte: message!.texte },
        });
        return message!;
      });
      reply.code(201);
      const [api] = await messagesApi([message], req.headers.authorization);
      return api!;
    },
  );

  r.delete(
    '/v1/rooms/:id/messages/:messageId',
    { ...auth, schema: { params: z.object({ id: IdSalle, messageId: IdMessage }) } },
    async (req, reply) => {
      const userId = moi(req);
      await db.transaction(async (tx) => {
        const a = await acces(tx, req.params.id, userId);
        const [message] = await tx
          .select()
          .from(roomMessages)
          .where(
            and(eq(roomMessages.roomId, a.salle.id), eq(roomMessages.id, req.params.messageId)),
          );
        if (!message) throw HttpError.notFound('Message introuvable');
        if (message.auteurId !== userId && a.role !== 'mj')
          throw HttpError.forbidden('Seuls l’auteur et le MJ suppriment ce message');
        await tx.delete(roomMessages).where(eq(roomMessages.id, message.id));
        await evenementSalle(tx, contexte(req), {
          type: 'room.message_deleted',
          roomId: a.salle.id,
          userId,
          role: a.role,
          payload: { id: message.id, auteurId: message.auteurId },
        });
      });
      reply.code(204);
    },
  );
};
