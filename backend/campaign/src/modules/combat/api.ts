/** État du combat : lignes en base ↔ état pur des tours ↔ réponse de l'API (`CombatState`). */
import {
  type CombatState as CombatStateApi,
  CombatSettings,
  DEFAULT_COMBAT_SETTINGS,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import type { CharacterError } from '../../clients/character.js';
import type { campaignCombatParticipants, campaignCombats } from '../../db/schema.js';
import { currentUser } from '../schemas.js';
import { currentActorOf, type CombatState } from './turns.js';

type CombatRow = typeof campaignCombats.$inferSelect;
type ParticipantRow = typeof campaignCombatParticipants.$inferSelect;

/** Réglages du combat, défauts complétés (combat démarré avant les réglages : `{}`). */
export function settingsOf(combat: CombatRow): CombatSettings {
  const parsed = CombatSettings.safeParse(combat.settings ?? {});
  return parsed.success ? parsed.data : DEFAULT_COMBAT_SETTINGS;
}

/** État pur (règles de tour) depuis les lignes en base, participants triés par rang. */
export function stateOf(combat: CombatRow, participants: ParticipantRow[]): CombatState {
  return {
    mode: combat.mode,
    round: combat.round,
    currentIndex: combat.currentIndex,
    slots: combat.slots ?? null,
    currentActorId: combat.mode === 'slots' ? combat.currentActorId : null,
    turn: combat.turn,
    order: [...participants]
      .sort((a, b) => a.turnOrder - b.turnOrder)
      .map((p) => ({
        characterId: p.characterId,
        side: p.side,
        sortKeys: p.sortKeys,
        hasActed: p.hasActed,
        visibleToPlayers: p.visibleToPlayers,
        initiative: p.initiative ?? null,
        initiativePending: p.initiativePending,
        joinedRound: p.joinedRound,
        defeated: p.defeated,
      })),
  };
}

/** État complet du combat (vue du MJ). */
export function combatApi(
  combat: CombatRow,
  participants: ParticipantRow[],
  extra: { canGoBack?: boolean } = {},
): CombatStateApi {
  const state = stateOf(combat, participants);
  return {
    id: combat.id,
    round: state.round,
    mode: state.mode,
    order: state.order.map((p) => ({
      characterId: p.characterId,
      side: p.side,
      sortKeys: p.sortKeys,
      hasActed: p.hasActed,
      visibleToPlayers: p.visibleToPlayers,
      initiative: p.initiative,
      initiativePending: p.initiativePending,
      joinedRound: p.joinedRound,
      defeated: p.defeated,
    })),
    currentIndex: state.currentIndex,
    ...(state.slots ? { slots: state.slots.map((side) => ({ side })) } : {}),
    initiativeRolled: combat.initiativeRolled,
    version: combat.version,
    currentActorId: currentActorOf(state),
    turn: state.turn,
    ...(extra.canGoBack !== undefined ? { canGoBack: extra.canGoBack } : {}),
    settings: settingsOf(combat),
    startedAt: combat.createdAt.toISOString(),
    redacted: false,
  };
}

/** État complet d'un combat chargé (vue du MJ, `canGoBack` compris). */
export const fullApi = (loaded: {
  combat: CombatRow;
  participants: ParticipantRow[];
  canGoBack: boolean;
}) => combatApi(loaded.combat, loaded.participants, { canGoBack: loaded.canGoBack });

export const noCombat = () =>
  new HttpError(
    404,
    'Ressource introuvable',
    'no_combat',
    'Aucun combat en cours dans cette campagne',
  );

/** Verrou optimiste : 409 `version_conflict` si le combat a changé depuis la lecture. */
export function checkVersion(combat: CombatRow, expected: number | undefined) {
  if (expected !== undefined && expected !== combat.version)
    throw HttpError.conflict('Le combat a changé entre-temps : rechargez-le', 'version_conflict');
}

export const combatInProgress = () =>
  HttpError.conflict('Un combat est déjà en cours dans cette campagne', 'combat_in_progress');

export const combatChanged = () =>
  HttpError.conflict('Le combat a changé pendant l’opération', 'combat_changed');

/** Origine d'un appel à character : l'appelant, sa campagne, la corrélation. */
export const originOf = (req: FastifyRequest, campaignId: string) => ({
  userId: currentUser(req),
  campaignId,
  correlationId: req.ctx.correlationId,
});

/** Identifiants en minuscules (clés d'un objet reçu). */
export function lowerKeys<T>(record: Record<string, T> | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(record ?? {})) out[k.toLowerCase()] = v;
  return out;
}

/** Personnages en conflit d'une annulation refusée par character (`conflicts`). */
export function conflictIds(e: CharacterError): string[] {
  const conflicts = e.problem.conflicts;
  return Array.isArray(conflicts)
    ? conflicts.flatMap((c) =>
        c && typeof (c as { characterId?: unknown }).characterId === 'string'
          ? [(c as { characterId: string }).characterId]
          : [],
      )
    : [];
}
