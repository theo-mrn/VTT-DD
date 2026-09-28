/**
 * Module « characters » : engagement de personnages dans une campagne. Les
 * personnages restent dans character ; campaign enregistre seulement leur
 * engagement, avec un camp, et le membre qui l'incarne.
 *
 *   GET    /v1/campaigns/:id/characters?kind=          personnages engagés, avec leur résumé
 *                                                       de character (membres) ; `kind` (pc, npc)
 *                                                       ne garde que les personnages joueurs ou
 *                                                       les PNJ
 *   POST   /v1/campaigns/:id/characters                { characterId, side? }
 *   DELETE /v1/campaigns/:id/characters/:characterId
 *   PUT    /v1/campaigns/:id/me/character              { characterId | null } : incarner
 *
 * On n'engage que ses propres personnages (le MJ engage ainsi ses PNJ), et
 * seulement du système de la campagne : engager un personnage donne au MJ le
 * droit de le modifier, il ne faut donc jamais pouvoir engager celui d'un autre.
 *
 * `characterCreation` faux : un joueur n'engage pas un personnage dont la
 * création est en cours (créé pour l'occasion) ; il engage un personnage
 * terminé. Le MJ n'est pas concerné.
 *
 * Incarner n'est pas posséder : un joueur incarne n'importe quel personnage du
 * camp des joueurs (ou un des siens), le MJ n'importe quel personnage engagé.
 * Un personnage n'a qu'un incarnateur : le choisir le reprend à celui qui
 * l'incarnait (plus de verrou). Les droits d'écriture sur la fiche restent au
 * propriétaire et au MJ (décidés par character).
 */
import { HttpError } from '@vtt/platform';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CharacterError, type CharacterKind } from '../../clients/character.js';
import { campaignCharacters } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import {
  access,
  campaignDetail,
  campaignEvent,
  lockCampaign,
  type Access,
} from '../campaigns/repository.js';
import { removeFromCombat } from '../combat/repository.js';
import {
  CampaignId,
  CampaignResponse,
  CharacterId,
  currentUser,
  eventContext,
  Side,
} from '../schemas.js';

const CampaignCharacter = z.object({
  characterId: z.string(),
  /** Depuis character ; null s'il est injoignable ou si le personnage n'existe plus. */
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  type: z.string().nullable(),
  /** Personnage joueur ou PNJ, depuis character ; null s'il ne le dit pas. */
  kind: z.enum(['pc', 'npc']).nullable(),
  side: Side,
  ownerId: z.string(),
  playedBy: z.string().nullable(),
  /** Création en cours : la fiche n'est pas terminée. */
  inCreation: z.boolean(),
  /** Résumé des listes (« Nain · Guerrier », « PV 12/14 ») ; null si character ne le donne pas. */
  summary: z
    .object({
      tagline: z.string(),
      highlights: z.array(z.object({ label: z.string(), value: z.string() })),
    })
    .nullable(),
});

/**
 * Personnages engagés, complétés par leur résumé dans character (appels parallèles).
 * `kind` ne garde que les personnages dont character confirme la nature : un
 * personnage dont le résumé manque (character injoignable) en est alors exclu.
 */
