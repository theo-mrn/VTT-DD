import type { AttackTargetResult, AttackTargetView } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { attack, attackTarget } from './test-kit';
import { decisionLabel, outcomeLabel, targetDisplay, targetName } from './view';

const view: AttackTargetView = {
  outcome: { success: true, critical: false, fumble: false },
  roll: {
    kind: 'numeric',
    formula: '1d20 + 5',
    dice: [{ faces: 20, values: [{ value: 14, kept: true, exploded: false, source: 'server' }] }],
    value: 19,
    bonuses: [],
    total: 19,
    natural: 14,
  },
  values: [{ key: 'degats', name: 'Dégâts', value: 7 }],
  explanations: ['Jet : 19', 'Défense de la cible : comparée'],
};

// Tout ce qui trahirait la fiche du PNJ : sa Défense, ses PV, sa résistance
const result: AttackTargetResult = {
  outcome: { success: true, critical: false, fumble: false },
  roll: view.roll,
  variables: { degats: 7, 'cible.Defense': 13, PV_restants: 3 },
  modifications: [
    {
      kind: 'attribute',
      entity: 'target',
      attribute: 'PV',
      operation: 'subtract',
      value: 4,
      raw: 7,
      resistances: [
        { source: 'peau', name: 'Peau de pierre', operation: 'reduce', value: 3, ignored: false },
      ],
    },
  ],
  tables: [],
  explanations: ['Jet : 19 contre Défense 13', 'Peau de pierre : −3'],
  errors: [],
};

const SECRETS = ['Défense 13', 'Peau de pierre', 'PV_restants', 'cible.Defense'];

describe('non-fuite : ce qu’un joueur voit d’une attaque', () => {
  it('vue expurgée : la vue de l’attaquant seule, même si le résultat complet arrivait', () => {
    // Le serveur ne doit jamais l'envoyer ; s'il le faisait, rien n'en serait affiché
    const a = attack({
      redacted: true,
      targets: [attackTarget({ view, result, applied: null })],
    });
    const d = targetDisplay(a, a.targets[0]!);
    expect(d.outcome).toEqual(view.outcome);
    expect(d.values).toEqual(view.values);
    expect(d.explanations).toEqual(view.explanations);
    expect(d.modifications).toEqual([]);
    expect(d.tables).toEqual([]);
    expect(d.full).toBe(false);
    const shown = JSON.stringify(d);
    for (const secret of SECRETS) expect(shown).not.toContain(secret);
  });

  it('MJ : le résultat complet', () => {
    const a = attack({ targets: [attackTarget({ view, result })] });
    const d = targetDisplay(a, a.targets[0]!);
    expect(d.full).toBe(true);
    expect(d.modifications).toHaveLength(1);
    expect(d.explanations).toEqual(result.explanations);
  });

  it('cible inconnue de ma liste : « Adversaire », jamais sa fiche', () => {
    const known = new Map([['hero', { id: 'hero', name: 'Aria', portraitUrl: null }]]);
    expect(targetName('hero', known)).toBe('Aria');
    expect(targetName('pnj-cache', known)).toBe('Adversaire');
  });
});

describe('libellés', () => {
  it('issue : Touché, Raté, Critique, Échec critique', () => {
    const o = (success: boolean, critical = false, fumble = false) => ({
      success,
      critical,
      fumble,
    });
    expect(outcomeLabel(o(true), true)?.label).toBe('Touché');
    expect(outcomeLabel(o(false), true)?.label).toBe('Raté');
    expect(outcomeLabel(o(true, true), true)?.label).toBe('Critique');
    expect(outcomeLabel(o(false, false, true), true)?.label).toBe('Échec critique');
    // Sans condition de réussite (soin) : pas de « Raté »
    expect(outcomeLabel(o(false), false)).toBeNull();
    expect(outcomeLabel(null, true)).toBeNull();
  });

  it('décision vue par l’auteur, sans montants', () => {
    expect(decisionLabel('applied')).toBe('Appliqué');
    expect(decisionLabel('skipped')).toBe('Non appliqué');
    expect(decisionLabel('pending')).toBeNull();
  });
});
