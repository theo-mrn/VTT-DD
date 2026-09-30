/**
 * Module « combat » : combat actif d'une campagne (un seul à la fois), docs/combat.md § 4.
 *
 *   GET   /v1/campaigns/:id/combat                          état (vue expurgée pour un joueur)
 *   POST  /v1/campaigns/:id/combat              StartCombat démarrer (MJ)
 *   POST  /v1/campaigns/:id/combat/initiative   …           initiative de tous ou de certains (MJ)
 *   POST  /v1/campaigns/:id/combat/next         NextTurn    tour suivant
 *   POST  /v1/campaigns/:id/combat/previous     PreviousTurn annuler le dernier passage (MJ)
 *   POST  /v1/campaigns/:id/combat/turn         SetTurn     donner le tour (MJ)
 *   POST  /v1/campaigns/:id/combat/slot-actor   ChooseSlotActor acteur du créneau
 *   PUT   /v1/campaigns/:id/combat/order        ReorderCombat réordonner (MJ)
 *   PATCH /v1/campaigns/:id/combat/settings     …           réglages (MJ)
 *   POST  /v1/campaigns/:id/combat/end          EndCombat   terminer (MJ)
 *   + participants (participants.ts)
 *
 * L'initiative est lancée par character (action d'initiative du système, route interne) ;
 * campaign trie avec les clés renvoyées. En fin de round, character décompte les durées, une
 * fois par passage (`tickId`) ; « Précédent » les rend.
 */
import {
  ChooseSlotActor,
  CombatSettings,
  CombatState,
  CombatTurnResponse,
  EndCombat,
  NextTurn,
  PreviousTurn,
  ReorderCombat,
  RollCombatInitiative,
  SetTurn,
  StartCombat,
  UpdateCombatSettings,
  uuidv7,
  type CombatDurationUpdate,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, isNotNull } from 'drizzle-orm';
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
import type { Deps, Module } from '../../deps.js';
import { dismissPendingOfCombat } from '../attacks/application.js';
import { access, gmAccess, lockCampaign, type Access } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext } from '../schemas.js';
import {
  checkVersion,
  combatChanged,
  combatInProgress,
  conflictIds,
  fullApi,
  lowerKeys,
  noCombat,
  originOf,
  settingsOf,
  stateOf,
} from './api.js';
import {
  initiativeAction,
  initiativeVisibility,
  paramsFor,
  rollInitiatives,
  type Rolled,
} from './initiative.js';
import { register as registerParticipants } from './participants.js';
import {
  clearTurns,
  combatEvent,
  dropTurn,
  engagedOrThrow,
  lastTurn,
  loadCombat,
  logTurn,
  recordExpired,
  requirePlays,
  saveSettings,
  saveState,
  turnChanged,
} from './repository.js';
import { restore, snapshotOf } from './turn-log.js';
import {
  canActNow,
  chooseSlotActor,
  next,
  participant,
  placeParticipant,
  setTurn,
  slotsOf,
  sortByInitiative,
  start,
  updateParticipant,
  withOrder,
  type CombatState as TurnState,
} from './turns.js';
import { combatFor } from './view.js';

