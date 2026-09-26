/**
 * Module « salles » : salles de jeu, membres et rôles (contrat :
 * docs/api-campaign.md). Toutes les routes demandent un jeton d'accès.
 *
 *   GET    /v1/rooms?role=                 mes salles
 *   GET    /v1/rooms/publiques             campagnes publiques (recherche, pages)
 *   POST   /v1/rooms                       créer (le créateur est MJ propriétaire, code généré)
 *   GET    /v1/rooms/:id                   détail (membres)
 *   PATCH  /v1/rooms/:id                   modifier (MJ)
 *   DELETE /v1/rooms/:id                   supprimer (MJ propriétaire)
 *   POST   /v1/rooms/:id/image             URL d'envoi de l'image (MJ)
 *   PATCH  /v1/rooms/:id/membres/:userId   changer un rôle (MJ)
 *   DELETE /v1/rooms/:id/membres/:userId   exclure, ?bannir=true (MJ) ou quitter (soi-même)
 *   GET    /v1/rooms/:id/bannis            bannissements (MJ)
 *   DELETE /v1/rooms/:id/bannis/:userId    lever un bannissement (MJ)
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { roomBans, roomCharacters, roomMembers, rooms } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  basePublique,
  cleImage,
  EXPIRATION_ENVOI,
  IMAGE_MAX_OCTETS,
  TYPES_IMAGE,
  urlImageAcceptee,
} from '../../stockage/images.js';
import { retirerDuCombat } from '../combat/depot.js';
import {
  contexte,
  Description,
  IdSalle,
  IdSysteme,
  IdUtilisateur,
  MAX_JOUEURS_DEFAUT,
  MaxJoueurs,
  moi,
  Nom,
  ResumeSalle,
  Role,
  SalleReponse,
} from '../schemas.js';
import { nouveauCodeSalle, normaliserCodeSalle } from './code.js';
import {
  acces,
  accesMj,
  detailSalle,
  effectifs,
  evenementSalle,
  resumesSalles,
  utilisateurApi,
  verrouillerSalle,
} from './depot.js';

const Params = z.object({ id: IdSalle });
const ParamsMembre = z.object({ id: IdSalle, userId: IdUtilisateur });

/** Campagnes publiques par page. */
export const PAR_PAGE = 20;

/** Tentatives de génération d'un code libre (collision très improbable). */
const ESSAIS_CODE = 5;

/** Limite par IP des demandes d'URL d'envoi, comme les avatars. */
const LIMITE_ENVOIS = {
  rateLimit: { max: 20, timeWindow: '1 minute' },
} as FastifyContextConfig;

const stockageIndisponible = () =>
  new HttpError(
    503,
    'Service indisponible',
    'stockage_indisponible',
    'L’envoi d’images n’est pas configuré sur ce serveur',
  );

