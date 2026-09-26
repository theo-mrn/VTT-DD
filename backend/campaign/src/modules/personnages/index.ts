/**
 * Module « personnages » : engagement de personnages dans une salle. Les
 * personnages restent dans character ; campaign enregistre seulement leur
 * engagement, avec un camp, et le membre qui l'incarne.
 *
 *   GET    /v1/rooms/:id/personnages                personnages engagés (membres)
 *   POST   /v1/rooms/:id/personnages                { characterId, camp? }
 *   DELETE /v1/rooms/:id/personnages/:characterId
 *   PUT    /v1/rooms/:id/moi/personnage             { characterId | null } : incarner
 *
 * On n'engage que ses propres personnages (le MJ engage ainsi ses PNJ), et
 * seulement du système de la salle : engager un personnage donne au MJ le
 * droit de le modifier, il ne faut donc jamais pouvoir engager celui d'un autre.
 *
 * `creationPersonnages` faux : un joueur n'engage pas un personnage dont la
 * création est en cours (créé pour l'occasion) ; il engage un personnage
 * terminé. Le MJ n'est pas concerné.
 */
import { HttpError } from '@vtt/platform';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { roomCharacters } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { ErreurCharacter } from '../../clients/character.js';
import { retirerDuCombat } from '../combat/depot.js';
import { Camp, contexte, IdPersonnage, IdSalle, moi, SalleReponse } from '../schemas.js';
import {
  acces,
  detailSalle,
  evenementSalle,
  verrouillerSalle,
  type Acces,
} from '../salles/depot.js';

const PersonnageSalle = z.object({
  characterId: z.string(),
  /** Depuis character ; null s'il est injoignable ou si le personnage n'existe plus. */
  nom: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  type: z.string().nullable(),
  camp: Camp,
  proprietaireId: z.string(),
  incarnePar: z.string().nullable(),
  /** Création en cours : la fiche n'est pas terminée. */
  creation: z.boolean(),
});

/** Personnages engagés, complétés par leur résumé dans character (appels parallèles). */
async function personnagesSalle(deps: Deps, a: Acces, req: FastifyRequest) {
  const engagements = await deps.db
    .select()
    .from(roomCharacters)
    .where(eq(roomCharacters.roomId, a.salle.id))
    .orderBy(asc(roomCharacters.ajouteLe), asc(roomCharacters.characterId));
  const origine = { userId: moi(req), roomId: a.salle.id, correlationId: req.ctx.correlationId };
  const resumes = await Promise.all(
    engagements.map((e) =>
      deps.character.resume(e.characterId, origine).catch((erreur: unknown) => {
        // Une panne de character n'empêche pas d'afficher la salle
        req.log.warn({ erreur: (erreur as Error).message }, 'résumé du personnage indisponible');
        return null;
      }),
    ),
  );
  return engagements.map((e, i) => ({
    characterId: e.characterId,
    nom: resumes[i]?.nom ?? null,
    avatarUrl: resumes[i]?.avatarUrl ?? null,
    type: resumes[i]?.type ?? null,
    camp: e.camp,
    proprietaireId: e.ownerId,
    incarnePar: e.incarnePar,
    creation: resumes[i]?.creation ?? false,
  }));
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/rooms/:id/personnages',
    {
      ...auth,
      schema: { params: z.object({ id: IdSalle }), response: { 200: z.array(PersonnageSalle) } },
    },
    async (req) => personnagesSalle(deps, await acces(db, req.params.id, moi(req)), req),
  );

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
      if (resume.creation && a.role !== 'mj' && !a.salle.creationPersonnages)
        throw new HttpError(
          403,
          'Accès refusé',
          'creation_interdite',
          'Le MJ n’autorise pas la création de personnages dans cette salle : engagez un personnage terminé',
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
      return detailSalle(deps, a, req);
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

  r.put(
    '/v1/rooms/:id/moi/personnage',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdSalle }),
        body: z.object({ characterId: IdPersonnage.nullable() }),
        response: { 200: z.array(PersonnageSalle) },
      },
    },
    async (req) => {
      const userId = moi(req);
      const { characterId } = req.body;
      const a = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await acces(tx, req.params.id, userId);
        if (a.role === 'spectateur')
          throw HttpError.forbidden('Un spectateur n’incarne pas de personnage');
        const dansLaSalle = eq(roomCharacters.roomId, a.salle.id);
        const [actuel] = await tx
          .select({ characterId: roomCharacters.characterId })
          .from(roomCharacters)
          .where(and(dansLaSalle, eq(roomCharacters.incarnePar, userId)));
        if ((actuel?.characterId ?? null) === characterId) return a;

        if (characterId) {
          const [engagement] = await tx
            .select()
            .from(roomCharacters)
            .where(and(dansLaSalle, eq(roomCharacters.characterId, characterId)));
          if (!engagement)
            throw new HttpError(
              404,
              'Ressource introuvable',
              'personnage_non_engage',
              'Personnage non engagé dans cette salle',
            );
          if (a.role !== 'mj' && engagement.ownerId !== userId)
            throw HttpError.forbidden('Un joueur n’incarne que ses propres personnages');
          if (engagement.incarnePar && engagement.incarnePar !== userId)
            throw HttpError.conflict(
              'Ce personnage est déjà incarné par un autre membre',
              'personnage_pris',
            );
        }
        // Un membre incarne un seul personnage : l'ancien est libéré
        await tx
          .update(roomCharacters)
          .set({ incarnePar: null })
          .where(and(dansLaSalle, eq(roomCharacters.incarnePar, userId)));
        if (characterId)
          await tx
            .update(roomCharacters)
            .set({ incarnePar: userId })
            .where(and(dansLaSalle, eq(roomCharacters.characterId, characterId)));
        await evenementSalle(tx, contexte(req), {
          type: 'room.character_embodied',
          roomId: a.salle.id,
          userId,
          role: a.role,
          payload: { userId, characterId, ancien: actuel?.characterId ?? null },
        });
        return a;
      });
      return personnagesSalle(deps, a, req);
    },
  );
};
