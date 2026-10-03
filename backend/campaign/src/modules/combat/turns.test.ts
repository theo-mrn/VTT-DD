/**
 * Règles de tour sans base : tri d'initiative, individual, slots, retrait, ajout, donner le
 * tour, acteur du créneau, réordonner.
 */
import { describe, expect, it } from 'vitest';
import type { Side } from '../../db/schema.js';
import {
  addParticipants,
  canActNow,
  chooseSlotActor,
  currentActorOf,
  followSlot,
  next,
  participant,
  placeParticipant,
  remove,
  setTurn,
  sortByInitiative,
  start,
  updateParticipant,
  withOrder,
  type Participant,
} from './turns.js';

const p = (characterId: string, side: Side, sortKeys: number[] = []): Participant =>
  participant(characterId, side, { sortKeys });
const ids = (order: Participant[]) => order.map((x) => x.characterId);

describe('sortByInitiative', () => {
  it('clé par clé, la plus haute d’abord', () => {
    const order = sortByInitiative([
      p('a', 'enemies', [2, 5]),
      p('b', 'players', [3, 0]),
      p('c', 'allies', [2, 7]),
    ]);
    expect(order.map((x) => x.characterId)).toEqual(['b', 'c', 'a']);
  });

  it('égalité parfaite : camp players d’abord, puis ordre reçu', () => {
    const order = sortByInitiative([
      p('e1', 'enemies', [10]),
      p('p1', 'players', [10]),
      p('al', 'allies', [10]),
      p('p2', 'players', [10]),
      p('e2', 'enemies', [10]),
    ]);
    expect(order.map((x) => x.characterId)).toEqual(['p1', 'p2', 'e1', 'al', 'e2']);
  });

  it('une clé absente compte comme la plus basse', () => {
    const order = sortByInitiative([p('a', 'players', [4]), p('b', 'enemies', [4, 0])]);
    expect(order.map((x) => x.characterId)).toEqual(['b', 'a']);
  });
});

describe('next', () => {
  it('individual : chacun son tour, nouveau round après le dernier', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'enemies')]);
    expect(canActNow(state).map((x) => x.characterId)).toEqual(['a']);
    expect(() => next(state, 'b')).toThrow(/pas le tour/);
    const one = next(state);
    expect(one).toMatchObject({ acted: 'a', endOfRound: false });
    state = one.state;
    const two = next(state, 'b');
    expect(two.endOfRound).toBe(true);
    expect(two.state).toMatchObject({ round: 2, currentIndex: 0 });
    expect(two.state.order.every((x) => !x.hasActed)).toBe(true);
  });

  it('slots : n’importe quel membre du camp qui n’a pas agi', () => {
    let state = start('slots', [p('p1', 'players'), p('e1', 'enemies'), p('p2', 'players')]);
    expect(state.slots).toEqual(['players', 'enemies', 'players']);
    state = next(state, 'p2').state;
    expect(() => next(state, 'p1')).toThrow(/créneau/);
    state = next(state, 'e1').state;
    expect(() => next(state, 'p2')).toThrow(/créneau/);
    const end = next(state, 'p1');
    expect(end.endOfRound).toBe(true);
    expect(end.state.round).toBe(2);
  });
});

describe('remove', () => {
  it('individual : le tour courant reste sur le même participant', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'players'), p('c', 'players')]);
    state = next(state).state;
    const after = remove(state, ['a']);
    expect(after.currentIndex).toBe(0);
    expect(canActNow(after).map((x) => x.characterId)).toEqual(['b']);
  });

  it('slots : un créneau du camp disparaît avec le participant', () => {
    const state = start('slots', [p('p1', 'players'), p('e1', 'enemies'), p('p2', 'players')]);
    const after = remove(state, ['p2']);
    expect(after.slots).toEqual(['players', 'enemies']);
    expect(after.order.map((x) => x.characterId)).toEqual(['p1', 'e1']);
  });

  it('plus de tour courant : nouveau round, sans participant : index 0', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'players')]);
    state = next(state).state;
    expect(remove(state, ['b'])).toMatchObject({ round: 2, currentIndex: 0 });
    expect(remove(state, ['a', 'b'])).toMatchObject({ currentIndex: 0, order: [] });
  });
});

