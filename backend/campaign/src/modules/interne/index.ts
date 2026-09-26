/**
 * Module « interne » : routes appelées par les autres services, jamais
 * relayées par la gateway (qui refuse tout /internal/*). Pas de jeton
 * utilisateur : le secret partagé INTERNAL_API_SECRET (en-tête
 * x-internal-secret, comparé à temps constant) est exigé. Sans ce secret
 * configuré, les routes n'existent pas.
 *
 *   GET /internal/rooms/:roomId/droits?userId=&characterId=
 *       rôle d'un utilisateur dans une salle, et ses droits sur un personnage
 *       engagé (lecture : membre ; écriture : MJ ou propriétaire)
 *   GET /internal/characters/:characterId/salles-de?userId=
 *       droits d'un utilisateur sur un personnage, toutes salles confondues
 *       (interrogé par character quand l'appelant n'est pas propriétaire)
 */
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { roomCharacters, roomMembers } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { exigerSecretInterne } from '../../interne/secret.js';
import { Camp, IdPersonnage, IdSalle, IdUtilisateur, Role } from '../schemas.js';

export const register: Module = async (app, deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) {
    app.log.warn(
      'INTERNAL_API_SECRET absent : routes internes (droits pour character) désactivées',
    );
    return;
  }
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const interne = {
    // Secret vérifié avant la validation : rien ne fuit sans lui
    preValidation: exigerSecretInterne(secret),
    // Les appels viennent de character (peu d'IP) : limite large
    config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } as FastifyContextConfig,
  };

  r.get(
    '/internal/rooms/:roomId/droits',
    {
      ...interne,
      schema: {
        hide: true,
        params: z.object({ roomId: IdSalle }),
        querystring: z.object({ userId: IdUtilisateur, characterId: IdPersonnage.optional() }),
        response: {
          200: z.object({
            membre: z.boolean(),
            role: Role.nullable(),
            personnage: z
              .object({
                engage: z.boolean(),
                camp: Camp.nullable(),
                lecture: z.boolean(),
                ecriture: z.boolean(),
              })
              .optional(),
          }),
        },
      },
    },
    async (req) => {
      const { roomId } = req.params;
      const { userId, characterId } = req.query;
      const [membre] = await db
        .select({ role: roomMembers.role })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
      const role = membre?.role ?? null;
      if (!characterId) return { membre: !!role, role };
      const [engagement] = await db
        .select()
        .from(roomCharacters)
        .where(and(eq(roomCharacters.roomId, roomId), eq(roomCharacters.characterId, characterId)));
      const engage = !!engagement;
      return {
        membre: !!role,
        role,
        personnage: {
          engage,
          camp: engagement?.camp ?? null,
          lecture: engage && !!role,
          ecriture: engage && (role === 'mj' || engagement.ownerId === userId),
        },
      };
    },
  );

  r.get(
    '/internal/characters/:characterId/salles-de',
    {
      ...interne,
      schema: {
        hide: true,
        params: z.object({ characterId: IdPersonnage }),
        querystring: z.object({ userId: IdUtilisateur }),
        response: {
          200: z.object({
            lecture: z.boolean(),
            ecriture: z.boolean(),
            salles: z.array(z.object({ roomId: z.string(), role: Role })),
          }),
        },
      },
    },
    async (req) => {
      // Salles où le personnage est engagé ET dont l'utilisateur est membre
      const salles = await db
        .select({ roomId: roomCharacters.roomId, role: roomMembers.role })
        .from(roomCharacters)
        .innerJoin(
          roomMembers,
          and(
            eq(roomMembers.roomId, roomCharacters.roomId),
            eq(roomMembers.userId, req.query.userId),
          ),
        )
        .where(eq(roomCharacters.characterId, req.params.characterId));
      return {
        lecture: salles.length > 0,
        ecriture: salles.some((s) => s.role === 'mj'),
        salles,
      };
    },
  );
};
