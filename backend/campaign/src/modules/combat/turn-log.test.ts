/**
 * Journal des passages de tour sans base : l'état d'avant, rendu par « Précédent » par identité
 * (l'ordre a pu changer depuis).
 */
import { describe, expect, it } from 'vitest';
import type { Side } from '../../db/schema.js';
import { restore, snapshotOf } from './turn-log.js';
import {
  addParticipants,
  chooseSlotActor,
  currentActorOf,
  next,
  participant,
  remove,
  start,
  type Participant,
} from './turns.js';

const p = (characterId: string, side: Side, sortKeys: number[] = []): Participant =>
  participant(characterId, side, { sortKeys });

describe('snapshotOf / restore', () => {
  it('suivant puis précédent : même participant, même round, personne n’a agi', () => {
    const state = start('individual', [p('a', 'players'), p('b', 'enemies'), p('c', 'allies')]);
    const before = snapshotOf(state);
    const after = next(state).state;
    expect(currentActorOf(after)).toBe('b');
    const back = restore(after, before);
    expect(back).toMatchObject({ round: 1, currentIndex: 0, turn: 0 });
    expect(back.order.every((x) => !x.hasActed)).toBe(true);
  });

  it('nouveau round annulé : round, qui a agi et tour d’avant', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'enemies')]);
    state = next(state).state;
    const before = snapshotOf(state);
    const round2 = next(state);
    expect(round2.endOfRound).toBe(true);
    const back = restore(round2.state, before);
    expect(back).toMatchObject({ round: 1, currentIndex: 1, turn: 1 });
    expect(back.order.map((x) => x.hasActed)).toEqual([true, false]);
  });

  it('plusieurs précédents remontent le journal', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'enemies'), p('c', 'allies')]);
    const log = [];
    for (let i = 0; i < 3; i++) {
      log.push(snapshotOf(state));
      state = next(state).state;
    }
    expect(state.round).toBe(2);
    while (log.length) state = restore(state, log.pop()!);
    expect(state).toMatchObject({ round: 1, currentIndex: 0, turn: 0 });
  });

  it('ordre changé depuis : le tour revient au même participant, pas au même index', () => {
    let state = start('individual', [p('a', 'players', [10]), p('b', 'enemies', [5])]);
    state = next(state).state; // tour de b
    const before = snapshotOf(state);
    state = next(state, 'b').state; // round 2, tour de a
    state = addParticipants(state, [p('c', 'allies', [20])]); // c en tête
    const back = restore(state, before);
    expect(back.order.map((x) => x.characterId)).toEqual(['c', 'a', 'b']);
    expect(currentActorOf(back)).toBe('b');
    expect(back.order.find((x) => x.characterId === 'a')!.hasActed).toBe(true);
    expect(back.order.find((x) => x.characterId === 'c')!.hasActed).toBe(false);
  });

  it('participant retiré depuis : pas remis, tour sur le rang le plus proche', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'enemies'), p('c', 'allies')]);
    state = next(state).state; // tour de b
    const before = snapshotOf(state);
    state = next(state).state; // tour de c
    state = remove(state, ['b']);
    const back = restore(state, before);
    expect(back.order.map((x) => x.characterId)).toEqual(['a', 'c']);
    expect(back.currentIndex).toBe(1);
  });

  it('slots : créneau et acteur désigné rendus', () => {
    let state = start('slots', [p('p1', 'players'), p('e1', 'enemies'), p('p2', 'players')]);
    state = chooseSlotActor(state, 'p2');
    const before = snapshotOf(state);
    state = next(state).state;
    const back = restore(state, before);
    expect(back).toMatchObject({ currentIndex: 0, currentActorId: 'p2', turn: 1 });
  });
});
