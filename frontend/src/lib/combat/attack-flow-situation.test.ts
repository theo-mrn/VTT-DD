import { describe, expect, it } from 'vitest';
import {
  attackerChips,
  combatSituation,
  situationIconOf,
  targetChips,
} from './attack-flow-situation';
import { combatState } from './test-kit';

const tally = (t: Partial<Record<string, number>> = {}) => ({
  attacksMadeRound: 0,
  attacksMade: 0,
  targetedRound: 0,
  targeted: 0,
  ...t,
});
const labels = (chips: { label: string }[]) => chips.map((c) => c.label);

describe('situation du combat en puces (§ 5.7)', () => {
  const combat = combatState({
    round: 2,
    order: [
      { characterId: 'hero', side: 'players', sortKeys: [18], hasActed: false, tally: tally() },
      {
        characterId: 'gobelin',
        side: 'enemies',
        sortKeys: [12],
        hasActed: false,
        surprised: true,
        tally: tally({ targetedRound: 2, targeted: 3 }),
      },
      {
        characterId: 'loup',
        side: 'enemies',
        sortKeys: [8],
        hasActed: true,
        defeated: true,
        tally: tally({ targeted: 1 }),
      },
    ],
  });

  it('attaquant : première attaque du combat', () => {
    expect(labels(attackerChips(combat, 'hero'))).toEqual(['Première attaque']);
  });

  it('attaquant : attaques déjà faites ce round, surpris', () => {
    const c = combatState({
      order: [
        {
          characterId: 'hero',
          side: 'players',
          sortKeys: [],
          hasActed: true,
          surprised: true,
          tally: tally({ attacksMadeRound: 2, attacksMade: 5 }),
        },
      ],
    });
    expect(labels(attackerChips(c, 'hero'))).toEqual(['Surpris', 'A déjà attaqué 2 fois ce round']);
  });

  it('cible : surprise, pas encore agi, déjà visée N fois ce round', () => {
    expect(labels(targetChips(combat, 'gobelin', 'hero'))).toEqual([
      'Surpris',
      'N’a pas encore agi',
      'Déjà visé 2 fois ce round',
    ]);
  });

  it('cible : hors de combat, a agi, pas encore visée ce round', () => {
    expect(labels(targetChips(combat, 'loup', 'hero'))).toEqual([
      'Hors de combat',
      'Pas encore visé ce round',
    ]);
  });

  it('auto-attaque et personnage hors du combat', () => {
    expect(labels(targetChips(combat, 'hero', 'hero'))).toContain('Lui-même');
    expect(labels(targetChips(combat, 'marchand', 'hero'))).toEqual(['Hors du combat']);
    expect(labels(attackerChips(combat, 'marchand'))).toEqual(['Hors du combat']);
  });

  it('champs du décompte absents (serveur d’avant) : seulement ce qui est connu', () => {
    const bare = combatState();
    expect(attackerChips(bare, 'hero')).toEqual([]);
    expect(labels(targetChips(bare, 'gobelin', 'hero'))).toEqual(['N’a pas encore agi']);
    // Initiative pas tirée : personne n'« a pas encore agi »
    expect(targetChips({ ...bare, initiativeRolled: false }, 'gobelin', 'hero')).toEqual([]);
  });

  it('hors combat : rien à compter', () => {
    const s = combatSituation(null, 'hero', ['gobelin']);
    expect(s.inCombat).toBe(false);
    expect(s.attacker).toEqual([]);
    expect(s.targets).toEqual([{ characterId: 'gobelin', chips: [] }]);
  });

  it('une rangée par cible, dans l’ordre choisi', () => {
    const s = combatSituation(combat, 'hero', ['loup', 'gobelin']);
    expect(s.round).toBe(2);
    expect(s.targets.map((t) => t.characterId)).toEqual(['loup', 'gobelin']);
  });
});

describe('icônes des paramètres de situation', () => {
  it('celle de la présentation, sinon aucune', () => {
    const presentation = { combat: { situation: { icones: { couvert: 'couvert' } } } } as never;
    expect(situationIconOf(presentation, 'couvert')).toBe('couvert');
    expect(situationIconOf(presentation, 'avantage')).toBeNull();
    expect(situationIconOf(null, 'couvert')).toBeNull();
    expect(situationIconOf({ combat: {} } as never, 'couvert')).toBeNull();
  });
});
