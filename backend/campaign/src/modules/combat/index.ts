/**
 * Module « combat » : combat actif d'une salle (un seul à la fois).
 *
 *   POST /v1/rooms/:id/combat              { participants, mode? }  démarrer (MJ)
 *   POST /v1/rooms/:id/combat/initiative   { parametres? }          initiative (MJ)
 *   POST /v1/rooms/:id/combat/suivant      { characterId? }         tour suivant
 *   POST /v1/rooms/:id/combat/fin                                   terminer (MJ)
 *   GET  /v1/rooms/:id/combat                                       état (membres)
 *
 * L'initiative est lancée par character (action d'initiative du système,
 * route interne) pour chaque participant ; campaign trie avec les clés
 * renvoyées. En fin de round, character décompte les durées des états.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurCharacter } from '../../clients/character.js';
import { combatParticipants, combats, roomCharacters } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { CombatReponse, contexte, IdPersonnage, IdSalle, ModeCombat, moi } from '../schemas.js';
import { acces, accesMj, verrouillerSalle, type Acces } from '../salles/depot.js';
import { combatApi, etatDe } from './api.js';
import { enregistrerEtat, evenementCombat, lireCombat } from './depot.js';
import { depart, peuventAgir, suivant, trier, type Participant } from './ordre.js';

const Params = z.object({ id: IdSalle });

const Parametre = z.union([z.number().finite(), z.string().max(10_000), z.boolean()]);

const Decompte = z.object({ characterId: z.string(), retirees: z.array(z.string()) });

const aucunCombat = () => HttpError.notFound('Aucun combat en cours dans cette salle');

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  const origine = (req: FastifyRequest, roomId: string) => ({
    userId: moi(req),
    roomId,
    correlationId: req.ctx.correlationId,
  });

  r.get(
    '/v1/rooms/:id/combat',
    { ...auth, schema: { params: Params, response: { 200: CombatReponse } } },
    async (req) => {
      const a = await acces(db, req.params.id, moi(req));
      const lu = await lireCombat(db, a.salle.id);
      if (!lu) throw aucunCombat();
      return combatApi(lu.combat, lu.participants);
    },
  );

  r.post(
    '/v1/rooms/:id/combat',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          participants: z.array(IdPersonnage).min(1).max(100),
          mode: ModeCombat.optional(),
        }),
        response: { 201: CombatReponse },
      },
    },
    async (req, reply) => {
      const userId = moi(req);
      const ids = req.body.participants;
      if (new Set(ids).size !== ids.length)
        throw HttpError.badRequest('Participant en double', 'participant_double');
      const mode = req.body.mode ?? 'individuel';
      const lu = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await accesMj(tx, req.params.id, userId);
        if (await lireCombat(tx, a.salle.id))
          throw HttpError.conflict(
            'Un combat est déjà en cours dans cette salle',
            'combat_en_cours',
          );
        const engages = await tx
          .select()
          .from(roomCharacters)
          .where(
            and(eq(roomCharacters.roomId, a.salle.id), inArray(roomCharacters.characterId, ids)),
          );
        const absents = ids.filter((id) => !engages.some((e) => e.characterId === id));
        if (absents.length)
          throw new HttpError(
            422,
            'Refusé',
            'personnage_non_engage',
            `Personnages non engagés dans la salle : ${absents.join(', ')}`,
          );
        const ordre: Participant[] = ids.map((id) => ({
          characterId: id,
          camp: engages.find((e) => e.characterId === id)!.camp,
          cles: [],
          aAgi: false,
        }));
        const [combat] = await tx
          .insert(combats)
          .values({
            roomId: a.salle.id,
            id: uuidv7(),
            mode,
            creneaux: mode === 'creneaux' ? ordre.map((p) => p.camp) : null,
            demarrePar: userId,
          })
          .returning();
        const participants = await tx
          .insert(combatParticipants)
          .values(ordre.map((p, rang) => ({ roomId: a.salle.id, ...p, rang })))
          .returning();
        await evenementCombat(tx, contexte(req), {
          type: 'combat.started',
          combat: combat!,
          userId,
          role: a.role,
          payload: { mode, participants: ids, round: 1 },
        });
        return { combat: combat!, participants: participants.sort((x, y) => x.rang - y.rang) };
      });
      reply.code(201);
      return combatApi(lu.combat, lu.participants);
    },
  );

  r.post(
    '/v1/rooms/:id/combat/initiative',
    {
      ...auth,
      schema: {
        params: Params,
        body: z
          .object({
            parametres: z
              .record(z.string(), z.record(z.string().min(1).max(100), Parametre))
              .optional(),
          })
          .default({}),
        response: { 200: CombatReponse },
      },
    },
    async (req) => {
      const userId = moi(req);
      const a = await accesMj(db, req.params.id, userId);
      const systeme = deps.catalogue.systeme(a.salle.systemId);
      const action = systeme?.initiative?.action;
      if (!action)
        throw new HttpError(
          422,
          'Refusé',
          'initiative_absente',
          `Le système ${a.salle.systemId} ne déclare pas d’initiative`,
        );
      const avant = await lireCombat(db, a.salle.id);
      if (!avant) throw aucunCombat();
      const parametres = normaliserParametres(req.body.parametres ?? {});
      const inconnus = Object.keys(parametres).filter(
        (id) => !avant.participants.some((p) => p.characterId === id),
      );
      if (inconnus.length)
        throw HttpError.badRequest(
          `Paramètres pour des personnages hors du combat : ${inconnus.join(', ')}`,
          'participant_inconnu',
        );

      // Chaque participant lance l'action d'initiative du système (dans character)
      const lances = await Promise.allSettled(
        avant.participants.map((p) =>
          deps.character.action(
            p.characterId,
            action,
            {
              appliquer: true,
              ...(parametres[p.characterId] ? { parametres: parametres[p.characterId] } : {}),
            },
            origine(req, a.salle.id),
          ),
        ),
      );
      const echecs = lances.flatMap((l, i) =>
        l.status === 'rejected'
          ? [{ characterId: avant.participants[i]!.characterId, e: l.reason }]
          : [],
      );
      if (echecs.length) throw erreurInitiative(req, echecs);

      const cles = new Map(
        avant.participants.map((p, i) => {
          const l = lances[i] as PromiseFulfilledResult<{ cles?: number[] }>;
          return [p.characterId, l.value.cles ?? []];
        }),
      );

      const lu = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, a.salle.id);
        const courant = await lireCombat(tx, a.salle.id, true);
        // Combat terminé ou relancé pendant les jets : on ne mélange pas deux combats
        if (!courant || courant.combat.id !== avant.combat.id)
          throw HttpError.conflict('Le combat a changé pendant l’initiative', 'combat_modifie');
        const etat = etatDe(courant.combat, courant.participants);
        const ordre = trier(
          etat.ordre
            .filter((p) => cles.has(p.characterId))
            .map((p) => ({ ...p, cles: cles.get(p.characterId)! })),
        );
        const suivantEtat = depart(etat.mode, ordre, etat.round);
        const lu = await enregistrerEtat(tx, courant.combat, suivantEtat, { initiative: true });
        await evenementCombat(tx, contexte(req), {
          type: 'combat.turn_changed',
          combat: lu.combat,
          userId,
          role: a.role,
          payload: {
            raison: 'initiative',
            round: lu.combat.round,
            courant: 0,
            ordre: ordre.map((p) => ({ characterId: p.characterId, cles: p.cles })),
            version: lu.combat.version,
          },
        });
        return lu;
      });
      return combatApi(lu.combat, lu.participants);
    },
  );

  r.post(
    '/v1/rooms/:id/combat/suivant',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ characterId: IdPersonnage.optional() }).default({}),
        response: {
          200: CombatReponse.extend({
            /** Fin de round : états retirés par personnage, et personnages injoignables. */
            decomptes: z.array(Decompte).optional(),
            echecsDecompte: z.array(z.string()).optional(),
          }),
        },
      },
    },
    async (req) => {
      const userId = moi(req);
      const { characterId } = req.body;
      const { lu, finDeRound, a } = await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await acces(tx, req.params.id, userId);
        const lu = await lireCombat(tx, a.salle.id, true);
        if (!lu) throw aucunCombat();
        const etat = etatDe(lu.combat, lu.participants);
        await exigerTour(tx, a, userId, etat, characterId);
        const passage = suivant(etat, characterId);
        const suivantLu = await enregistrerEtat(tx, lu.combat, passage.etat);
        await evenementCombat(tx, contexte(req), {
          type: 'combat.turn_changed',
          combat: suivantLu.combat,
          userId,
          role: a.role,
          payload: {
            raison: passage.finDeRound ? 'nouveau_round' : 'suivant',
            aAgi: passage.aAgi,
            round: suivantLu.combat.round,
            courant: suivantLu.combat.courant,
            version: suivantLu.combat.version,
          },
        });
        return { lu: suivantLu, finDeRound: passage.finDeRound, a };
      });
      const api = combatApi(lu.combat, lu.participants);
      if (!finDeRound) return api;

      // Fin de round, après validation du nouveau round : chaque état à durée
      // perd un round (au plus une fois par round, même si un appel échoue)
      const resultats = await Promise.allSettled(
        lu.participants.map((p) =>
          deps.character.decompterDurees(p.characterId, origine(req, a.salle.id)),
        ),
      );
      const decomptes: z.infer<typeof Decompte>[] = [];
      const echecsDecompte: string[] = [];
      resultats.forEach((res, i) => {
        const id = lu.participants[i]!.characterId;
        if (res.status === 'fulfilled')
          decomptes.push({ characterId: id, retirees: res.value.retirees });
        else {
          echecsDecompte.push(id);
          req.log.error(
            { characterId: id, erreur: (res.reason as Error).message },
            'décompte des durées impossible',
          );
        }
      });
      return { ...api, decomptes, ...(echecsDecompte.length ? { echecsDecompte } : {}) };
    },
  );

  r.post(
    '/v1/rooms/:id/combat/fin',
    { ...auth, schema: { params: Params } },
    async (req, reply) => {
      const userId = moi(req);
      await db.transaction(async (tx) => {
        await verrouillerSalle(tx, req.params.id);
        const a = await accesMj(tx, req.params.id, userId);
        const lu = await lireCombat(tx, a.salle.id, true);
        if (!lu) throw aucunCombat();
        await tx.delete(combats).where(eq(combats.roomId, a.salle.id));
        await evenementCombat(tx, contexte(req), {
          type: 'combat.ended',
          combat: lu.combat,
          userId,
          role: a.role,
          payload: { round: lu.combat.round },
        });
      });
      reply.code(204);
    },
  );
};

