import { describe, expect, it } from 'vitest';
import { situationChips } from './situation';

const tally = (extra: Partial<Record<string, number>> = {}) => ({
  attacksMadeRound: 0,
  attacksMade: 0,
  targetedRound: 0,
  targeted: 0,
  ...extra,
});

const labels = (...args: Parameters<typeof situationChips>) =>
  situationChips(...args).map((c) => c.label);

describe('puces de situation', () => {
  it('surpris, a agi, visé ce round', () => {
    expect(
      labels({ hasActed: true, surprised: true, tally: tally({ targetedRound: 2, targeted: 3 }) }),
    ).toEqual(['Surpris', 'A agi', 'Visé ×2']);
  });

  it('« A agi » se tait pendant son tour', () => {
    expect(labels({ hasActed: true }, { current: true })).toEqual([]);
  });

  it('carte détaillée : première attaque à venir, ou attaques du round', () => {
    expect(labels({ hasActed: false, tally: tally() }, { detailed: true })).toEqual([
      '1re attaque à venir',
    ]);
    expect(
      labels(
        { hasActed: false, tally: tally({ attacksMadeRound: 2, attacksMade: 5 }) },
        { detailed: true },
      ),
    ).toEqual(['2 attaques ce round']);
    // Ligne de l'ordre : pas de place pour ces deux-là
    expect(labels({ hasActed: false, tally: tally() })).toEqual([]);
    // Hors de combat : plus d'attaque à venir
    expect(labels({ hasActed: false, defeated: true, tally: tally() }, { detailed: true })).toEqual(
      [],
    );
  });

  it('sans les champs du contrat (réponse d’avant) : seulement ce qu’on sait', () => {
    expect(labels({ hasActed: false }, { detailed: true })).toEqual([]);
    const hint = situationChips({
      hasActed: false,
      tally: tally({ targetedRound: 1, targeted: 4 }),
    })[0]!.hint;
    expect(hint).toBe('Visé 1 fois ce round (4 fois depuis le début du combat).');
  });
});
