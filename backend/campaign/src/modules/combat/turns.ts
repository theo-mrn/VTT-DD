/**
 * Règles de tour d'un combat, sans base de données ni appel réseau (docs/combat.md § 4.3).
 *
 * - individual : chaque participant agit à son tour, dans l'ordre d'initiative ;
 * - slots (Star Wars) : l'ordre donne une suite de créneaux par camp ; pendant un créneau, un
 *   participant du camp qui n'a pas encore agi agit. Il peut être désigné à l'avance (acteur du
 *   créneau) : lui seul termine alors le créneau.
 *
 * `currentIndex` est l'index du participant (individual) ou du créneau (slots) dont c'est le
 * tour. `turn` compte les passages de tour (suivant, donner le tour, acteur du créneau).
 */
import type { CombatInitiative } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { CombatMode, Side } from '../../db/schema.js';

export interface Participant {
  characterId: string;
  side: Side;
  sortKeys: number[];
  hasActed: boolean;
  visibleToPlayers: boolean;
  initiative: CombatInitiative | null;
  initiativePending: boolean;
  joinedRound: number;
  defeated: boolean;
  /** Surpris (MJ), lu par les règles (`@combat.*.surpris`). */
  surprised: boolean;
}

export interface CombatState {
  mode: CombatMode;
  round: number;
  currentIndex: number;
  order: Participant[];
  /** Camps des créneaux, dans l'ordre (mode slots seulement). */
  slots: Side[] | null;
  /** Acteur désigné du créneau courant (mode slots) ; toujours null en individual. */
  currentActorId: string | null;
  /** Compteur des passages de tour. */
  turn: number;
}

/** Nouveau participant : pas d'initiative, visible, pas encore agi. */
export function participant(
  characterId: string,
  side: Side,
  extra: Partial<Omit<Participant, 'characterId' | 'side'>> = {},
): Participant {
  return {
    characterId,
    side,
    sortKeys: [],
    hasActed: false,
    visibleToPlayers: true,
    initiative: null,
    initiativePending: false,
    joinedRound: 1,
    defeated: false,
    surprised: false,
    ...extra,
  };
}

/**
 * Comparaison d'initiative : clés comparées une à une, de la plus importante à la moins
 * importante, la plus haute d'abord ; une clé absente compte comme la plus basse. À égalité
 * parfaite, le camp `players` passe d'abord. Négatif : `a` passe avant `b`.
 */
export function compareInitiative(
  a: { side: Side; sortKeys: number[] },
  b: { side: Side; sortKeys: number[] },
): number {
  const n = Math.max(a.sortKeys.length, b.sortKeys.length);
  for (let i = 0; i < n; i++) {
    const d = (b.sortKeys[i] ?? -Infinity) - (a.sortKeys[i] ?? -Infinity);
    if (d !== 0 && !Number.isNaN(d)) return d;
  }
  return Number(b.side === 'players') - Number(a.side === 'players');
}

/** Ordre d'initiative (voir `compareInitiative`), puis ordre reçu (tri stable). */
export function sortByInitiative<P extends { side: Side; sortKeys: number[] }>(
  participants: P[],
): P[] {
  return participants
    .map((p, index) => ({ p, index }))
    .sort((a, b) => compareInitiative(a.p, b.p) || a.index - b.index)
    .map((x) => x.p);
}

/** Créneaux du mode slots : le camp de chaque rang de l'ordre. */
export const slotsOf = (order: Pick<Participant, 'side'>[]): Side[] => order.map((p) => p.side);

/** Combat qui démarre, ou qui repart après l'initiative : premier tour, personne n'a agi. */
export function start(mode: CombatMode, order: Participant[], round = 1, turn = 0): CombatState {
  const reset = order.map((p) => ({ ...p, hasActed: false }));
  return {
    mode,
    round,
    currentIndex: 0,
    order: reset,
    slots: mode === 'slots' ? slotsOf(reset) : null,
    currentActorId: null,
    turn,
  };
}

