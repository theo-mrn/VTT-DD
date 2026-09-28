/**
 * Module « combat » : combat actif d'une campagne (un seul à la fois).
 *
 *   POST /v1/campaigns/:id/combat              { participants, mode? }  démarrer (MJ)
 *   POST /v1/campaigns/:id/combat/initiative   { params? }              initiative (MJ)
 *   POST /v1/campaigns/:id/combat/next         { characterId? }         tour suivant
 *   POST /v1/campaigns/:id/combat/end                                   terminer (MJ)
 *   GET  /v1/campaigns/:id/combat                                       état (membres)
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
import { CharacterError } from '../../clients/character.js';
import type { Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  campaignCombatParticipants,
  campaignCombats,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { access, gmAccess, lockCampaign, type Access } from '../campaigns/repository.js';
import {
  CampaignId,
  CharacterId,
  CombatMode,
  CombatResponse,
  currentUser,
  eventContext,
} from '../schemas.js';
import { combatApi, stateOf } from './api.js';
import { combatEvent, loadCombat, saveState } from './repository.js';
import {
  canActNow,
  next,
  sortByInitiative,
  start,
  type CombatState,
  type Participant,
} from './turns.js';

const Params = z.object({ id: CampaignId });

const Param = z.union([z.number().finite(), z.string().max(10_000), z.boolean()]);

const DurationUpdate = z.object({ characterId: z.string(), expired: z.array(z.string()) });

const noCombat = () => HttpError.notFound('Aucun combat en cours dans cette campagne');

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  const origin = (req: FastifyRequest, campaignId: string) => ({
    userId: currentUser(req),
    campaignId,
    correlationId: req.ctx.correlationId,
  });

  r.get(
    '/v1/campaigns/:id/combat',
    { ...auth, schema: { params: Params, response: { 200: CombatResponse } } },
    async (req) => {
      const a = await access(db, req.params.id, currentUser(req));
      const loaded = await loadCombat(db, a.campaign.id);
      if (!loaded) throw noCombat();
      return combatApi(loaded.combat, loaded.participants);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          participants: z.array(CharacterId).min(1).max(100),
          mode: CombatMode.optional(),
        }),
        response: { 201: CombatResponse },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const ids = req.body.participants;
      if (new Set(ids).size !== ids.length)
        throw HttpError.badRequest('Participant en double', 'duplicate_participant');
      const mode = req.body.mode ?? 'individual';
      const loaded = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        if (await loadCombat(tx, a.campaign.id))
          throw HttpError.conflict(
            'Un combat est déjà en cours dans cette campagne',
            'combat_in_progress',
          );
        const engaged = await tx
          .select()
          .from(campaignCharacters)
          .where(
            and(
              eq(campaignCharacters.campaignId, a.campaign.id),
              inArray(campaignCharacters.characterId, ids),
            ),
          );
        const missing = ids.filter((id) => !engaged.some((e) => e.characterId === id));
        if (missing.length)
          throw new HttpError(
            422,
            'Refusé',
            'character_not_engaged',
            `Personnages non engagés dans la campagne : ${missing.join(', ')}`,
          );
        const order: Participant[] = ids.map((id) => ({
          characterId: id,
          side: engaged.find((e) => e.characterId === id)!.side,
          sortKeys: [],
          hasActed: false,
        }));
        const [combat] = await tx
          .insert(campaignCombats)
          .values({
            campaignId: a.campaign.id,
            id: uuidv7(),
            mode,
            slots: mode === 'slots' ? order.map((p) => p.side) : null,
            startedBy: userId,
          })
          .returning();
        const participants = await tx
          .insert(campaignCombatParticipants)
          .values(order.map((p, turnOrder) => ({ campaignId: a.campaign.id, ...p, turnOrder })))
          .returning();
        await combatEvent(tx, eventContext(req), {
          type: 'combat.started',
          combat: combat!,
          userId,
          role: a.role,
          payload: { mode, participants: ids, round: 1 },
        });
        return {
          combat: combat!,
          participants: participants.sort((x, y) => x.turnOrder - y.turnOrder),
        };
      });
      reply.code(201);
      return combatApi(loaded.combat, loaded.participants);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/initiative',
    {
      ...auth,
      schema: {
        params: Params,
        body: z
          .object({
            params: z.record(z.string(), z.record(z.string().min(1).max(100), Param)).optional(),
          })
          .default({}),
        response: { 200: CombatResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const a = await gmAccess(db, req.params.id, userId);
      const system = deps.catalog.system(a.campaign.systemId);
      const action = system?.initiative?.action;
      if (!action)
        throw new HttpError(
          422,
          'Refusé',
          'no_initiative',
          `Le système ${a.campaign.systemId} ne déclare pas d’initiative`,
        );
      const before = await loadCombat(db, a.campaign.id);
      if (!before) throw noCombat();
      const params = normalizeParams(req.body.params ?? {});
      const unknown = Object.keys(params).filter(
        (id) => !before.participants.some((p) => p.characterId === id),
      );
      if (unknown.length)
        throw HttpError.badRequest(
          `Paramètres pour des personnages hors du combat : ${unknown.join(', ')}`,
          'unknown_participant',
        );

      // Chaque participant lance l'action d'initiative du système (dans character)
      const rolls = await Promise.allSettled(
        before.participants.map((p) =>
          deps.character.action(
            p.characterId,
            action,
            {
              apply: true,
              ...(params[p.characterId] ? { params: params[p.characterId] } : {}),
            },
            origin(req, a.campaign.id),
          ),
        ),
      );
      const failures = rolls.flatMap((roll, i) =>
        roll.status === 'rejected'
          ? [{ characterId: before.participants[i]!.characterId, error: roll.reason }]
          : [],
      );
      if (failures.length) throw initiativeError(req, failures);

      const sortKeys = new Map(
        before.participants.map((p, i) => {
          const roll = rolls[i] as PromiseFulfilledResult<{ sortKeys?: number[] }>;
          return [p.characterId, roll.value.sortKeys ?? []];
        }),
      );

      const loaded = await db.transaction(async (tx) => {
        await lockCampaign(tx, a.campaign.id);
        const current = await loadCombat(tx, a.campaign.id, true);
        // Combat terminé ou relancé pendant les jets : on ne mélange pas deux combats
        if (!current || current.combat.id !== before.combat.id)
          throw HttpError.conflict('Le combat a changé pendant l’initiative', 'combat_changed');
        const state = stateOf(current.combat, current.participants);
        const order = sortByInitiative(
          state.order
            .filter((p) => sortKeys.has(p.characterId))
            .map((p) => ({ ...p, sortKeys: sortKeys.get(p.characterId)! })),
        );
        const saved = await saveState(tx, current.combat, start(state.mode, order, state.round), {
          initiativeRolled: true,
        });
        await combatEvent(tx, eventContext(req), {
          type: 'combat.turn_changed',
          combat: saved.combat,
          userId,
          role: a.role,
          payload: {
            reason: 'initiative',
            round: saved.combat.round,
            currentIndex: 0,
            order: order.map((p) => ({ characterId: p.characterId, sortKeys: p.sortKeys })),
            version: saved.combat.version,
          },
        });
        return saved;
      });
      return combatApi(loaded.combat, loaded.participants);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/next',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ characterId: CharacterId.optional() }).default({}),
        response: {
          200: CombatResponse.extend({
            /** Fin de round : états expirés par personnage, et personnages injoignables. */
            durationUpdates: z.array(DurationUpdate).optional(),
            durationFailures: z.array(z.string()).optional(),
          }),
        },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { characterId } = req.body;
      const { loaded, endOfRound, a } = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await access(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        const state = stateOf(current.combat, current.participants);
        await requireTurn(tx, a, userId, state, characterId);
        const advance = next(state, characterId);
        const saved = await saveState(tx, current.combat, advance.state);
        await combatEvent(tx, eventContext(req), {
          type: 'combat.turn_changed',
          combat: saved.combat,
          userId,
          role: a.role,
          payload: {
            reason: advance.endOfRound ? 'new_round' : 'next',
            acted: advance.acted,
            round: saved.combat.round,
            currentIndex: saved.combat.currentIndex,
            version: saved.combat.version,
          },
        });
        return { loaded: saved, endOfRound: advance.endOfRound, a };
      });
      const api = combatApi(loaded.combat, loaded.participants);
      if (!endOfRound) return api;

      // Fin de round, après validation du nouveau round : chaque état à durée
      // perd un round (au plus une fois par round, même si un appel échoue)
      const results = await Promise.allSettled(
        loaded.participants.map((p) =>
          deps.character.tickDurations(p.characterId, origin(req, a.campaign.id)),
        ),
      );
      const durationUpdates: z.infer<typeof DurationUpdate>[] = [];
      const durationFailures: string[] = [];
      results.forEach((res, i) => {
        const id = loaded.participants[i]!.characterId;
        if (res.status === 'fulfilled')
          durationUpdates.push({ characterId: id, expired: res.value.expired });
        else {
          durationFailures.push(id);
          req.log.error(
            { characterId: id, error: (res.reason as Error).message },
            'décompte des durées impossible',
          );
        }
      });
      return {
        ...api,
        durationUpdates,
        ...(durationFailures.length ? { durationFailures } : {}),
      };
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/end',
    { ...auth, schema: { params: Params } },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const loaded = await loadCombat(tx, a.campaign.id, true);
        if (!loaded) throw noCombat();
        await tx.delete(campaignCombats).where(eq(campaignCombats.campaignId, a.campaign.id));
        await combatEvent(tx, eventContext(req), {
          type: 'combat.ended',
          combat: loaded.combat,
          userId,
          role: a.role,
          payload: { round: loaded.combat.round },
        });
      });
      reply.code(204);
    },
  );
};