const Params = z.object({ id: CampaignId });

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/campaigns/:id/combat',
    { ...auth, schema: { params: Params, response: { 200: CombatState } } },
    async (req) => {
      const a = await access(db, req.params.id, currentUser(req));
      const loaded = await loadCombat(db, a.campaign.id);
      if (!loaded) throw noCombat();
      return combatFor(fullApi(loaded), a.role === 'gm');
    },
  );

  r.post(
    '/v1/campaigns/:id/combat',
    { ...auth, schema: { params: Params, body: StartCombat, response: { 201: CombatState } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const ids = req.body.participants;
      if (new Set(ids).size !== ids.length)
        throw HttpError.badRequest('Participant en double', 'duplicate_participant');
      const hidden = new Set(req.body.hidden ?? []);
      const strangers = [...hidden].filter((id) => !ids.includes(id));
      if (strangers.length)
        throw HttpError.badRequest(
          `Personnages cachés hors du combat : ${strangers.join(', ')}`,
          'unknown_participant',
        );
      const first = await gmAccess(db, req.params.id, userId);
      const system = deps.catalog.system(first.campaign.systemId);
      const mode = req.body.mode ?? system?.initiative?.mode ?? 'individual';
      const settings = CombatSettings.parse(req.body.settings ?? {});

      // Contrôles sans verrou avant de lancer des dés pour rien
      if (await loadCombat(db, first.campaign.id)) throw combatInProgress();
      const engaged = await engagedOrThrow(db, first.campaign.id, ids);
      let rolled: Map<string, Rolled> | null = null;
      if (req.body.rollInitiative) {
        const action = initiativeAction(deps.catalog, first.campaign.systemId);
        const who = ids.map((id) => ({
          characterId: id,
          params: paramsFor(id, engaged.get(id)!.side, { paramsBySide: req.body.paramsBySide }),
          visibility: initiativeVisibility(engaged.get(id)!.side, !hidden.has(id)),
        }));
        const rolls = await rollInitiatives(
          deps.character,
          req,
          action,
          who,
          originOf(req, first.campaign.id),
        );
        rolled = new Map(rolls.map((x) => [x.characterId, x]));
      }

      const loaded = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        if (await loadCombat(tx, a.campaign.id)) throw combatInProgress();
        const sides = await engagedOrThrow(tx, a.campaign.id, ids);
        const list = ids.map((id) => {
          const roll = rolled?.get(id);
          return participant(id, sides.get(id)!.side, {
            visibleToPlayers: !hidden.has(id),
            ...(roll ? { sortKeys: roll.sortKeys, initiative: roll.initiative } : {}),
          });
        });
        const order = rolled ? sortByInitiative(list) : list;
        const [combat] = await tx
          .insert(campaignCombats)
          .values({
            campaignId: a.campaign.id,
            id: uuidv7(),
            mode,
            slots: mode === 'slots' ? slotsOf(order) : null,
            startedBy: userId,
            settings,
            initiativeRolled: rolled !== null,
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
          payload: {
            mode,
            participants: order.filter((p) => p.visibleToPlayers).map((p) => p.characterId),
            round: 1,
          },
        });
        return {
          combat: combat!,
          participants: participants.sort((x, y) => x.turnOrder - y.turnOrder),
          canGoBack: false,
        };
      });
      reply.code(201);
      return fullApi(loaded);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/initiative',
    {
      ...auth,
      schema: {
        params: Params,
        body: RollCombatInitiative.default({}),
        response: { 200: CombatState },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const a = await gmAccess(db, req.params.id, userId);
      const action = initiativeAction(deps.catalog, a.campaign.systemId);
      const before = await loadCombat(db, a.campaign.id);
      if (!before) throw noCombat();
      const params = lowerKeys(req.body.params);
      const inCombat = (id: string) => before.participants.some((p) => p.characterId === id);
      const unknown = [...Object.keys(params), ...(req.body.participants ?? [])].filter(
        (id) => !inCombat(id),
      );
      if (unknown.length)
        throw HttpError.badRequest(
          `Personnages hors du combat : ${[...new Set(unknown)].join(', ')}`,
          'unknown_participant',
        );
      const subset = req.body.participants ? new Set(req.body.participants) : null;
      const targets = before.participants.filter((p) => !subset || subset.has(p.characterId));

      // « Les joueurs lancent » : les personnages joueurs incarnés attendent leur joueur
      const played = req.body.askPlayers ? await playedIds(db, a.campaign.id) : new Set<string>();
      const asked = new Set(
        targets
          .filter((p) => p.side === 'players' && played.has(p.characterId))
          .map((p) => p.characterId),
      );
      const rolls = await rollInitiatives(
        deps.character,
        req,
        action,
        targets
          .filter((p) => !asked.has(p.characterId))
          .map((p) => ({
            characterId: p.characterId,
            params: paramsFor(p.characterId, p.side, {
              params,
              paramsBySide: req.body.paramsBySide,
            }),
            visibility: initiativeVisibility(p.side, p.visibleToPlayers),
          })),
        originOf(req, a.campaign.id),
      );

      const loaded = await db.transaction(async (tx) => {
        await lockCampaign(tx, a.campaign.id);
        const current = await loadCombat(tx, a.campaign.id, true);
        // Combat terminé ou relancé pendant les jets : on ne mélange pas deux combats
        if (!current || current.combat.id !== before.combat.id) throw combatChanged();
        let state = stateOf(current.combat, current.participants);
        const present = new Set(state.order.map((p) => p.characterId));
        const changed: string[] = [];
        for (const roll of rolls) {
          if (!present.has(roll.characterId)) continue;
          state = updateParticipant(state, roll.characterId, {
            sortKeys: roll.sortKeys,
            initiative: roll.initiative,
            initiativePending: false,
          });
          changed.push(roll.characterId);
        }
        for (const id of asked) {
          if (!present.has(id)) continue;
          state = updateParticipant(state, id, {
            sortKeys: [],
            initiative: null,
            initiativePending: true,
          });
          changed.push(id);
        }
        let reason: 'initiative' | 'participant_updated' = 'initiative';
        if (subset) {
          for (const id of changed) state = placeParticipant(state, id);
          reason = 'participant_updated';
        } else {
          // Initiative de tous : nouvel ordre, premier tour ; on ne remonte pas au-delà
          state = start(state.mode, sortByInitiative(state.order), state.round, state.turn);
          await clearTurns(tx, current.combat);
        }
        const saved = await saveState(
          tx,
          { combat: current.combat, canGoBack: subset ? current.canGoBack : false },
          state,
          { initiativeRolled: true },
        );
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason,
            withOrder: true,
          },
        );
        return saved;
      });
      return fullApi(loaded);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/next',
    {
      ...auth,
      schema: {
        params: Params,
        body: NextTurn.default({}),
        response: { 200: CombatTurnResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { characterId, version } = req.body;
      const logId = uuidv7();
      const { saved, endOfRound, a, tickId } = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await access(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        checkVersion(current.combat, version);
        const state = stateOf(current.combat, current.participants);
        await requireTurn(tx, a, userId, state, characterId);
        const advance = next(state, characterId);
        // Un décompte par passage : un passage annulé puis rejoué décompte de nouveau
        const tickId = advance.endOfRound
          ? `tick:${current.combat.id}:${state.round}:${logId}`
          : null;
        await logTurn(tx, current.combat, {
          id: logId,
          reason: advance.endOfRound ? 'new_round' : 'next',
          before: snapshotOf(state),
          userId,
          tickId,
        });
        const saved = await saveState(
          tx,
          { combat: current.combat, canGoBack: true },
          advance.state,
        );
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: advance.endOfRound ? 'new_round' : 'next',
            acted: advance.acted,
          },
        );
        return { saved, endOfRound: advance.endOfRound, a, tickId };
      });
      const api = combatFor(fullApi(saved), a.role === 'gm');
      if (!endOfRound || !tickId) return api;

      // Fin de round, après validation du nouveau round : chaque état à durée perd un round,
      // une seule fois pour ce passage (tickId), même si un appel est rejoué
      const results = await Promise.allSettled(
        saved.participants.map((p) =>
          deps.character.tickDurations(p.characterId, originOf(req, a.campaign.id), tickId),
        ),
      );
      const durationUpdates: CombatDurationUpdate[] = [];
      const durationFailures: string[] = [];
      results.forEach((res, i) => {
        const id = saved.participants[i]!.characterId;
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
      await recordExpired(
        db,
        logId,
        Object.fromEntries(durationUpdates.map((u) => [u.characterId, u.expired])),
      ).catch((e: Error) => req.log.warn({ error: e.message }, 'décompte non journalisé'));
      return {
        ...api,
        durationUpdates: a.role === 'gm' ? durationUpdates : visibleUpdates(api, durationUpdates),
        ...(durationFailures.length && a.role === 'gm' ? { durationFailures } : {}),
      };
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/previous',
    {
      ...auth,
      schema: {
        params: Params,
        body: PreviousTurn.default({}),
        response: { 200: CombatTurnResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { saved, entry, a } = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        checkVersion(current.combat, req.body.version);
        const entry = await lastTurn(tx, current.combat);
        if (!entry) throw HttpError.conflict('Aucun passage de tour à annuler', 'nothing_to_undo');
        await dropTurn(tx, entry.id);
        const state = restore(stateOf(current.combat, current.participants), entry.before);
        const saved = await saveState(tx, { combat: current.combat }, state);
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'previous',
          },
        );
        return { saved, entry, a };
      });
      const api = fullApi(saved);
      if (!entry.tickId) return api;
      const restored = await revertTick(deps, req, a, entry);
      return {
        ...api,
        durationUpdates: restored.updates,
        ...(restored.failures.length ? { durationFailures: restored.failures } : {}),
      };
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/turn',
    { ...auth, schema: { params: Params, body: SetTurn, response: { 200: CombatState } } },
    async (req) => {
      const userId = currentUser(req);
      const saved = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        checkVersion(current.combat, req.body.version);
        const state = stateOf(current.combat, current.participants);
        const turned = setTurn(state, req.body);
        await logTurn(tx, current.combat, {
          reason: 'turn_set',
          before: snapshotOf(state),
          userId,
        });
        const saved = await saveState(tx, { combat: current.combat, canGoBack: true }, turned);
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'turn_set',
          },
        );
        return saved;
      });
      return fullApi(saved);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/slot-actor',
    { ...auth, schema: { params: Params, body: ChooseSlotActor, response: { 200: CombatState } } },
    async (req) => {
      const userId = currentUser(req);
      const { characterId, force, version } = req.body;
      const { saved, isGm } = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await access(tx, req.params.id, userId);
        if (a.role === 'spectator') throw HttpError.forbidden('Un spectateur ne joue pas');
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        checkVersion(current.combat, version);
        if (a.role !== 'gm') {
          if (force) throw HttpError.forbidden('Seul le MJ fait rejouer un participant');
          await requirePlays(tx, a, userId, characterId);
        }
        const state = stateOf(current.combat, current.participants);
        const chosen = chooseSlotActor(state, characterId, force === true);
        await logTurn(tx, current.combat, {
          reason: 'slot_actor',
          before: snapshotOf(state),
          userId,
        });
        const saved = await saveState(tx, { combat: current.combat, canGoBack: true }, chosen);
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'slot_actor',
          },
        );
        return { saved, isGm: a.role === 'gm' };
      });
      return combatFor(fullApi(saved), isGm);
    },
  );

  r.put(
    '/v1/campaigns/:id/combat/order',
    { ...auth, schema: { params: Params, body: ReorderCombat, response: { 200: CombatState } } },
    async (req) => {
      const userId = currentUser(req);
      const saved = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        checkVersion(current.combat, req.body.version);
        const state = stateOf(current.combat, current.participants);
        const byId = new Map(state.order.map((p) => [p.characterId, p]));
        const ids = req.body.order;
        if (ids.length !== byId.size || ids.some((id) => !byId.has(id)))
          throw HttpError.badRequest(
            'Le nouvel ordre doit contenir chaque participant une fois',
            'order_mismatch',
          );
        const reordered = withOrder(
          state,
          ids.map((id) => byId.get(id)!),
        );
        const saved = await saveState(tx, current, reordered);
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'reordered',
            withOrder: true,
          },
        );
        return saved;
      });
      return fullApi(saved);
    },
  );

  r.patch(
    '/v1/campaigns/:id/combat/settings',
    {
      ...auth,
      schema: { params: Params, body: UpdateCombatSettings, response: { 200: CombatState } },
    },
    async (req) => {
      const userId = currentUser(req);
      const saved = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        const { version, ...change } = req.body;
        checkVersion(current.combat, version);
        const settings = { ...settingsOf(current.combat) };
        for (const [k, v] of Object.entries(change))
          if (v !== undefined) settings[k as keyof CombatSettings] = v;
        const saved = await saveSettings(tx, current, settings);
        await combatEvent(tx, eventContext(req), {
          type: 'combat.settings_updated',
          combat: saved.combat,
          userId,
          role: a.role,
          payload: { settings, version: saved.combat.version },
        });
        return saved;
      });
      return fullApi(saved);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/end',
    { ...auth, schema: { params: Params, body: EndCombat.nullish() } },
    async (req, reply) => {
      const userId = currentUser(req);
      const options = req.body ?? {};
      const ended = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const loaded = await loadCombat(tx, a.campaign.id, true);
        if (!loaded) throw noCombat();
        if (options.pendingAttacks === 'dismiss')
          await dismissPendingOfCombat(tx, eventContext(req), a, loaded.combat.id, userId);
        await tx.delete(campaignCombats).where(eq(campaignCombats.campaignId, a.campaign.id));
        await combatEvent(tx, eventContext(req), {
          type: 'combat.ended',
          combat: loaded.combat,
          userId,
          role: a.role,
          payload: { round: loaded.combat.round },
        });
        return { loaded, campaignId: a.campaign.id };
      });
      if (options.clearTimedStates) {
        // Fin de combat : les états à durée des participants sont retirés (annulable comme
        // un round, par le même identifiant de décompte)
        const tickId = `tick:${ended.loaded.combat.id}:end`;
        const results = await Promise.allSettled(
          ended.loaded.participants.map((p) =>
            deps.character.tickDurations(p.characterId, originOf(req, ended.campaignId), tickId, {
              clear: true,
            }),
          ),
        );
        results.forEach((res, i) => {
          if (res.status === 'rejected')
            req.log.error(
              {
                characterId: ended.loaded.participants[i]!.characterId,
                error: (res.reason as Error).message,
              },
              'états à durée non retirés',
            );
        });
      }
      reply.code(204);
    },
  );

  await registerParticipants(app, deps);
};

