/** Forme de l'état de combat renvoyée par l'API. */
import type {
  campaignCombatParticipants,
  campaignCombats,
  CombatMode,
  Side,
} from '../../db/schema.js';
import type { CombatState } from './turns.js';

export interface CombatApi {
  id: string;
  round: number;
  mode: CombatMode;
  order: { characterId: string; side: Side; sortKeys: number[]; hasActed: boolean }[];
  /** Index du participant (individual) ou du créneau (slots) dont c'est le tour. */
  currentIndex: number;
  slots?: { side: Side }[];
  /** Vrai une fois l'initiative tirée. */
  initiativeRolled: boolean;
  version: number;
}

type CombatRow = typeof campaignCombats.$inferSelect;
type ParticipantRow = typeof campaignCombatParticipants.$inferSelect;

/** État pur (règles de tour) depuis les lignes en base, participants triés par rang. */
export function stateOf(combat: CombatRow, participants: ParticipantRow[]): CombatState {
  return {
    mode: combat.mode,
    round: combat.round,
    currentIndex: combat.currentIndex,
    slots: combat.slots ?? null,
    order: [...participants]
      .sort((a, b) => a.turnOrder - b.turnOrder)
      .map((p) => ({
        characterId: p.characterId,
        side: p.side,
        sortKeys: p.sortKeys,
        hasActed: p.hasActed,
      })),
  };
}

export function combatApi(combat: CombatRow, participants: ParticipantRow[]): CombatApi {
  const state = stateOf(combat, participants);
  return {
    id: combat.id,
    round: state.round,
    mode: state.mode,
    order: state.order,
    currentIndex: state.currentIndex,
    ...(state.slots ? { slots: state.slots.map((side) => ({ side })) } : {}),
    initiativeRolled: combat.initiativeRolled,
    version: combat.version,
  };
}
