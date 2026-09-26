/**
 * Module « salles » : salles de jeu, membres et rôles (contrat :
 * docs/api-campaign.md). Toutes les routes demandent un jeton d'accès.
 *
 *   GET    /v1/rooms                       mes salles
 *   POST   /v1/rooms                       créer (le créateur est MJ propriétaire)
 *   GET    /v1/rooms/:id                   détail (membres)
 *   PATCH  /v1/rooms/:id                   modifier (MJ)
 *   DELETE /v1/rooms/:id                   supprimer (MJ propriétaire)
 *   PATCH  /v1/rooms/:id/membres/:userId   changer un rôle (MJ)
 *   DELETE /v1/rooms/:id/membres/:userId   exclure (MJ) ou quitter (soi-même)
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { roomCharacters, roomMembers, rooms } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { retirerDuCombat } from '../combat/depot.js';
import {
  contexte,
  Description,
  IdSalle,
  IdSysteme,
  IdUtilisateur,
  moi,
  Nom,
  Role,
  SalleReponse,
} from '../schemas.js';
import { acces, accesMj, detailSalle, evenementSalle, verrouillerSalle } from './depot.js';

const Params = z.object({ id: IdSalle });
const ParamsMembre = z.object({ id: IdSalle, userId: IdUtilisateur });

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalogue } = deps;
  const auth = { preValidation: app.authenticate };

  const systemeConnu = (id: string) => {
    const s = catalogue.systeme(id);
    if (!s) throw HttpError.badRequest(`Système inconnu : ${id}`, 'systeme_inconnu');
    return s;
  };

  r.get(
    '/v1/rooms',
    {
      ...auth,
      schema: {
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              nom: z.string(),
              role: Role,
              systeme: z.object({ id: z.string(), version: z.string() }),
              membres: z.number().int(),
              updatedAt: z.string(),
            }),
          ),
        },
      },
    },
    async (req) => {
      const effectif = db
        .select({ roomId: roomMembers.roomId, n: count().as('n') })
        .from(roomMembers)
        .groupBy(roomMembers.roomId)
        .as('effectif');
      const lignes = await db
        .select({ salle: rooms, role: roomMembers.role, membres: effectif.n })
        .from(roomMembers)
        .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
        .innerJoin(effectif, eq(effectif.roomId, rooms.id))
        .where(eq(roomMembers.userId, moi(req)))
        .orderBy(desc(rooms.updatedAt), desc(rooms.id));
      return lignes.map((l) => ({
        id: l.salle.id,
        nom: l.salle.nom,
        role: l.role,
        systeme: { id: l.salle.systemId, version: l.salle.systemVersion },
        membres: Number(l.membres),
        updatedAt: l.salle.updatedAt.toISOString(),
      }));
    },
  );

  r.post(
    '/v1/rooms',
    {
      ...auth,
      schema: {
        body: z.object({ nom: Nom, systemeId: IdSysteme, description: Description.optional() }),
        response: { 201: SalleReponse },
      },
    },
    async (req, reply) => {
      const systeme = systemeConnu(req.body.systemeId);
      const userId = moi(req);
      const id = uuidv7();
      const salle = await db.transaction(async (tx) => {
        const [salle] = await tx
          .insert(rooms)
          .values({
            id,
            nom: req.body.nom,
            description: req.body.description ?? '',
            systemId: systeme.id,
            systemVersion: systeme.version,
            ownerId: userId,
          })
          .returning();
        await tx.insert(roomMembers).values({ roomId: id, userId, role: 'mj' });
        await evenementSalle(tx, contexte(req), {
          type: 'room.created',
          roomId: id,
          userId,
          role: 'mj',
          payload: { nom: salle!.nom, systeme: { id: systeme.id, version: systeme.version } },
        });
        return salle!;
      });
      reply.code(201);
      return detailSalle(deps, { salle, role: 'mj' }, req.headers.authorization);
    },
  );

  r.get(
    '/v1/rooms/:id',
    { ...auth, schema: { params: Params, response: { 200: SalleReponse } } },
    async (req) =>
      detailSalle(deps, await acces(db, req.params.id, moi(req)), req.headers.authorization),
  );

  r.patch(
    '/v1/rooms/:id',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          nom: Nom.optional(),
          description: Description.optional(),
          systemeId: IdSysteme.optional(),
        }),
        response: { 200: SalleReponse },
      },
    },
    async (req) => {
      const userId = moi(req);
      const { nom, description, systemeId } = req.body;
      const salle = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await accesMj(tx, req.params.id, userId);
        const systeme = systemeId ? systemeConnu(systemeId) : undefined;
        if (systeme && systeme.id !== a.salle.systemId) {
          // Les personnages engagés sont tous du système de la salle
          const [engages] = await tx
            .select({ n: count() })
            .from(roomCharacters)
            .where(eq(roomCharacters.roomId, a.salle.id));
          if (engages!.n > 0)
            throw HttpError.conflict(
              'Retirez d’abord les personnages engagés pour changer de système',
              'personnages_engages',
            );
        }
        const changements = {
          ...(nom !== undefined ? { nom } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(systeme ? { systemId: systeme.id, systemVersion: systeme.version } : {}),
        };
        const [suivante] = await tx
          .update(rooms)
          .set({ ...changements, version: a.salle.version + 1, updatedAt: sql`now()` })
          .where(eq(rooms.id, a.salle.id))
          .returning();
        await evenementSalle(tx, contexte(req), {
          type: 'room.updated',
          roomId: a.salle.id,
          userId,
          role: a.role,
          payload: { version: suivante!.version, ...changements },
        });
        return suivante!;
      });
      return detailSalle(deps, { salle, role: 'mj' }, req.headers.authorization);
    },
  );

  r.delete('/v1/rooms/:id', { ...auth, schema: { params: Params } }, async (req, reply) => {
    const userId = moi(req);
    await db.transaction(async (tx) => {
      await verrouillerSalle(tx, req.params.id);
      const a = await acces(tx, req.params.id, userId);
      if (a.salle.ownerId !== userId)
        throw HttpError.forbidden('Seul le MJ propriétaire peut supprimer la salle');
      // Membres, invitations, engagements et combat suivent (ON DELETE CASCADE)
      await tx.delete(rooms).where(eq(rooms.id, a.salle.id));
      await evenementSalle(tx, contexte(req), {
        type: 'room.deleted',
        roomId: a.salle.id,
        userId,
        role: a.role,
        payload: { nom: a.salle.nom },
      });
    });
    reply.code(204);
  });

  // ─── Membres ───────────────────────────────────────────────────────────────

  r.patch(
    '/v1/rooms/:id/membres/:userId',
    {
      ...auth,
      schema: {
        params: ParamsMembre,
        body: z.object({ role: Role }),
        response: { 200: SalleReponse },
      },
    },
    async (req) => {
      const userId = moi(req);
      const cible = req.params.userId;
      const salle = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await accesMj(tx, req.params.id, userId);
        if (cible === a.salle.ownerId)
          throw HttpError.conflict('Le MJ propriétaire reste MJ de sa salle', 'proprietaire');
        const [membre] = await tx
          .select()
          .from(roomMembers)
          .where(and(eq(roomMembers.roomId, a.salle.id), eq(roomMembers.userId, cible)));
        if (!membre) throw HttpError.notFound('Membre introuvable');
        if (membre.role !== req.body.role) {
          await tx
            .update(roomMembers)
            .set({ role: req.body.role })
            .where(and(eq(roomMembers.roomId, a.salle.id), eq(roomMembers.userId, cible)));
          await evenementSalle(tx, contexte(req), {
            type: 'room.member_role_changed',
            roomId: a.salle.id,
            userId,
            role: a.role,
            payload: { userId: cible, role: req.body.role, ancien: membre.role },
          });
        }
        return a.salle;
      });
      return detailSalle(deps, { salle, role: 'mj' }, req.headers.authorization);
    },
  );

  r.delete(
    '/v1/rooms/:id/membres/:userId',
    { ...auth, schema: { params: ParamsMembre } },
    async (req, reply) => {
      const userId = moi(req);
      const cible = req.params.userId;
      await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await acces(tx, req.params.id, userId);
        if (cible !== userId && a.role !== 'mj')
          throw HttpError.forbidden('Seul le MJ peut exclure un membre');
        if (cible === a.salle.ownerId)
          throw HttpError.conflict(
            'Le MJ propriétaire ne quitte pas sa salle : il peut la supprimer',
            'proprietaire',
          );
        const [membre] = await tx
          .delete(roomMembers)
          .where(and(eq(roomMembers.roomId, a.salle.id), eq(roomMembers.userId, cible)))
          .returning();
        if (!membre) throw HttpError.notFound('Membre introuvable');

        // Ses personnages quittent la salle avec lui (et le combat en cours)
        const siens = await tx
          .select({ characterId: roomCharacters.characterId })
          .from(roomCharacters)
          .where(and(eq(roomCharacters.roomId, a.salle.id), eq(roomCharacters.ownerId, cible)));
        const ids = siens.map((s) => s.characterId);
        const auteur = { userId, role: a.role };
        if (ids.length) {
          await retirerDuCombat(tx, contexte(req), a.salle.id, ids, auteur);
          await tx
            .delete(roomCharacters)
            .where(
              and(eq(roomCharacters.roomId, a.salle.id), inArray(roomCharacters.characterId, ids)),
            );
          for (const characterId of ids) {
            await evenementSalle(tx, contexte(req), {
              type: 'room.character_removed',
              roomId: a.salle.id,
              ...auteur,
              payload: { characterId, raison: 'membre_parti' },
            });
          }
        }
        await evenementSalle(tx, contexte(req), {
          type: 'room.member_left',
          roomId: a.salle.id,
          ...auteur,
          payload: { userId: cible, role: membre.role, exclu: cible !== userId },
        });
      });
      reply.code(204);
    },
  );
};
