/**
 * Décompte des attaques et contexte des règles (docs/combat.md § 5.7), sans base : ce round et
 * en tout, vue d'un joueur (publiques, attaquant vu), lignes d'une déclaration du lot.
 */
import { describe, expect, it } from 'vitest';
import { combatContextOf, rowsOfDeclaration, talliesOf, type TallyRow } from './tally.js';
import { participant } from './turns.js';

const [a, b, c] = ['a', 'b', 'c'];
const state = {
  round: 2,
  order: [
    participant(a, 'players', { hasActed: true }),
    participant(b, 'enemies', { surprised: true }),
    participant(c, 'enemies', { visibleToPlayers: false }),
  ],
};
const row = (
  kind: TallyRow['kind'],
  characterId: string,
  attackerId: string,
  round: number,
  visibility: TallyRow['visibility'],
  count = 1,
): TallyRow => ({ kind, characterId, attackerId, round, visibility, count });

const rows: TallyRow[] = [
  row('made', a, a, 1, 'public', 2),
  row('made', a, a, 2, 'public'),
  row('targeted', b, a, 1, 'public', 2),
  row('targeted', b, a, 2, 'public'),
  row('made', b, b, 2, 'gm'),
  row('targeted', a, b, 2, 'gm'),
  row('made', c, c, 2, 'public'),
  row('targeted', a, c, 2, 'public'),
];

describe('décompte des attaques', () => {
  it('MJ : toutes les attaques, ce round et en tout', () => {
    const t = talliesOf(rows, state, 'gm');
    expect(t.get(a)).toEqual({
      attacksMadeRound: 1,
      attacksMade: 3,
      targetedRound: 2,
      targeted: 2,
    });
    expect(t.get(b)).toEqual({
      attacksMadeRound: 1,
      attacksMade: 1,
      targetedRound: 1,
      targeted: 3,
    });
    expect(t.get(c)).toEqual({
      attacksMadeRound: 1,
      attacksMade: 1,
      targetedRound: 0,
      targeted: 0,
    });
  });

  it('joueur : attaques publiques d’un attaquant qu’il voit', () => {
    const t = talliesOf(rows, state, 'players');
    // Ni l'attaque secrète de b, ni celle du participant caché c
    expect(t.get(a)).toEqual({
      attacksMadeRound: 1,
      attacksMade: 3,
      targetedRound: 0,
      targeted: 0,
    });
    expect(t.get(b)).toEqual({
      attacksMadeRound: 0,
      attacksMade: 0,
      targetedRound: 1,
      targeted: 3,
    });
  });

  it('personnage hors du combat : ignoré', () => {
    expect(talliesOf([row('made', 'x', 'x', 2, 'public')], state, 'gm').has('x')).toBe(false);
  });
});

describe('contexte des règles (@combat.*)', () => {
  it('attaquant et cibles qui participent, décompte du MJ, a agi, surpris', () => {
    const ctx = combatContextOf(state, rows, a, [b, 'dehors', b]);
    expect(ctx).toEqual({
      round: 2,
      actor: {
        attacksMadeRound: 1,
        attacksMade: 3,
        targetedRound: 2,
        targeted: 2,
        hasActed: true,
        surprised: false,
      },
      targets: [
        {
          characterId: b,
          attacksMadeRound: 1,
          attacksMade: 1,
          targetedRound: 1,
          targeted: 3,
          hasActed: false,
          surprised: true,
        },
      ],
    });
    expect(combatContextOf(null, rows, a, [b])).toBeUndefined();
    expect(combatContextOf(state, rows, 'dehors', [b])?.actor).toBeUndefined();
  });

  it('une déclaration du lot compte pour les suivantes', () => {
    const avant = combatContextOf(state, [], b, [a])!;
    const apres = combatContextOf(state, rowsOfDeclaration(2, b, [a]), b, [a])!;
    expect([avant.actor?.attacksMade, apres.actor?.attacksMade]).toEqual([0, 1]);
    expect(apres.targets[0]).toMatchObject({ targeted: 1, targetedRound: 1 });
  });
});
