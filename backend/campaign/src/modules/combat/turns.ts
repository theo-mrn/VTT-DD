/**
 * Règles de tour d'un combat, sans base de données ni appel réseau.
 *
 * - individual : chaque participant agit à son tour, dans l'ordre d'initiative ;
 * - slots (Star Wars) : l'ordre donne une suite de créneaux par camp ;
 *   pendant un créneau, n'importe quel participant du camp qui n'a pas encore
 *   agi peut agir.
 *
 * `currentIndex` est l'index du participant (individual) ou du créneau (slots)
 * dont c'est le tour.
 */
import { HttpError } from '@vtt/platform';
import type { CombatMode, Side } from '../../db/schema.js';

export interface Participant {
  characterId: string;
  side: Side;
  sortKeys: number[];
  hasActed: boolean;
}

export interface CombatState {
  mode: CombatMode;
  round: number;
  currentIndex: number;
  order: Participant[];
  /** Camps des créneaux, dans l'ordre (mode slots seulement). */
  slots: Side[] | null;
}

/**
 * Ordre d'initiative : clés comparées une à une, de la plus importante à la
 * moins importante, la plus haute d'abord. À égalité parfaite, le camp
 * `players` passe d'abord, puis l'ordre reçu est conservé (tri stable).
 */
export function sortByInitiative<P extends { side: Side; sortKeys: number[] }>(
  participants: P[],
): P[] {
  return participants
    .map((p, index) => ({ p, index }))
    .sort((a, b) => {
      const n = Math.max(a.p.sortKeys.length, b.p.sortKeys.length);
      for (let i = 0; i < n; i++) {
        const d = (b.p.sortKeys[i] ?? -Infinity) - (a.p.sortKeys[i] ?? -Infinity);
        if (d !== 0 && !Number.isNaN(d)) return d;
      }
      const players = Number(b.p.side === 'players') - Number(a.p.side === 'players');
      return players !== 0 ? players : a.index - b.index;
    })
    .map((x) => x.p);
}

/** Créneaux du mode slots : le camp de chaque rang de l'ordre. */
export const slotsOf = (order: Pick<Participant, 'side'>[]): Side[] => order.map((p) => p.side);

/** Combat qui démarre, ou qui repart après l'initiative : premier tour, personne n'a agi. */
export function start(mode: CombatMode, order: Participant[], round = 1): CombatState {
  const reset = order.map((p) => ({ ...p, hasActed: false }));
  return {
    mode,
    round,
    currentIndex: 0,
    order: reset,
    slots: mode === 'slots' ? slotsOf(reset) : null,
  };
}

const notTheirTurn = (detail: string) => HttpError.conflict(detail, 'not_their_turn');

/** Participants qui peuvent agir maintenant. */
export function canActNow(state: CombatState): Participant[] {
  if (state.mode === 'individual') {
    const p = state.order[state.currentIndex];
    return p && !p.hasActed ? [p] : [];
  }
  const side = state.slots?.[state.currentIndex];
  return state.order.filter((p) => p.side === side && !p.hasActed);
}

export interface Advance {
  state: CombatState;
  /** Participant qui vient d'agir (aucun si le créneau n'avait plus personne). */
  acted: string | null;
  /** Vrai si ce passage termine le round (les durées doivent être décomptées). */
  endOfRound: boolean;
}

/**
 * Tour suivant : le participant `characterId` (par défaut le premier qui peut
 * agir) a agi, on passe au participant ou au créneau suivant. Après le
 * dernier, un nouveau round commence et personne n'a encore agi.
 */
export function next(state: CombatState, characterId?: string): Advance {
  if (!state.order.length)
    throw HttpError.conflict('Le combat n’a aucun participant', 'empty_combat');
  const candidates = canActNow(state);
  let actor = candidates[0];
  if (characterId) {
    actor = candidates.find((p) => p.characterId === characterId);
    if (!actor)
      throw notTheirTurn(
        state.mode === 'individual'
          ? 'Ce n’est pas le tour de ce personnage'
          : 'Ce personnage ne peut pas agir pendant ce créneau (autre camp, ou il a déjà agi)',
      );
  }
  const order = state.order.map((p) => (p === actor ? { ...p, hasActed: true } : p));
  const size = state.mode === 'individual' ? order.length : (state.slots?.length ?? 0);
  const currentIndex = state.currentIndex + 1;
  if (currentIndex < size) {
    return {
      state: { ...state, order, currentIndex },
      acted: actor?.characterId ?? null,
      endOfRound: false,
    };
  }
  return {
    state: {
      ...state,
      round: state.round + 1,
      currentIndex: 0,
      order: order.map((p) => ({ ...p, hasActed: false })),
    },
    acted: actor?.characterId ?? null,
    endOfRound: true,
  };
}

/**
 * Retire des participants (personnage retiré de la campagne). En mode slots,
 * un créneau de son camp disparaît aussi : un créneau passé s'il avait déjà
 * agi, sinon un créneau à venir. Si le tour courant n'existe plus, un nouveau
 * round commence (sans décompte des durées).
 */
export function remove(state: CombatState, characterIds: string[]): CombatState {
  let { currentIndex, round } = state;
  let order = state.order;
  const slots = state.slots ? [...state.slots] : null;
  for (const id of characterIds) {
    const index = order.findIndex((p) => p.characterId === id);
    if (index < 0) continue;
    const p = order[index]!;
    order = order.filter((_, i) => i !== index);
    if (!slots) {
      if (index < currentIndex) currentIndex--;
      continue;
    }
    const indices = slots.flatMap((s, i) => (s === p.side ? [i] : []));
    const past = indices.filter((i) => i < currentIndex);
    const upcoming = indices.filter((i) => i >= currentIndex);
    const removed = p.hasActed
      ? (past.at(-1) ?? upcoming.at(-1))
      : (upcoming.at(-1) ?? past.at(-1));
    if (removed === undefined) continue;
    slots.splice(removed, 1);
    if (removed < currentIndex) currentIndex--;
  }
  const size = slots ? slots.length : order.length;
  if (currentIndex >= size && size > 0) {
    currentIndex = 0;
    round++;
    order = order.map((p) => ({ ...p, hasActed: false }));
  }
  if (size === 0) currentIndex = 0;
  return { ...state, round, currentIndex, order, slots };
}