/** Paramètres d'initiative indexés par identifiant de personnage en minuscules. */
function normaliserParametres(
  parametres: Record<string, Record<string, number | string | boolean>>,
) {
  const sortie: Record<string, Record<string, number | string | boolean>> = {};
  for (const [id, valeurs] of Object.entries(parametres)) sortie[id.toLowerCase()] = valeurs;
  return sortie;
}

/**
 * Qui peut passer au tour suivant : le MJ, ou un joueur pour son propre
 * personnage quand celui-ci peut agir (son tour, ou un créneau de son camp).
 */
async function exigerTour(
  tx: Parameters<typeof lireCombat>[0],
  a: Acces,
  userId: string,
  etat: ReturnType<typeof etatDe>,
  characterId: string | undefined,
) {
  if (a.role === 'mj') return;
  if (a.role === 'spectateur') throw HttpError.forbidden('Un spectateur ne joue pas');
  const possibles = peuventAgir(etat);
  const vise = characterId ?? (etat.mode === 'individuel' ? possibles[0]?.characterId : undefined);
  if (!vise)
    throw HttpError.badRequest(
      'Indiquez le personnage qui a agi (characterId)',
      'personnage_requis',
    );
  const [engagement] = await tx
    .select({ ownerId: roomCharacters.ownerId })
    .from(roomCharacters)
    .where(and(eq(roomCharacters.roomId, a.salle.id), eq(roomCharacters.characterId, vise)));
  if (!engagement || engagement.ownerId !== userId)
    throw HttpError.forbidden('Seul le MJ ou le propriétaire du personnage termine son tour');
}

function erreurInitiative(
  req: FastifyRequest,
  echecs: { characterId: string; e: unknown }[],
): HttpError {
  const refus = echecs.filter((x) => x.e instanceof ErreurCharacter && x.e.refus);
  if (refus.length === echecs.length) {
    return new HttpError(
      422,
      'Initiative refusée',
      'initiative_refusee',
      refus.map((x) => `${x.characterId} : ${(x.e as Error).message}`).join(' ; '),
    );
  }
  const panne = echecs.find((x) => !(x.e instanceof ErreurCharacter && x.e.refus))!;
  if (panne.e instanceof HttpError) return panne.e;
  req.log.error({ erreur: (panne.e as Error).message }, 'initiative : character injoignable');
  return new HttpError(502, 'Service indisponible', 'character_indisponible');
}