describe('acteur du créneau (slots)', () => {
  const combat = () => start('slots', [p('p1', 'players'), p('e1', 'enemies'), p('p2', 'players')]);

  it('désigné : lui seul termine le créneau, puis le créneau suivant est libre', () => {
    let state = chooseSlotActor(combat(), 'p2');
    expect(state.currentActorId).toBe('p2');
    expect(state.turn).toBe(1);
    expect(currentActorOf(state)).toBe('p2');
    expect(canActNow(state).map((x) => x.characterId)).toEqual(['p2']);
    expect(() => next(state, 'p1')).toThrow(/désigné/);
    const after = next(state);
    expect(after.acted).toBe('p2');
    state = after.state;
    expect(state).toMatchObject({ currentIndex: 1, currentActorId: null, turn: 2 });
  });

  it('refus : autre camp, déjà agi sans force, mode individuel', () => {
    expect(() => chooseSlotActor(combat(), 'e1')).toThrow(/camp/);
    const state = next(combat(), 'p1').state;
    const players = next(state, 'e1').state;
    expect(() => chooseSlotActor(players, 'p1')).toThrow(/déjà agi/);
    expect(chooseSlotActor(players, 'p1', true).currentActorId).toBe('p1');
    expect(() => chooseSlotActor(start('individual', [p('a', 'players')]), 'a')).toThrow(
      /individuel/,
    );
  });

  it('retrait de l’acteur désigné : le créneau redevient libre', () => {
    const state = chooseSlotActor(combat(), 'p1');
    expect(remove(state, ['p1']).currentActorId).toBeNull();
  });
});

describe('donner le tour', () => {
  it('individual : à un participant, sans marquer personne', () => {
    const state = setTurn(start('individual', [p('a', 'players'), p('b', 'enemies')]), {
      characterId: 'b',
    });
    expect(state).toMatchObject({ currentIndex: 1, turn: 1 });
    expect(state.order.every((x) => !x.hasActed)).toBe(true);
    expect(() => setTurn(state, { slotIndex: 0 })).toThrow(/participant/);
    expect(() => setTurn(state, { characterId: 'zz' })).toThrow(/ne participe pas/);
  });

  it('slots : à un créneau, ou au prochain créneau du camp d’un participant', () => {
    const state = start('slots', [p('p1', 'players'), p('e1', 'enemies'), p('p2', 'players')]);
    expect(setTurn(state, { slotIndex: 2 })).toMatchObject({
      currentIndex: 2,
      currentActorId: null,
    });
    expect(() => setTurn(state, { slotIndex: 3 })).toThrow(/créneau/);
    const on = setTurn({ ...state, currentIndex: 1 }, { characterId: 'p1' });
    expect(on).toMatchObject({ currentIndex: 2, currentActorId: 'p1' });
  });
});

describe('ajout de participants', () => {
  it('individual : à sa place d’initiative, le tour ne change pas de main', () => {
    let state = start('individual', [p('a', 'players', [18]), p('b', 'enemies', [10])]);
    state = next(state).state; // tour de b
    const added = addParticipants(state, [p('c', 'allies', [15]), p('d', 'enemies', [2])]);
    expect(ids(added.order)).toEqual(['a', 'c', 'b', 'd']);
    expect(added.currentIndex).toBe(2);
    expect(currentActorOf(added)).toBe('b');
    // Sans initiative : à la fin
    expect(ids(addParticipants(state, [p('e', 'enemies')]).order)).toEqual(['a', 'b', 'e']);
  });

  it('slots : un créneau de son camp à sa place', () => {
    let state = start('slots', [p('p1', 'players', [3]), p('e1', 'enemies', [1])]);
    state = next(state, 'p1').state; // créneau enemies
    const added = addParticipants(state, [p('p2', 'players', [2])]);
    expect(added.slots).toEqual(['players', 'players', 'enemies']);
    expect(added.currentIndex).toBe(2);
  });
});

describe('réordonner, replacer', () => {
  it('individual : le tour reste au même participant', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'enemies'), p('c', 'allies')]);
    state = next(state).state; // tour de b
    const byId = new Map(state.order.map((x) => [x.characterId, x]));
    const moved = withOrder(
      state,
      ['b', 'c', 'a'].map((id) => byId.get(id)!),
    );
    expect(moved.currentIndex).toBe(0);
    expect(currentActorOf(moved)).toBe('b');
  });

  it('slots : le créneau courant garde son camp et son rang dans le camp', () => {
    expect(
      followSlot(['enemies', 'players', 'enemies', 'players'], 2, [
        'players',
        'enemies',
        'players',
        'enemies',
      ]),
    ).toBe(3);
    const state = {
      ...start('slots', [p('e1', 'enemies'), p('p1', 'players'), p('e2', 'enemies')]),
      currentIndex: 2,
    };
    const byId = new Map(state.order.map((x) => [x.characterId, x]));
    const moved = withOrder(
      state,
      ['p1', 'e1', 'e2'].map((id) => byId.get(id)!),
    );
    expect(moved.slots).toEqual(['players', 'enemies', 'enemies']);
    expect(moved.currentIndex).toBe(2);
  });

  it('initiative saisie : replacé, tour inchangé', () => {
    let state = start('individual', [
      p('a', 'players', [18]),
      p('b', 'enemies', [10]),
      p('c', 'allies', [5]),
    ]);
    state = next(state).state; // tour de b
    state = updateParticipant(state, 'c', { sortKeys: [20] });
    state = placeParticipant(state, 'c');
    expect(ids(state.order)).toEqual(['c', 'a', 'b']);
    expect(currentActorOf(state)).toBe('b');
  });
});
