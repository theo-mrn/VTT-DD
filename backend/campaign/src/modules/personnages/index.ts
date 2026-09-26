/**
 * Module « personnages » : engagement de personnages dans une salle. Les
 * personnages restent dans character ; campaign enregistre seulement leur
 * engagement, avec un camp.
 *
 *   POST   /v1/rooms/:id/personnages                { characterId, camp? }
 *   DELETE /v1/rooms/:id/personnages/:characterId
 *
 * On n'engage que ses propres personnages (le MJ engage ainsi ses PNJ), et
 * seulement du système de la salle : engager un personnage donne au MJ le
 * droit de le modifier, il ne faut donc jamais pouvoir engager celui d'un autre.
 */
import { HttpError } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { roomCharacters } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { ErreurCharacter } from '../../clients/character.js';
import { retirerDuCombat } from '../combat/depot.js';
import { Camp, contexte, IdPersonnage, IdSalle, moi, SalleReponse } from '../schemas.js';
import { acces, detailSalle, evenementSalle, verrouillerSalle } from '../salles/depot.js';

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/rooms/:id/personnages',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdSalle }),
        body: z.object({ characterId: IdPersonnage, camp: Camp.optional() }),
        response: { 201: SalleReponse },
      },
    },
    async (req, reply) => {
      const userId = moi(req);
      const { characterId } = req.body;
      const a = await acces(db, req.params.id, userId);
      if (a.role === 'spectateur')
        throw HttpError.forbidden('Un spectateur n’engage pas de personnage');
      const camp = req.body.camp ?? (a.role === 'mj' ? 'adversaires' : 'joueurs');
      if (a.role !== 'mj' && camp === 'adversaires')
        throw HttpError.forbidden('Seul le MJ engage des adversaires');

      let resume;
      try {
        resume = await deps.character.resume(characterId, {
          userId,
          roomId: a.salle.id,
          correlationId: req.ctx.correlationId,
        });
      } catch (e) {
        if (e instanceof ErreurCharacter) {
          req.log.error({ erreur: e.message }, 'character injoignable');
          throw new HttpError(502, 'Service indisponible', 'character_indisponible');
        }
        throw e;
      }
      // Personnage d'un autre : introuvable, comme dans character
      if (!resume || resume.ownerId.toLowerCase() !== userId)
        throw HttpError.notFound('Personnage introuvable');
      if (resume.systeme.id !== a.salle.systemId)
        throw new HttpError(
          422,
          'Refusé',
          'systeme_different',
          `Ce personnage est du système ${resume.systeme.id}, la salle joue ${a.salle.systemId}`,
        );

      await db.transaction(async (tx) => {
        await verrouillerSalle(tx, a.salle.id);
        const inseres = await tx
          .insert(roomCharacters)
          .values({ roomId: a.salle.id, characterId, ownerId: userId, camp, ajoutePar: userId })
          .onConflictDoNothing()
          .returning();
        if (!inseres.length)
          throw HttpError.conflict('Ce personnage est déjà engagé dans la salle', 'deja_engage');
        await evenementSalle(tx, contexte(req), {
          type: 'room.character_added',
          roomId: a.salle.id,
          userId,
          role: a.role,
          payload: { characterId, camp, ownerId: userId, nom: resume.nom },
        });
      });
      reply.code(201);
      return detailSalle(deps, a, req.headers.authorization);
    },
  );

  r.delete(
    '/v1/rooms/:id/personnages/:characterId',
    { ...auth, schema: { params: z.object({ id: IdSalle, characterId: IdPersonnage }) } },
    async (req, reply) => {
      const userId = moi(req);
      const { characterId } = req.params;
      await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await acces(tx, req.params.id, userId);
        const [engagement] = await tx
          .select()
          .from(roomCharacters)
          .where(
            and(eq(roomCharacters.roomId, a.salle.id), eq(roomCharacters.characterId, characterId)),
          );
        if (!engagement) throw HttpError.notFound('Personnage non engagé dans cette salle');
        if (a.role !== 'mj' && engagement.ownerId !== userId)
          throw HttpError.forbidden('Seul le MJ ou son propriétaire retire ce personnage');
        const auteur = { userId, role: a.role };
        await retirerDuCombat(tx, contexte(req), a.salle.id, [characterId], auteur);
        await tx
          .delete(roomCharacters)
          .where(
            and(eq(roomCharacters.roomId, a.salle.id), eq(roomCharacters.characterId, characterId)),
          );
        await evenementSalle(tx, contexte(req), {
          type: 'room.character_removed',
          roomId: a.salle.id,
          ...auteur,
          payload: { characterId },
        });
      });
      reply.code(204);
    },
  );
};