const notTheirTurn = (detail: string) => HttpError.conflict(detail, 'not_their_turn');

export const participantNotFound = () =>
  new HttpError(
    404,
    'Ressource introuvable',
    'participant_not_found',
    'Ce personnage ne participe pas au combat',
  );

/** Participant qui agit maintenant : celui du tour (individual), l'acteur désigné (slots). */
export function currentActorOf(state: CombatState): string | null {
  if (state.mode === 'individual') return state.order[state.currentIndex]?.characterId ?? null;
  return state.currentActorId;
}

/** Camp du créneau courant (mode slots), sinon null. */
export const currentSlotSide = (state: CombatState): Side | null =>
  state.mode === 'slots' ? (state.slots?.[state.currentIndex] ?? null) : null;

/** Participants qui peuvent agir maintenant. */
export function canActNow(state: CombatState): Participant[] {
  if (state.mode === 'individual') {
    const p = state.order[state.currentIndex];
    return p && !p.hasActed ? [p] : [];
  }
  if (state.currentActorId) {
    const actor = state.order.find((p) => p.characterId === state.currentActorId);
    return actor ? [actor] : [];
  }
  const side = currentSlotSide(state);
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
 * Tour suivant : le participant `characterId` (par défaut l'acteur désigné, ou le premier qui
 * peut agir) a agi, on passe au participant ou au créneau suivant. Après le dernier, un nouveau
 * round commence et personne n'a encore agi.
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
        notTheirTurnReason(state.mode === 'individual', Boolean(state.currentActorId)),
      );
  }
  const order = state.order.map((p) => (p === actor ? { ...p, hasActed: true } : p));
  const size = state.mode === 'individual' ? order.length : (state.slots?.length ?? 0);
  const currentIndex = state.currentIndex + 1;
  const common = { currentActorId: null, turn: state.turn + 1 };
  if (currentIndex < size) {
    return {
      state: { ...state, ...common, order, currentIndex },
      acted: actor?.characterId ?? null,
      endOfRound: false,
    };
  }
  return {
    state: {
      ...state,
      ...common,
      round: state.round + 1,
      currentIndex: 0,
      order: order.map((p) => ({ ...p, hasActed: false })),
    },
    acted: actor?.characterId ?? null,
    endOfRound: true,
  };
}

/**
 * Donner le tour (MJ), sans marquer personne : à un participant (individual), à un créneau
 * (`slotIndex`, slots), ou en mode slots à un participant, qui devient l'acteur du prochain
 * créneau de son camp (à partir du créneau courant).
 */
export function setTurn(
  state: CombatState,
  target: { characterId?: string; slotIndex?: number },
): CombatState {
  const turn = state.turn + 1;
  if (state.mode === 'individual') {
    if (target.characterId === undefined)
      throw HttpError.badRequest(
        'En mode individuel, le tour se donne à un participant (characterId)',
        'participant_required',
      );
    const index = state.order.findIndex((p) => p.characterId === target.characterId);
    if (index < 0) throw participantNotFound();
    return { ...state, currentIndex: index, turn };
  }
  const slots = state.slots ?? [];
  if (target.slotIndex !== undefined) {
    if (target.slotIndex >= slots.length)
      throw HttpError.badRequest('Ce créneau n’existe pas', 'slot_not_found');
    return { ...state, currentIndex: target.slotIndex, currentActorId: null, turn };
  }
  const p = state.order.find((x) => x.characterId === target.characterId);
  if (!p) throw participantNotFound();
  const indices = slots.flatMap((s, i) => (s === p.side ? [i] : []));
  const index = indices.find((i) => i >= state.currentIndex) ?? indices[0];
  if (index === undefined)
    throw HttpError.conflict('Aucun créneau pour le camp de ce personnage', 'no_slot');
  return { ...state, currentIndex: index, currentActorId: p.characterId, turn };
}

