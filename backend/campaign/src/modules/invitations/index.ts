/**
 * Module « invitations » : liens d'invitation d'une salle et adhésion.
 *
 *   POST /v1/rooms/:id/invitations   { expireDans?, utilisations? } → { code, url, expireLe } (MJ)
 *   POST /v1/rooms/rejoindre         { code } → la salle ; l'appelant devient joueur
 *
 * `expireDans` est en secondes (7 jours par défaut, 30 jours au plus) ;
 * `utilisations` est le nombre d'adhésions permises (10 par défaut, 100 au plus).
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { invitations, roomMembers, rooms } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { contexte, IdSalle, moi, SalleReponse } from '../schemas.js';
import { accesMj, detailSalle, evenementSalle } from '../salles/depot.js';
import { empreinte, FORME_CODE, nouveauCode } from './codes.js';

const JOUR = 24 * 3600;
export const EXPIRATION_DEFAUT = 7 * JOUR;
export const UTILISATIONS_DEFAUT = 10;

const perimee = (detail: string, code: string) =>
  new HttpError(410, 'Invitation périmée', code, detail);

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/rooms/:id/invitations',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdSalle }),
        body: z
          .object({
            expireDans: z
              .number()
              .int()
              .min(60)
              .max(30 * JOUR)
              .optional(),
            utilisations: z.number().int().min(1).max(100).optional(),
          })
          .default({}),
        response: {
          201: z.object({
            code: z.string(),
            url: z.string(),
            expireLe: z.string(),
            utilisations: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const userId = moi(req);
      const a = await accesMj(db, req.params.id, userId);
      const code = nouveauCode();
      const expireLe = new Date(
        deps.maintenant().getTime() + (req.body.expireDans ?? EXPIRATION_DEFAUT) * 1000,
      );
      const utilisations = req.body.utilisations ?? UTILISATIONS_DEFAUT;
      await db.insert(invitations).values({
        id: uuidv7(),
        roomId: a.salle.id,
        codeHash: empreinte(code),
        creePar: userId,
        expireLe,
        utilisationsMax: utilisations,
      });
      // Le code n'est renvoyé qu'ici, jamais journalisé ni stocké en clair
      reply.code(201).header('cache-control', 'no-store');
      return {
        code,
        url: new URL(`/rejoindre/${code}`, deps.config.APP_URL).toString(),
        expireLe: expireLe.toISOString(),
        utilisations,
      };
    },
  );

  r.post(
    '/v1/rooms/rejoindre',
    {
      ...auth,
      // Limite par IP : les codes sont longs, mais on ne laisse pas les deviner en boucle
      config: {
        rateLimit: { max: deps.config.RATE_LIMIT_REJOINDRE_MAX, timeWindow: '1 minute' },
      } as FastifyContextConfig,
      schema: {
        body: z.object({ code: z.string().trim().min(1).max(200) }),
        response: { 200: SalleReponse },
      },
    },
    async (req) => {
      const userId = moi(req);
      const code = req.body.code;
      if (!FORME_CODE.test(code)) throw HttpError.notFound('Invitation introuvable');
      const salle = await db.transaction(async (tx) => {
        const [invitation] = await tx
          .select()
          .from(invitations)
          .where(eq(invitations.codeHash, empreinte(code)))
          .for('update');
        if (!invitation) throw HttpError.notFound('Invitation introuvable');

        const [salle] = await tx.select().from(rooms).where(eq(rooms.id, invitation.roomId));
        const [deja] = await tx
          .select()
          .from(roomMembers)
          .where(and(eq(roomMembers.roomId, invitation.roomId), eq(roomMembers.userId, userId)));
        // Déjà membre : rien à consommer, on renvoie la salle
        if (deja) return { salle: salle!, role: deja.role };

        if (invitation.expireLe.getTime() <= deps.maintenant().getTime())
          throw perimee('Cette invitation a expiré', 'invitation_expiree');
        if (invitation.utilisations >= invitation.utilisationsMax)
          throw perimee(
            'Cette invitation a atteint son nombre d’utilisations',
            'invitation_epuisee',
          );

        await tx
          .update(invitations)
          .set({ utilisations: sql`${invitations.utilisations} + 1` })
          .where(eq(invitations.id, invitation.id));
        await tx.insert(roomMembers).values({ roomId: invitation.roomId, userId, role: 'joueur' });
        await evenementSalle(tx, contexte(req), {
          type: 'room.member_joined',
          roomId: invitation.roomId,
          userId,
          role: 'joueur',
          payload: { userId, role: 'joueur', invitationId: invitation.id },
        });
        return { salle: salle!, role: 'joueur' as const };
      });
      return detailSalle(deps, salle, req.headers.authorization);
    },
  );
};