/** Personnages de la campagne incarnés par un membre. */
async function playedIds(db: Deps['db'], campaignId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: campaignCharacters.characterId })
    .from(campaignCharacters)
    .where(
      and(eq(campaignCharacters.campaignId, campaignId), isNotNull(campaignCharacters.playedBy)),
    );
  return new Set(rows.map((r) => r.id));
}

/**
 * Qui peut passer au tour suivant : le MJ, ou un joueur pour son propre personnage quand
 * celui-ci peut agir (son tour, un créneau de son camp, ou l'acteur désigné du créneau).
 */
async function requireTurn(
  tx: Tx,
  a: Access,
  userId: string,
  state: TurnState,
  characterId: string | undefined,
) {
  if (a.role === 'gm') return;
  if (a.role === 'spectator') throw HttpError.forbidden('Un spectateur ne joue pas');
  const candidates = canActNow(state);
  const target =
    characterId ??
    (state.mode === 'individual'
      ? candidates[0]?.characterId
      : (state.currentActorId ?? undefined));
  if (!target)
    throw HttpError.badRequest(
      'Indiquez le personnage qui a agi (characterId)',
      'character_required',
    );
  // Le membre qui incarne le personnage (pas son propriétaire : un seul personnage actif)
  await requirePlays(tx, a, userId, target).catch(() => {
    throw HttpError.forbidden('Seul le MJ ou le joueur qui incarne le personnage termine son tour');
  });
}