/**
 * Acteur du créneau courant (mode slots) : un participant du camp du créneau. Déjà agi ce
 * round : seulement avec `force` (il rejoue, comme dans l'ancienne app).
 */
export function chooseSlotActor(
  state: CombatState,
  characterId: string,
  force = false,
): CombatState {
  if (state.mode !== 'slots')
    throw HttpError.conflict('Pas de créneaux dans ce combat (mode individuel)', 'not_slots');
  const p = state.order.find((x) => x.characterId === characterId);
  if (!p) throw participantNotFound();
  if (p.side !== currentSlotSide(state))
    throw notTheirTurn('Le créneau courant n’est pas celui du camp de ce personnage');
  if (p.hasActed && !force)
    throw HttpError.conflict('Ce personnage a déjà agi pendant ce round', 'already_acted');
  return { ...state, currentActorId: characterId, turn: state.turn + 1 };
}

/**
 * Créneau qui garde le même camp et le même rang dans son camp quand les créneaux changent
 * (ordre modifié) : le n-ième créneau `players` reste le n-ième créneau `players`.
 */
export function followSlot(before: Side[], index: number, after: Side[]): number {
  const side = before[index];
  if (side === undefined || !after.length) return 0;
  const rank = before.slice(0, index).filter((s) => s === side).length;
  const same = after.flatMap((s, i) => (s === side ? [i] : []));
  return same[rank] ?? same.at(-1) ?? Math.min(index, after.length - 1);
}

/**
 * Nouvel ordre : le tour reste au même participant (individual) ou au même créneau de camp
 * (slots, créneaux recalculés depuis l'ordre). L'acteur désigné d'un autre camp est oublié.
 */
export function withOrder(state: CombatState, order: Participant[]): CombatState {
  if (state.mode === 'individual') {
    const currentId = state.order[state.currentIndex]?.characterId;
    const index = order.findIndex((p) => p.characterId === currentId);
    return {
      ...state,
      order,
      currentIndex:
        index >= 0 ? index : Math.min(state.currentIndex, Math.max(0, order.length - 1)),
    };
  }
  const slots = slotsOf(order);
  const currentIndex = followSlot(state.slots ?? [], state.currentIndex, slots);
  const actor = order.find((p) => p.characterId === state.currentActorId);
  return {
    ...state,
    order,
    slots,
    currentIndex,
    currentActorId: actor && actor.side === slots[currentIndex] ? actor.characterId : null,
  };
}

/** Place d'initiative d'un participant parmi `order` : avant le premier qu'il précède. */
function placeOf(order: Participant[], p: Participant): number {
  if (!p.sortKeys.length) return order.length;
  const index = order.findIndex((x) => compareInitiative(p, x) < 0);
  return index < 0 ? order.length : index;
}

/**
 * Des participants rejoignent le combat, chacun à sa place d'initiative (à la fin sans clés).
 * S'il entre avant le tour courant, `currentIndex` suit : le tour ne change pas de main. En
 * mode slots, un créneau de son camp s'ajoute à sa place.
 */
export function addParticipants(state: CombatState, added: Participant[]): CombatState {
  let { order, currentIndex } = state;
  const slots = state.slots ? [...state.slots] : null;
  for (const p of added) {
    const at = placeOf(order, p);
    order = [...order.slice(0, at), p, ...order.slice(at)];
    if (slots) {
      const slotAt = Math.min(at, slots.length);
      slots.splice(slotAt, 0, p.side);
      if (slotAt <= currentIndex && slots.length > 1) currentIndex++;
    } else if (at <= currentIndex && order.length > 1) currentIndex++;
  }
  return { ...state, order, slots, currentIndex };
}