/** Échappe les jokers de LIKE (%, _ et le caractère d'échappement \). */
const echapperLike = (texte: string) => texte.replace(/[\\%_]/g, (c) => `\\${c}`);

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalogue } = deps;
  const auth = { preValidation: app.authenticate };
  const base = basePublique(deps.config.S3_PUBLIC_URL);

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
        querystring: z.object({ role: Role.optional() }),
        response: { 200: z.array(ResumeSalle) },
      },
    },
    async (req) => {
      const effectif = effectifs(db);
      const lignes = await db
        .select({
          salle: rooms,
          role: roomMembers.role,
          membres: effectif.membres,
          joueurs: effectif.joueurs,
        })
        .from(roomMembers)
        .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
        .innerJoin(effectif, eq(effectif.roomId, rooms.id))
        .where(
          and(
            eq(roomMembers.userId, moi(req)),
            req.query.role ? eq(roomMembers.role, req.query.role) : undefined,
          ),
        )
        .orderBy(desc(rooms.updatedAt), desc(rooms.id));
      return resumesSalles(deps, lignes, req.headers.authorization);
    },
  );

  r.get(
    '/v1/rooms/publiques',
    {
      ...auth,
      schema: {
        querystring: z.object({
          search: z.string().trim().max(100).optional(),
          page: z.coerce.number().int().min(1).max(1000).default(1),
        }),
        response: {
          200: z.object({
            salles: z.array(ResumeSalle),
            page: z.number().int(),
            parPage: z.number().int(),
            total: z.number().int(),
          }),
        },
      },
    },
    async (req) => {
      const { search, page } = req.query;
      const motif = search ? `%${echapperLike(search)}%` : null;
      const filtre = and(
        eq(rooms.publique, true),
        motif
          ? or(
              ilike(rooms.nom, motif),
              ilike(rooms.description, motif),
              eq(rooms.code, normaliserCodeSalle(search!)),
            )
          : undefined,
      );
      const effectif = effectifs(db);
      const moiMembre = db
        .select({ roomId: roomMembers.roomId, role: roomMembers.role })
        .from(roomMembers)
        .where(eq(roomMembers.userId, moi(req)))
        .as('moi');
      const [lignes, [total]] = await Promise.all([
        db
          .select({
            salle: rooms,
            role: moiMembre.role,
            membres: effectif.membres,
            joueurs: effectif.joueurs,
          })
          .from(rooms)
          .innerJoin(effectif, eq(effectif.roomId, rooms.id))
          .leftJoin(moiMembre, eq(moiMembre.roomId, rooms.id))
          .where(filtre)
          .orderBy(desc(rooms.updatedAt), desc(rooms.id))
          .limit(PAR_PAGE)
          .offset((page - 1) * PAR_PAGE),
        db.select({ n: count() }).from(rooms).where(filtre),
      ]);
      return {
        salles: await resumesSalles(deps, lignes, req.headers.authorization),
        page,
        parPage: PAR_PAGE,
        total: total!.n,
      };
    },
  );

  r.post(
    '/v1/rooms',
    {
      ...auth,
      schema: {
        body: z.object({
          nom: Nom,
          systemeId: IdSysteme,
          description: Description.optional(),
          maxJoueurs: MaxJoueurs.optional(),
          publique: z.boolean().optional(),
          creationPersonnages: z.boolean().optional(),
        }),
        response: { 201: SalleReponse },
      },
    },
    async (req, reply) => {
      const systeme = systemeConnu(req.body.systemeId);
      const userId = moi(req);
      const id = uuidv7();
      const salle = await db.transaction(async (tx) => {
        let salle: typeof rooms.$inferSelect | undefined;
        // Code déjà pris : on en tire un autre (sans interrompre la transaction)
        for (let essai = 0; !salle && essai < ESSAIS_CODE; essai++) {
          [salle] = await tx
            .insert(rooms)
            .values({
              id,
              nom: req.body.nom,
              description: req.body.description ?? '',
              systemId: systeme.id,
              systemVersion: systeme.version,
              ownerId: userId,
              code: nouveauCodeSalle(),
              maxJoueurs: req.body.maxJoueurs ?? MAX_JOUEURS_DEFAUT,
              publique: req.body.publique ?? false,
              creationPersonnages: req.body.creationPersonnages ?? true,
            })
            .onConflictDoNothing({ target: rooms.code })
            .returning();
        }
        if (!salle) throw new Error('Aucun code de salle libre après plusieurs essais');
        await tx.insert(roomMembers).values({ roomId: id, userId, role: 'mj' });
        await evenementSalle(tx, contexte(req), {
          type: 'room.created',
          roomId: id,
          userId,
          role: 'mj',
          payload: {
            nom: salle.nom,
            code: salle.code,
            publique: salle.publique,
            systeme: { id: systeme.id, version: systeme.version },
          },
        });
        return salle;
      });
      reply.code(201);
      return detailSalle(deps, { salle, role: 'mj' }, req);
    },
  );

  r.get(
    '/v1/rooms/:id',
    { ...auth, schema: { params: Params, response: { 200: SalleReponse } } },
    async (req) => detailSalle(deps, await acces(db, req.params.id, moi(req)), req),
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
          maxJoueurs: MaxJoueurs.optional(),
          publique: z.boolean().optional(),
          creationPersonnages: z.boolean().optional(),
          // Vérifiée ensuite contre le dossier de la salle sur le stockage
          imageUrl: z.string().max(2048).nullable().optional(),
        }),
        response: { 200: SalleReponse },
      },
    },
    async (req) => {
      const userId = moi(req);
      const { nom, description, systemeId, imageUrl, maxJoueurs, publique, creationPersonnages } =
        req.body;
      const salle = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await accesMj(tx, req.params.id, userId);
        if (
          imageUrl !== undefined &&
          !urlImageAcceptee(imageUrl, a.salle.imageUrl, base, a.salle.id)
        )
          throw HttpError.badRequest(
            'L’image doit avoir été envoyée par POST /v1/rooms/:id/image',
            'image_invalide',
          );
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
          ...(imageUrl !== undefined ? { imageUrl } : {}),
          ...(maxJoueurs !== undefined ? { maxJoueurs } : {}),
          ...(publique !== undefined ? { publique } : {}),
          ...(creationPersonnages !== undefined ? { creationPersonnages } : {}),
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
      return detailSalle(deps, { salle, role: 'mj' }, req);
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

  r.post(
    '/v1/rooms/:id/image',
    {
      config: LIMITE_ENVOIS,
      // Fonction fléchée : passer app.authenticate tel quel fige le type de `config` sans rateLimit
      preValidation: (req, reply) => app.authenticate(req, reply),
      schema: {
        params: Params,
        body: z.object({
          contentType: z.enum(TYPES_IMAGE),
          size: z.number().int().min(1).max(IMAGE_MAX_OCTETS),
        }),
        response: {
          200: z.object({ uploadUrl: z.string(), publicUrl: z.string(), expiresIn: z.number() }),
        },
      },
    },
    async (req) => {
      const a = await accesMj(db, req.params.id, moi(req));
      if (!deps.signataire || !base) throw stockageIndisponible();
      const cle = cleImage(a.salle.id, req.body.contentType);
      let uploadUrl: string;
      try {
        uploadUrl = await deps.signataire({
          cle,
          contentType: req.body.contentType,
          taille: req.body.size,
          expiresIn: EXPIRATION_ENVOI,
        });
      } catch (err) {
        req.log.error({ err }, 'signature de l’URL d’envoi impossible');
        throw stockageIndisponible();
      }
      return { uploadUrl, publicUrl: `${base}/${cle}`, expiresIn: EXPIRATION_ENVOI };
    },
  );

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
          // Un spectateur n'incarne personne
          if (req.body.role === 'spectateur')
            await tx
              .update(roomCharacters)
              .set({ incarnePar: null })
              .where(
                and(eq(roomCharacters.roomId, a.salle.id), eq(roomCharacters.incarnePar, cible)),
              );
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
      return detailSalle(deps, { salle, role: 'mj' }, req);
    },
  );

  r.delete(
    '/v1/rooms/:id/membres/:userId',
    {
      ...auth,
      schema: {
        params: ParamsMembre,
        querystring: z.object({ bannir: z.stringbool().default(false) }),
      },
    },
    async (req, reply) => {
      const userId = moi(req);
      const cible = req.params.userId;
      const { bannir } = req.query;
      await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await acces(tx, req.params.id, userId);
        if ((cible !== userId || bannir) && a.role !== 'mj')
          throw HttpError.forbidden('Seul le MJ peut exclure ou bannir un membre');
        if (bannir && cible === userId)
          throw HttpError.badRequest('On ne se bannit pas soi-même', 'bannir_soi_meme');
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
        if (bannir)
          await tx
            .insert(roomBans)
            .values({ roomId: a.salle.id, userId: cible, banniPar: userId })
            .onConflictDoNothing();
        await evenementSalle(tx, contexte(req), {
          type: 'room.member_left',
          roomId: a.salle.id,
          ...auteur,
          payload: { userId: cible, role: membre.role, exclu: cible !== userId, banni: bannir },
        });
      });
      reply.code(204);
    },
  );

  // ─── Bannissements ─────────────────────────────────────────────────────────

  r.get(
    '/v1/rooms/:id/bannis',
    {
      ...auth,
      schema: {
        params: Params,
        response: {
          200: z.array(
            z.object({
              userId: z.string(),
              nom: z.string().nullable(),
              avatarUrl: z.string().nullable(),
              banniPar: z.string(),
              banniLe: z.string(),
            }),
          ),
        },
      },
    },
    async (req) => {
      const a = await accesMj(db, req.params.id, moi(req));
      const bannis = await db
        .select()
        .from(roomBans)
        .where(eq(roomBans.roomId, a.salle.id))
        .orderBy(asc(roomBans.banniLe), asc(roomBans.userId));
      const profils = await deps.profils.profils(
        bannis.map((b) => b.userId),
        req.headers.authorization,
      );
      return bannis.map((b) => {
        const u = utilisateurApi(b.userId, profils);
        return {
          userId: b.userId,
          nom: u.nom,
          avatarUrl: u.avatarUrl,
          banniPar: b.banniPar,
          banniLe: b.banniLe.toISOString(),
        };
      });
    },
  );

  r.delete(
    '/v1/rooms/:id/bannis/:userId',
    { ...auth, schema: { params: ParamsMembre } },
    async (req, reply) => {
      const userId = moi(req);
      await db.transaction(async (tx) => {
        const a = await accesMj(tx, req.params.id, userId);
        const [leve] = await tx
          .delete(roomBans)
          .where(and(eq(roomBans.roomId, a.salle.id), eq(roomBans.userId, req.params.userId)))
          .returning();
        if (!leve) throw HttpError.notFound('Cet utilisateur n’est pas banni');
        await evenementSalle(tx, contexte(req), {
          type: 'room.member_unbanned',
          roomId: a.salle.id,
          userId,
          role: a.role,
          payload: { userId: req.params.userId },
          visibility: 'gm_only',
        });
      });
      reply.code(204);
    },
  );
};