async function campaignCharactersOf(
  deps: Deps,
  a: Access,
  req: FastifyRequest,
  kind?: CharacterKind,
) {
  const engagements = await deps.db
    .select()
    .from(campaignCharacters)
    .where(eq(campaignCharacters.campaignId, a.campaign.id))
    .orderBy(asc(campaignCharacters.addedAt), asc(campaignCharacters.characterId));
  const origin = {
    userId: currentUser(req),
    campaignId: a.campaign.id,
    correlationId: req.ctx.correlationId,
  };
  const summaries = await Promise.all(
    engagements.map((e) =>
      deps.character.summary(e.characterId, origin).catch((error: unknown) => {
        // Une panne de character n'empêche pas d'afficher la campagne
        req.log.warn({ error: (error as Error).message }, 'résumé du personnage indisponible');
        return null;
      }),
    ),
  );
  const list = engagements.map((e, i) => ({
    characterId: e.characterId,
    name: summaries[i]?.name ?? null,
    avatarUrl: summaries[i]?.avatarUrl ?? null,
    type: summaries[i]?.type ?? null,
    kind: summaries[i]?.kind ?? null,
    side: e.side,
    ownerId: e.ownerId,
    playedBy: e.playedBy,
    inCreation: summaries[i]?.inCreation ?? false,
    summary: summaries[i]?.summary ?? null,
  }));
  return kind ? list.filter((c) => c.kind === kind) : list;
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/campaigns/:id/characters',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        querystring: z.object({ kind: z.enum(['pc', 'npc']).optional() }),
        response: { 200: z.array(CampaignCharacter) },
      },
    },
    async (req) =>
      campaignCharactersOf(
        deps,
        await access(db, req.params.id, currentUser(req)),
        req,
        req.query.kind,
      ),
  );

  r.post(
    '/v1/campaigns/:id/characters',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        body: z.object({ characterId: CharacterId, side: Side.optional() }),
        response: { 201: CampaignResponse },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const { characterId } = req.body;
      const a = await access(db, req.params.id, userId);
      if (a.role === 'spectator')
        throw HttpError.forbidden('Un spectateur n’engage pas de personnage');
      const side = req.body.side ?? (a.role === 'gm' ? 'enemies' : 'players');
      if (a.role !== 'gm' && side === 'enemies')
        throw HttpError.forbidden('Seul le MJ engage des adversaires');

      let summary;
      try {
        summary = await deps.character.summary(characterId, {
          userId,
          campaignId: a.campaign.id,
          correlationId: req.ctx.correlationId,
        });
      } catch (e) {
        if (e instanceof CharacterError) {
          req.log.error({ error: e.message }, 'character injoignable');
          throw new HttpError(502, 'Service indisponible', 'character_unavailable');
        }
        throw e;
      }
      // Personnage d'un autre : introuvable, comme dans character
      if (!summary || summary.ownerId.toLowerCase() !== userId)
        throw HttpError.notFound('Personnage introuvable');
      if (summary.system.id !== a.campaign.systemId)
        throw new HttpError(
          422,
          'Refusé',
          'system_mismatch',
          `Ce personnage est du système ${summary.system.id}, la campagne joue ${a.campaign.systemId}`,
        );
      if (summary.inCreation && a.role !== 'gm' && !a.campaign.characterCreation)
        throw new HttpError(
          403,
          'Accès refusé',
          'character_creation_forbidden',
          'Le MJ n’autorise pas la création de personnages dans cette campagne : engagez un personnage terminé',
        );

      await db.transaction(async (tx) => {
        await lockCampaign(tx, a.campaign.id);
        const inserted = await tx
          .insert(campaignCharacters)
          .values({
            campaignId: a.campaign.id,
            characterId,
            ownerId: userId,
            side,
            addedBy: userId,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted.length)
          throw HttpError.conflict(
            'Ce personnage est déjà engagé dans la campagne',
            'already_engaged',
          );
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.character_added',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: { characterId, side, ownerId: userId, name: summary.name },
        });
      });
      reply.code(201);
      return campaignDetail(deps, a, req);
    },
  );

  r.delete(
    '/v1/campaigns/:id/characters/:characterId',
    { ...auth, schema: { params: z.object({ id: CampaignId, characterId: CharacterId }) } },
    async (req, reply) => {
      const userId = currentUser(req);
      const { characterId } = req.params;
      await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await access(tx, req.params.id, userId);
        const inCampaign = and(
          eq(campaignCharacters.campaignId, a.campaign.id),
          eq(campaignCharacters.characterId, characterId),
        );
        const [engagement] = await tx.select().from(campaignCharacters).where(inCampaign);
        if (!engagement) throw HttpError.notFound('Personnage non engagé dans cette campagne');
        if (a.role !== 'gm' && engagement.ownerId !== userId)
          throw HttpError.forbidden('Seul le MJ ou son propriétaire retire ce personnage');
        const actor = { userId, role: a.role };
        await removeFromCombat(tx, eventContext(req), a.campaign.id, [characterId], actor);
        await tx.delete(campaignCharacters).where(inCampaign);
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.character_removed',
          campaignId: a.campaign.id,
          ...actor,
          payload: { characterId },
        });
      });
      reply.code(204);
    },
  );

  r.put(
    '/v1/campaigns/:id/me/character',
    {
      ...auth,
      schema: {
        params: z.object({ id: CampaignId }),
        body: z.object({ characterId: CharacterId.nullable() }),
        response: { 200: z.array(CampaignCharacter) },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { characterId } = req.body;
      const a = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await access(tx, req.params.id, userId);
        if (a.role === 'spectator')
          throw HttpError.forbidden('Un spectateur n’incarne pas de personnage');
        const inCampaign = eq(campaignCharacters.campaignId, a.campaign.id);
        const [current] = await tx
          .select({ characterId: campaignCharacters.characterId })
          .from(campaignCharacters)
          .where(and(inCampaign, eq(campaignCharacters.playedBy, userId)));
        if ((current?.characterId ?? null) === characterId) return a;
        let takenFrom: string | null = null;

        if (characterId) {
          const [engagement] = await tx
            .select()
            .from(campaignCharacters)
            .where(and(inCampaign, eq(campaignCharacters.characterId, characterId)));
          if (!engagement)
            throw new HttpError(
              404,
              'Ressource introuvable',
              'character_not_engaged',
              'Personnage non engagé dans cette campagne',
            );
          if (a.role !== 'gm' && engagement.ownerId !== userId && engagement.side !== 'players')
            throw HttpError.forbidden(
              'Un joueur incarne un personnage du camp des joueurs, ou un des siens',
            );
          // Incarné par un autre membre : il le lui reprend (plus de verrou)
          takenFrom = engagement.playedBy;
        }
        // Un membre incarne un seul personnage : l'ancien est libéré
        await tx
          .update(campaignCharacters)
          .set({ playedBy: null })
          .where(and(inCampaign, eq(campaignCharacters.playedBy, userId)));
        if (characterId)
          await tx
            .update(campaignCharacters)
            .set({ playedBy: userId })
            .where(and(inCampaign, eq(campaignCharacters.characterId, characterId)));
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.character_played',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: {
            userId,
            characterId,
            previousCharacterId: current?.characterId ?? null,
            takenFrom,
          },
        });
        return a;
      });
      return campaignCharactersOf(deps, a, req);
    },
  );
};