/** Participant replacé à sa place d'initiative (clés changées), le tour ne change pas de main. */
export function placeParticipant(state: CombatState, characterId: string): CombatState {
  const p = state.order.find((x) => x.characterId === characterId);
  if (!p) throw participantNotFound();
  const others = state.order.filter((x) => x !== p);
  const at = placeOf(others, p);
  return withOrder(state, [...others.slice(0, at), p, ...others.slice(at)]);
}

/** Modifie un participant (identité inchangée). */
export function updateParticipant(
  state: CombatState,
  characterId: string,
  change: Partial<Omit<Participant, 'characterId' | 'side'>>,
): CombatState {
  if (!state.order.some((p) => p.characterId === characterId)) throw participantNotFound();
  return {
    ...state,
    order: state.order.map((p) => (p.characterId === characterId ? { ...p, ...change } : p)),
  };
}

/** Retrait en cours : ordre, créneaux et tour courant mis à jour participant par participant. */
interface Removal {
  order: CombatState['order'];
  slots: NonNullable<CombatState['slots']> | null;
  currentIndex: number;
  /** Le créneau courant a disparu. */
  slotChanged: boolean;
}

/** Créneau du camp qui disparaît avec un participant : un passé s'il avait agi, sinon un à venir. */
function slotToRemove(
  slots: NonNullable<CombatState['slots']>,
  p: CombatState['order'][number],
  currentIndex: number,
): number | undefined {
  const indices = slots.flatMap((s, i) => (s === p.side ? [i] : []));
  const past = indices.filter((i) => i < currentIndex);
  const upcoming = indices.filter((i) => i >= currentIndex);
  return p.hasActed ? (past.at(-1) ?? upcoming.at(-1)) : (upcoming.at(-1) ?? past.at(-1));
}

/** Retire un participant (absent : rien ne change). */
function removeOne(r: Removal, id: string): void {
  const index = r.order.findIndex((p) => p.characterId === id);
  if (index < 0) return;
  const p = r.order[index]!;
  r.order = r.order.filter((_, i) => i !== index);
  if (!r.slots) {
    if (index < r.currentIndex) r.currentIndex--;
    return;
  }
  const removed = slotToRemove(r.slots, p, r.currentIndex);
  if (removed === undefined) return;
  r.slots.splice(removed, 1);
  if (removed < r.currentIndex) r.currentIndex--;
  else if (removed === r.currentIndex) r.slotChanged = true;
}

/**
 * Retire des participants (personnage retiré de la campagne ou du combat). En mode slots,
 * un créneau de son camp disparaît aussi : un créneau passé s'il avait déjà agi, sinon un
 * créneau à venir. Si le tour courant n'existe plus, un nouveau round commence (sans décompte
 * des durées).
 */
export function remove(state: CombatState, characterIds: string[]): CombatState {
  const r: Removal = {
    order: state.order,
    slots: state.slots ? [...state.slots] : null,
    currentIndex: state.currentIndex,
    slotChanged: false,
  };
  for (const id of characterIds) removeOne(r, id);
  let currentIndex = r.currentIndex;
  let round = state.round;
  let order = r.order;
  const slots = r.slots;
  const size = slots ? slots.length : order.length;
  if (currentIndex >= size && size > 0) {
    currentIndex = 0;
    round++;
    order = order.map((p) => ({ ...p, hasActed: false }));
  }
  if (size === 0) currentIndex = 0;
  const actorGone = state.currentActorId !== null && characterIds.includes(state.currentActorId);
  return {
    ...state,
    round,
    currentIndex,
    order,
    slots,
    currentActorId:
      actorGone || r.slotChanged || round !== state.round ? null : state.currentActorId,
  };
}

function notTheirTurnReason(individual: boolean, designated: boolean): string {
  if (individual) return 'Ce n’est pas le tour de ce personnage';
  return designated
    ? 'Un autre participant a été désigné pour ce créneau'
    : 'Ce personnage ne peut pas agir pendant ce créneau (autre camp, ou il a déjà agi)';
}
