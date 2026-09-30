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
import { talliesOf, type TallyAudience, type TallyRow } from './tally.js';
import { currentActorOf, type CombatState } from './turns.js';
import { redactCombat } from './view.js';

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
        surprised: p.surprised,
      })),
  };
}

/**
 * État du combat avec le décompte de chaque participant (`tally`) : toutes les attaques pour le
 * MJ, seulement les publiques d'un attaquant vu pour un joueur (`audience`, voir `redactCombat`
 * pour le reste de la vue d'un joueur).
 */
export function combatApi(
  combat: CombatRow,
  participants: ParticipantRow[],
  extra: { canGoBack?: boolean; tallies?: readonly TallyRow[]; audience?: TallyAudience } = {},
): CombatStateApi {
  const state = stateOf(combat, participants);
  const tallies = talliesOf(extra.tallies ?? [], state, extra.audience ?? 'gm');
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
      surprised: p.surprised,
      ...(tallies.has(p.characterId) ? { tally: tallies.get(p.characterId)! } : {}),
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

interface LoadedRows {
  combat: CombatRow;
  participants: ParticipantRow[];
  /** Absent : non dit (détail de la campagne). */
  canGoBack?: boolean;
  /** Décompte des attaques du combat (absent : aucune). */
  tallies?: readonly TallyRow[];
}

/** État complet d'un combat chargé (vue du MJ, `canGoBack` compris). */
export const fullApi = (loaded: LoadedRows) =>
  combatApi(loaded.combat, loaded.participants, {
    ...(loaded.canGoBack !== undefined ? { canGoBack: loaded.canGoBack } : {}),
    ...(loaded.tallies ? { tallies: loaded.tallies } : {}),
  });

/** L'état vu par ce rôle : complet pour le MJ, expurgé pour un joueur ou un spectateur. */
export const viewFor = (loaded: LoadedRows, isGm: boolean): CombatStateApi =>
  isGm
    ? fullApi(loaded)
    : redactCombat(
        combatApi(loaded.combat, loaded.participants, {
          tallies: loaded.tallies ?? [],
          audience: 'players',
        }),
      );

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
