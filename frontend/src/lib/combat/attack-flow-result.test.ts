import type { AttackRoll, AttackTargetView } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { revealTimeline, sharedRoll, summarizeTarget } from './attack-flow-result';
import { attack, attackTarget } from './test-kit';

const d20: AttackRoll = {
  kind: 'numeric',
  formula: '1d20 + 5',
  dice: [{ faces: 20, values: [{ value: 14, kept: true, exploded: false, source: 'server' }] }],
  value: 19,
  bonuses: [{ source: 'beni', name: 'Béni', value: 1, side: 'actor' }],
  total: 20,
  natural: 14,
};
const view = (extra: Partial<AttackTargetView> = {}): AttackTargetView => ({
  outcome: { success: true, critical: false, fumble: false },
  roll: d20,
  values: [
    { key: 'degats', name: 'Dégâts', value: 7 },
    { key: 'type', name: 'Type', value: 'feu' },
  ],
  explanations: [],
  ...extra,
});

describe('résultat mis en scène (grand chiffre, touché, dégâts)', () => {
  it('jet numérique : dés + mod = total, touché, dégâts et leur détail', () => {
    const a = attack({ redacted: true, targets: [attackTarget({ view: view() })] });
    const s = summarizeTarget(a, a.targets[0]!, { successRule: true });
    expect(s.figure).toMatchObject({ kind: 'numeric', dice: 14, modifier: 6, total: 20 });
    expect(s.outcome).toEqual({ label: 'Touché', tone: 'success' });
    expect(s.hit).toBe(true);
    expect(s.damage).toEqual({
      value: 7,
      name: 'Dégâts',
      sense: null,
      details: [{ label: 'Type', value: 'feu' }],
    });
  });

  it('raté : pas de dégâts', () => {
    const miss = view({ outcome: { success: false, critical: false, fumble: false } });
    const a = attack({ redacted: true, targets: [attackTarget({ view: miss })] });
    const s = summarizeTarget(a, a.targets[0]!, { successRule: true });
    expect(s.outcome?.label).toBe('Raté');
    expect(s.hit).toBe(false);
    expect(s.damage).toBeNull();
  });

  it('sans condition de réussite (soin) : pas de touché ni raté, la valeur quand même', () => {
    const a = attack({ redacted: true, targets: [attackTarget({ view: view() })] });
    const s = summarizeTarget(a, a.targets[0]!, { successRule: false });
    expect(s.outcome).toBeNull();
    expect(s.hit).toBeNull();
    expect(s.damage?.value).toBe(7);
  });

  it('MJ : la modification proposée donne le sens et le détail des réductions', () => {
    const a = attack({
      targets: [
        attackTarget({
          view: view({ values: [] }),
          result: {
            outcome: { success: true, critical: true, fumble: false },
            roll: d20,
            variables: {},
            modifications: [
              {
                kind: 'attribute',
                entity: 'target',
                attribute: 'PV',
                operation: 'subtract',
                value: 5,
                raw: 9,
              },
            ],
            tables: [],
            explanations: [],
            errors: [],
          },
        }),
      ],
    });
    const s = summarizeTarget(a, a.targets[0]!, {
      successRule: true,
      attributeName: (k) => (k === 'PV' ? 'Points de vie' : k),
    });
    expect(s.outcome?.label).toBe('Critique');
    expect(s.damage).toEqual({
      value: 5,
      name: 'Points de vie',
      sense: 'subtract',
      details: [{ label: 'Points de vie', value: '−5 (9 avant réduction)' }],
    });
  });

  it('un joueur ne voit jamais le résultat complet, même s’il arrivait', () => {
    const a = attack({
      redacted: true,
      targets: [
        attackTarget({
          view: view({ values: [] }),
          result: {
            outcome: { success: true, critical: false, fumble: false },
            roll: d20,
            variables: { defenseCible: 14 },
            modifications: [
              {
                kind: 'attribute',
                entity: 'target',
                attribute: 'PV',
                operation: 'subtract',
                value: 5,
              },
            ],
            tables: [],
            explanations: ['Défense 14'],
            errors: [],
          },
        }),
      ],
    });
    const s = summarizeTarget(a, a.targets[0]!, { successRule: true });
    expect(s.damage).toBeNull();
    expect(s.display.modifications).toEqual([]);
  });

  it('pool à symboles : les symboles, pas de total', () => {
    const roll: AttackRoll = {
      kind: 'symbols',
      pool: [{ die: 'aptitude', count: 2 }],
      construction: [],
      dice: [],
      symbols: { succes: 2 },
      results: { succesNets: 2 },
    };
    const a = attack({ redacted: true, targets: [attackTarget({ view: view({ roll }) })] });
    expect(summarizeTarget(a, a.targets[0]!, { successRule: true }).figure).toEqual({
      kind: 'symbols',
      roll,
    });
  });

  it('un grand chiffre commun : une cible, ou un jet commun', () => {
    expect(sharedRoll(attack())).toBe(true);
    const two = [attackTarget(), attackTarget({ characterId: 'loup' })];
    expect(sharedRoll(attack({ targets: two }))).toBe(false);
    expect(sharedRoll(attack({ targets: two, rollMode: 'shared' }))).toBe(true);
  });

  it('dévoilement : le jet, l’issue, les dégâts, puis la fin ; instantané sinon', () => {
    const t = revealTimeline({ targets: 1, damage: true, instant: false });
    expect(t.outcome).toBeGreaterThan(0);
    expect(t.damage).toBeGreaterThan(t.outcome);
    expect(t.done).toBeGreaterThan(t.damage);
    const many = revealTimeline({ targets: 3, damage: true, instant: false });
    expect(many.damage).toBeGreaterThan(t.damage);
    const noDamage = revealTimeline({ targets: 1, damage: false, instant: false });
    expect(noDamage.done).toBeLessThan(t.done);
    expect(revealTimeline({ targets: 5, damage: true, instant: true })).toEqual({
      outcome: 0,
      damage: 0,
      done: 0,
    });
  });
});