/** Paramètres d'initiative indexés par identifiant de personnage en minuscules. */
function normalizeParams(params: Record<string, Record<string, number | string | boolean>>) {
  const out: Record<string, Record<string, number | string | boolean>> = {};
  for (const [id, values] of Object.entries(params)) out[id.toLowerCase()] = values;
  return out;
}

/**
 * Qui peut passer au tour suivant : le MJ, ou un joueur pour son propre
 * personnage quand celui-ci peut agir (son tour, ou un créneau de son camp).
 */
async function requireTurn(
  tx: Tx,
  a: Access,
  userId: string,
  state: CombatState,
  characterId: string | undefined,
) {
  if (a.role === 'gm') return;
  if (a.role === 'spectator') throw HttpError.forbidden('Un spectateur ne joue pas');
  const candidates = canActNow(state);
  const target =
    characterId ?? (state.mode === 'individual' ? candidates[0]?.characterId : undefined);
  if (!target)
    throw HttpError.badRequest(
      'Indiquez le personnage qui a agi (characterId)',
      'character_required',
    );
  // Le membre qui incarne le personnage (pas son propriétaire : un seul personnage actif)
  const [engagement] = await tx
    .select({ playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, a.campaign.id),
        eq(campaignCharacters.characterId, target),
      ),
    );
  if (!engagement || engagement.playedBy !== userId)
    throw HttpError.forbidden('Seul le MJ ou le joueur qui incarne le personnage termine son tour');
}

function initiativeError(
  req: FastifyRequest,
  failures: { characterId: string; error: unknown }[],
): HttpError {
  const rejected = failures.filter((f) => f.error instanceof CharacterError && f.error.rejected);
  if (rejected.length === failures.length) {
    return new HttpError(
      422,
      'Initiative refusée',
      'initiative_rejected',
      rejected.map((f) => `${f.characterId} : ${(f.error as Error).message}`).join(' ; '),
    );
  }
  const outage = failures.find((f) => !(f.error instanceof CharacterError && f.error.rejected))!;
  if (outage.error instanceof HttpError) return outage.error;
  req.log.error({ error: (outage.error as Error).message }, 'initiative : character injoignable');
  return new HttpError(502, 'Service indisponible', 'character_unavailable');
}
