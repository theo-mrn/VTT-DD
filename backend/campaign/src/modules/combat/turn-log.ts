/**
 * Journal des passages de tour (docs/combat.md § 4.3), sans base : ce qu'on enregistre avant un
 * passage, et comment « Précédent » le rend.
 *
 * L'état d'avant garde les participants par identité, pas par index : l'ordre a pu changer
 * depuis (participant ajouté, retiré, réordonné, initiative relancée). Un participant retiré
 * depuis n'est pas remis ; le tour revient au même participant s'il est encore là.
 */
import type { TurnSnapshot } from '../../db/schema.js';
import type { CombatState } from './turns.js';

/** État d'avant un passage de tour. */
export function snapshotOf(state: CombatState): TurnSnapshot {
  return {
    round: state.round,
    currentIndex: state.currentIndex,
    currentId:
      state.mode === 'individual' ? (state.order[state.currentIndex]?.characterId ?? null) : null,
    currentActorId: state.currentActorId,
    turn: state.turn,
    acted: state.order.filter((p) => p.hasActed).map((p) => p.characterId),
  };
}

/**
 * Rend l'état d'avant un passage, appliqué à l'ordre d'aujourd'hui : round, qui a agi, tour
 * courant (même participant en individual, même créneau en slots), acteur du créneau.
 */
export function restore(state: CombatState, before: TurnSnapshot): CombatState {
  const acted = new Set(before.acted);
  const order = state.order.map((p) => ({ ...p, hasActed: acted.has(p.characterId) }));
  const clamp = (i: number, size: number) => Math.max(0, Math.min(i, size - 1));
  let currentIndex: number;
  if (state.mode === 'individual') {
    const index = order.findIndex((p) => p.characterId === before.currentId);
    currentIndex = index >= 0 ? index : clamp(before.currentIndex, order.length);
  } else currentIndex = clamp(before.currentIndex, state.slots?.length ?? 0);
  const actor = order.find((p) => p.characterId === before.currentActorId);
  return {
    ...state,
    round: before.round,
    turn: before.turn,
    order,
    currentIndex,
    currentActorId:
      state.mode === 'slots' && actor && actor.side === state.slots?.[currentIndex]
        ? actor.characterId
        : null,
  };
}
