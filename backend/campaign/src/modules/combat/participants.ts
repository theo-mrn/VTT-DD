/**
 * Participants d'un combat en cours (docs/combat.md § 4.2, § 4.4) :
 *
 *   POST   /v1/campaigns/:id/combat/participants                          rejoindre (MJ)
 *   PATCH  /v1/campaigns/:id/combat/participants/:characterId             initiative saisie,
 *                                                                          caché, hors de combat (MJ)
 *   DELETE /v1/campaigns/:id/combat/participants/:characterId             quitter (MJ)
 *   POST   /v1/campaigns/:id/combat/participants/:characterId/initiative  relance individuelle
 *
 * Un participant qui rejoint entre à sa place d'initiative ; le tour ne change pas de main.
 * Dés physiques de l'initiative (`dice: 'physical'`, `…/initiative/dice`) : étape C ; d'ici là
 * le serveur tire (repli), `pendingStep` vaut null.
 */
import {
  AddCombatParticipants,
  COMBAT_PARTICIPANTS_MAX,
  CombatState,
  ParticipantInitiativeResult,
  RollParticipantInitiative,
  UpdateCombatParticipant,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { access, gmAccess, lockCampaign } from '../campaigns/repository.js';
import { CampaignId, CharacterId, currentUser, eventContext } from '../schemas.js';
import {
  checkVersion,
  combatChanged,
  fullApi,
  noCombat,
  originOf,
  stateOf,
  viewFor,
} from './api.js';
import {
  initiativeAction,
  initiativeVisibility,
  manualInitiative,
  rollInitiatives,
  type Rolled,
} from './initiative.js';
import { engagedOrThrow, loadCombat, requirePlays, saveState, turnChanged } from './repository.js';
import {
  addParticipants,
  participant,
  participantNotFound,
  placeParticipant,
  remove,
  updateParticipant,
  type Participant,
} from './turns.js';

const Params = z.object({ id: CampaignId });
const ParticipantParams = z.object({ id: CampaignId, characterId: CharacterId });

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/campaigns/:id/combat/participants',
    {
      ...auth,
      schema: { params: Params, body: AddCombatParticipants, response: { 200: CombatState } },
    },
    async (req) => {
      const userId = currentUser(req);
      const a = await gmAccess(db, req.params.id, userId);
      const before = await loadCombat(db, a.campaign.id);
      if (!before) throw noCombat();
      const wanted = req.body.participants;
      const ids = wanted.map((p) => p.characterId);
      const already = ids.filter((id) => before.participants.some((p) => p.characterId === id));
      if (already.length)
        throw HttpError.conflict(
          `Déjà dans le combat : ${already.join(', ')}`,
          'already_participant',
        );
      if (before.participants.length + ids.length > COMBAT_PARTICIPANTS_MAX)
        throw new HttpError(
          422,
          'Refusé',
          'too_many_participants',
          `${COMBAT_PARTICIPANTS_MAX} participants au plus`,
        );
      const engaged = await engagedOrThrow(db, a.campaign.id, ids);
      const choiceOf = (p: (typeof wanted)[number]) =>
        p.initiative ?? (before.combat.initiativeRolled ? 'roll' : 'none');
      const toRoll = wanted.filter((p) => choiceOf(p) === 'roll');
      let rolled = new Map<string, Rolled>();
      if (toRoll.length) {
        const action = initiativeAction(deps.catalog, a.campaign.systemId);
        const rolls = await rollInitiatives(
          deps.character,
          req,
          action,
          toRoll.map((p) => ({
            characterId: p.characterId,
            params: p.params ?? {},
            visibility: initiativeVisibility(
              engaged.get(p.characterId)!.side,
              p.visibleToPlayers ?? true,
            ),
          })),
          originOf(req, a.campaign.id),
        );
        rolled = new Map(rolls.map((x) => [x.characterId, x]));
      }

      const saved = await db.transaction(async (tx) => {
        await lockCampaign(tx, a.campaign.id);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current || current.combat.id !== before.combat.id) throw combatChanged();
        checkVersion(current.combat, req.body.version);
        if (current.participants.some((p) => ids.includes(p.characterId)))
          throw HttpError.conflict('Déjà dans le combat', 'already_participant');
        const state = stateOf(current.combat, current.participants);
        const added: Participant[] = wanted.map((p) => {
          const choice = choiceOf(p);
          const roll = rolled.get(p.characterId);
          const manual = typeof choice === 'object' ? choice.sortKeys : null;
          return participant(p.characterId, engaged.get(p.characterId)!.side, {
            visibleToPlayers: p.visibleToPlayers ?? true,
            joinedRound: state.round,
            initiativePending: choice === 'ask',
            ...(roll ? { sortKeys: roll.sortKeys, initiative: roll.initiative } : {}),
            ...(manual ? { sortKeys: manual, initiative: manualInitiative(manual) } : {}),
          });
        });
        const saved = await saveState(tx, current, addParticipants(state, added));
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'participants_added',
            added: ids,
            withOrder: true,
          },
        );
        return saved;
      });
      return fullApi(saved);
    },
  );

  r.patch(
    '/v1/campaigns/:id/combat/participants/:characterId',
    {
      ...auth,
      schema: {
        params: ParticipantParams,
        body: UpdateCombatParticipant,
        response: { 200: CombatState },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { characterId } = req.params;
      const { sortKeys, visibleToPlayers, defeated, surprised, version } = req.body;
      const saved = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        checkVersion(current.combat, version);
        let state = updateParticipant(stateOf(current.combat, current.participants), characterId, {
          ...(sortKeys
            ? { sortKeys, initiative: manualInitiative(sortKeys), initiativePending: false }
            : {}),
          ...(visibleToPlayers !== undefined ? { visibleToPlayers } : {}),
          ...(defeated !== undefined ? { defeated } : {}),
          ...(surprised !== undefined ? { surprised } : {}),
        });
        if (sortKeys) state = placeParticipant(state, characterId);
        const saved = await saveState(
          tx,
          current,
          state,
          sortKeys ? { initiativeRolled: true } : {},
        );
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'participant_updated',
            withOrder: sortKeys !== undefined,
          },
        );
        return saved;
      });
      return fullApi(saved);
    },
  );

  r.delete(
    '/v1/campaigns/:id/combat/participants/:characterId',
    { ...auth, schema: { params: ParticipantParams, response: { 200: CombatState } } },
    async (req) => {
      const userId = currentUser(req);
      const { characterId } = req.params;
      const saved = await db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current) throw noCombat();
        if (!current.participants.some((p) => p.characterId === characterId))
          throw participantNotFound();
        const state = remove(stateOf(current.combat, current.participants), [characterId]);
        const saved = await saveState(tx, current, state);
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'participants_removed',
            removed: [characterId],
          },
        );
        return saved;
      });
      return fullApi(saved);
    },
  );

  r.post(
    '/v1/campaigns/:id/combat/participants/:characterId/initiative',
    {
      ...auth,
      schema: {
        params: ParticipantParams,
        body: RollParticipantInitiative.default({}),
        response: { 200: ParticipantInitiativeResult },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const { characterId } = req.params;
      const a = await access(db, req.params.id, userId);
      if (a.role === 'spectator') throw HttpError.forbidden('Un spectateur ne joue pas');
      const before = await loadCombat(db, a.campaign.id);
      if (!before) throw noCombat();
      const p = before.participants.find((x) => x.characterId === characterId);
      if (!p) throw participantNotFound();
      if (a.role !== 'gm') {
        await requirePlays(db, a, userId, characterId);
        if (!p.initiativePending)
          throw HttpError.forbidden('Seul le MJ relance l’initiative d’un participant');
      }
      const action = initiativeAction(deps.catalog, a.campaign.systemId);
      // Relance : les paramètres enregistrés, sauf s'il en vient de nouveaux
      const params = req.body.params ?? p.initiative?.params ?? {};
      const [roll] = await rollInitiatives(
        deps.character,
        req,
        action,
        [{ characterId, params, visibility: initiativeVisibility(p.side, p.visibleToPlayers) }],
        originOf(req, a.campaign.id),
      );

      const saved = await db.transaction(async (tx) => {
        await lockCampaign(tx, a.campaign.id);
        const current = await loadCombat(tx, a.campaign.id, true);
        if (!current || current.combat.id !== before.combat.id) throw combatChanged();
        let state = updateParticipant(stateOf(current.combat, current.participants), characterId, {
          sortKeys: roll!.sortKeys,
          initiative: roll!.initiative,
          initiativePending: false,
        });
        state = placeParticipant(state, characterId);
        const saved = await saveState(tx, current, state, { initiativeRolled: true });
        await turnChanged(
          tx,
          eventContext(req),
          saved,
          { userId, role: a.role },
          {
            reason: 'participant_updated',
            withOrder: true,
          },
        );
        return saved;
      });
      return { combat: viewFor(saved, a.role === 'gm'), pendingStep: null };
    },
  );
};
