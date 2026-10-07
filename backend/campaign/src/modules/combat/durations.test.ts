/**
 * Événements d'un passage de tour pour le décompte des durées (docs/combat.md § 18.3), sans
 * base : individual, slots (acteur désigné ou non), donner le tour, premier tour ; et ce qu'un
 * joueur reçoit des durées décomptées.
 */
import { describe, expect, it } from 'vitest';
import type { Side } from '../../db/schema.js';
import { passageEvents, passageTickId, playerUpdates } from './durations.js';
import type { ParticipantRow } from './repository.js';
import { chooseSlotActor, next, participant, setTurn, start, type Participant } from './turns.js';

const p = (characterId: string, side: Side): Participant => participant(characterId, side);
const debut = (characterId: string) => ({ kind: 'turn_start', characterId });
const fin = (characterId: string) => ({ kind: 'turn_end', characterId });

describe('individual', () => {
  const s0 = start('individual', [p('a', 'players'), p('b', 'enemies')]);

  it('suivant : fin du tour de qui a agi, début du tour du suivant', () => {
    const adv = next(s0);
    expect(passageEvents('next', s0, adv.state, adv.acted)).toEqual([fin('a'), debut('b')]);
  });

  it('dernier du round : sa fin, la fin du round, puis le début du premier', () => {
    const s1 = next(s0).state;
    const adv = next(s1);
    expect(passageEvents('next', s1, adv.state, adv.acted)).toEqual([
      fin('b'),
      { kind: 'round_end', round: 1 },
      debut('a'),
    ]);
  });

  it('donner le tour : fin du tour en cours, début du tour donné ; au même, rien', () => {
    const s1 = setTurn(s0, { characterId: 'b' });
    expect(passageEvents('turn_set', s0, s1)).toEqual([fin('a'), debut('b')]);
    expect(passageEvents('turn_set', s0, setTurn(s0, { characterId: 'a' }))).toEqual([]);
  });

  it('participant qui avait déjà agi (tour donné) : son tour finit quand même', () => {
    const acted = { ...s0, order: s0.order.map((x) => ({ ...x, hasActed: true })) };
    const adv = next({ ...acted, order: [acted.order[0]!, { ...acted.order[1]! }] });
    expect(passageEvents('next', acted, adv.state, null)[0]).toEqual(fin('a'));
  });

  it('premier tour : le début du tour du premier', () => {
    expect(passageEvents('start', null, s0)).toEqual([debut('a')]);
  });
});

describe('slots', () => {
  const s0 = start('slots', [p('a', 'players'), p('x', 'enemies'), p('b', 'players')]);

  it('acteur désigné : son tour commence à la désignation et finit au passage', () => {
    const s1 = chooseSlotActor(s0, 'b');
    expect(passageEvents('slot_actor', s0, s1)).toEqual([debut('b')]);
    const adv = next(s1);
    // Créneau suivant sans acteur : aucun début de tour
    expect(passageEvents('next', s1, adv.state, adv.acted)).toEqual([fin('b')]);
  });

  it('créneau terminé sans désignation : début et fin du tour au même passage', () => {
    const adv = next(s0, 'a');
    expect(passageEvents('next', s0, adv.state, adv.acted)).toEqual([debut('a'), fin('a')]);
  });

  it('créneau vide (personne ne peut agir) : rien que la fin du round éventuelle', () => {
    const last = { ...s0, currentIndex: 2, order: s0.order.map((x) => ({ ...x, hasActed: true })) };
    const adv = next(last);
    expect(adv.acted).toBeNull();
    expect(passageEvents('next', last, adv.state, adv.acted)).toEqual([
      { kind: 'round_end', round: 1 },
    ]);
  });

  it('premier tour en slots : personne n’est encore désigné', () => {
    expect(passageEvents('start', null, s0)).toEqual([]);
  });
});

describe('identifiant et vue des joueurs', () => {
  it('un décompte par passage', () => {
    expect(passageTickId('c', 2, 'p')).toBe('tick:c:2:p');
  });

  it('un joueur ne reçoit que les durées des personnages vus des joueurs et des alliés', () => {
    const row = (characterId: string, side: Side, visibleToPlayers = true) =>
      ({ characterId, side, visibleToPlayers }) as ParticipantRow;
    const rows = [
      row('hero', 'players'),
      row('ally', 'allies'),
      row('gob', 'enemies'),
      row('spy', 'allies', false),
    ];
    const u = (characterId: string) => ({ characterId, expired: ['x'] });
    expect(
      playerUpdates(rows, [u('hero'), u('ally'), u('gob'), u('spy')]).map((x) => x.characterId),
    ).toEqual(['hero', 'ally']);
  });
});