/** Un joueur ne reçoit le décompte que pour les participants qu'il voit, hors PNJ. */
function visibleUpdates(view: CombatState, updates: CombatDurationUpdate[]) {
  const mine = new Set(view.order.filter((p) => p.side === 'players').map((p) => p.characterId));
  return updates.filter((u) => mine.has(u.characterId));
}

/**
 * « Précédent » après un nouveau round : character rend les durées décomptées par ce passage
 * (`applicationId = tickId`). Une fiche modifiée depuis sur les mêmes chemins (409) n'est pas
 * forcée : elle est signalée dans `durationFailures`, les autres sont rendues.
 */
async function revertTick(
  deps: Deps,
  req: FastifyRequest,
  a: Access,
  entry: { tickId: string | null; expired: Record<string, string[]> | null },
): Promise<{ updates: CombatDurationUpdate[]; failures: string[] }> {
  const expired = entry.expired ?? {};
  const origin = originOf(req, a.campaign.id);
  const revert = (characterIds?: string[]) =>
    deps.character.revertModifications(
      {
        applicationId: entry.tickId!,
        ...(characterIds ? { characterIds } : {}),
        userId: origin.userId,
      },
      origin,
    );
  const updatesOf = (items: { characterId: string; status: string }[]) =>
    items
      .filter((i) => i.status !== 'missing')
      .map((i) => ({ characterId: i.characterId, expired: expired[i.characterId] ?? [] }));
  try {
    const r = await revert();
    return { updates: updatesOf(r.items), failures: [] };
  } catch (e) {
    if (e instanceof CharacterError && e.status === 404) return { updates: [], failures: [] };
    if (e instanceof CharacterError && e.code === 'revert_conflict') {
      const conflicts = conflictIds(e);
      const others = Object.keys(expired).filter((id) => !conflicts.includes(id));
      if (!others.length) return { updates: [], failures: conflicts };
      try {
        const r = await revert(others);
        return { updates: updatesOf(r.items), failures: conflicts };
      } catch (again) {
        req.log.error({ error: (again as Error).message }, 'durées non rendues');
        return { updates: [], failures: Object.keys(expired) };
      }
    }
    req.log.error({ error: (e as Error).message }, 'durées non rendues');
    return { updates: [], failures: Object.keys(expired) };
  }
}
