/**
 * Module « internal » : routes appelées par les autres services, jamais
 * relayées par la gateway (qui refuse tout /internal/*). Pas de jeton
 * utilisateur : le secret partagé INTERNAL_API_SECRET (en-tête
 * x-internal-secret, comparé à temps constant) est exigé. Sans ce secret
 * configuré, les routes n'existent pas.
 *
 *   GET /internal/campaigns/:campaignId/rights?userId=&characterId=
 *       rôle d'un utilisateur dans une campagne, et ses droits sur un
 *       personnage engagé (lecture : membre ; écriture : MJ ou propriétaire)
 *   GET /internal/characters/:characterId/campaigns-of?userId=
 *       droits d'un utilisateur sur un personnage, toutes campagnes confondues
 *       (interrogé par character quand l'appelant n'est pas propriétaire)
 */
import { and, eq } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignCharacters, campaignMembers } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { requireInternalSecret } from '../../internal/secret.js';
import { CampaignId, CharacterId, Role, Side, UserId } from '../schemas.js';

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
  const internal = {
    // Secret vérifié avant la validation : rien ne fuit sans lui
    preValidation: requireInternalSecret(secret),
    // Les appels viennent de character (peu d'IP) : limite large
    config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } as FastifyContextConfig,
  };

  r.get(
    '/internal/campaigns/:campaignId/rights',
    {
      ...internal,
      schema: {
        hide: true,
        params: z.object({ campaignId: CampaignId }),
        querystring: z.object({ userId: UserId, characterId: CharacterId.optional() }),
        response: {
          200: z.object({
            member: z.boolean(),
            role: Role.nullable(),
            character: z
              .object({
                engaged: z.boolean(),
                side: Side.nullable(),
                read: z.boolean(),
                write: z.boolean(),
              })
              .optional(),
          }),
        },
      },
    },
    async (req) => {
      const { campaignId } = req.params;
      const { userId, characterId } = req.query;
      const [member] = await db
        .select({ role: campaignMembers.role })
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
      const role = member?.role ?? null;
      if (!characterId) return { member: !!role, role };
      const [engagement] = await db
        .select()
        .from(campaignCharacters)
        .where(
          and(
            eq(campaignCharacters.campaignId, campaignId),
            eq(campaignCharacters.characterId, characterId),
          ),
        );
      const engaged = !!engagement;
      return {
        member: !!role,
        role,
        character: {
          engaged,
          side: engagement?.side ?? null,
          read: engaged && !!role,
          write: engaged && (role === 'gm' || engagement.ownerId === userId),
        },
      };
    },
  );

  r.get(
    '/internal/characters/:characterId/campaigns-of',
    {
      ...internal,
      schema: {
        hide: true,
        params: z.object({ characterId: CharacterId }),
        querystring: z.object({ userId: UserId }),
        response: {
          200: z.object({
            read: z.boolean(),
            write: z.boolean(),
            campaigns: z.array(z.object({ campaignId: z.string(), role: Role })),
          }),
        },
      },
    },
    async (req) => {
      // Campagnes où le personnage est engagé ET dont l'utilisateur est membre
      const found = await db
        .select({ campaignId: campaignCharacters.campaignId, role: campaignMembers.role })
        .from(campaignCharacters)
        .innerJoin(
          campaignMembers,
          and(
            eq(campaignMembers.campaignId, campaignCharacters.campaignId),
            eq(campaignMembers.userId, req.query.userId),
          ),
        )
        .where(eq(campaignCharacters.characterId, req.params.characterId));
      return {
        read: found.length > 0,
        write: found.some((c) => c.role === 'gm'),
        campaigns: found,
      };
    },
  );
};
