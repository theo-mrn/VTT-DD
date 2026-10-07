/**
 * Delta d'une écriture du combat et son annulation (sans base) : chaque élément revient à sa
 * valeur d'avant s'il n'a pas changé depuis ; conversions du moteur vers le contrat.
 */
import { EtatEntite, nouvellePossession } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { catalogueReference } from './catalogue.js';
import {
  annuler,
  deltaEtat,
  deltaVide,
  modificationsDecidees,
  versModification,
} from './combat.js';

const etat = (o: Partial<EtatEntite> = {}): EtatEntite =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: 'dnd-classic', version: '1.0.0' },
    creation: false,
    ...o,
  });

describe('delta et annulation', () => {
  const avant = etat({
    valeurs: { PV: 10, FOR: 12 },
    possessions: [
      nouvellePossession('epee-longue'),
      nouvellePossession('aveugle', 0, { duree: 1 }),
      nouvellePossession('effraye', 0, { duree: 3 }),
    ],
  });
  // Un round passe : l'aveuglement expire, l'effroi baisse ; 4 dégâts
  const apres = etat({
    valeurs: { PV: 6, FOR: 12 },
    possessions: [
      nouvellePossession('epee-longue'),
      nouvellePossession('effraye', 0, { duree: 2 }),
    ],
  });

  it('ne garde que ce qui a changé', () => {
    const d = deltaEtat(avant, apres);
    expect(d.valeurs).toEqual([{ cle: 'PV', index: -1, avant: 10, apres: 6 }]);
    expect(d.possessions.map((p) => p.cle)).toEqual(['aveugle', 'effraye']);
    expect(deltaVide(d)).toBe(false);
    expect(deltaVide(deltaEtat(avant, avant))).toBe(true);
  });

  it('rend chaque élément à sa place', () => {
    const r = annuler(apres, deltaEtat(avant, apres));
    expect(r.conflits).toEqual([]);
    expect(r.etat.valeurs).toEqual(avant.valeurs);
    expect(r.etat.possessions).toEqual(avant.possessions);
  });

  it('conflit sur un élément changé depuis ; les autres changements sont gardés avec force', () => {
    const depuis = { ...apres, valeurs: { ...apres.valeurs, PV: 2, FOR: 14 } };
    const r = annuler(depuis, deltaEtat(avant, apres));
    expect(r.conflits).toEqual(['etat.valeurs.PV']);
    expect(r.etat).toBe(depuis);
    const f = annuler(depuis, deltaEtat(avant, apres), true);
    expect(f.etat.valeurs).toEqual({ PV: 10, FOR: 14 });
    expect(f.etat.possessions).toEqual(avant.possessions);
  });
});

describe('delta et annulation : usages limités', () => {
  it('une fin de combat qui rend les usages s’annule : ils redeviennent consommés', () => {
    const avant = etat({ usages: { 'guerrier-resistance-second-souffle': 1, riposte: 2 } });
    const apres = etat({ usages: {} });
    const d = deltaEtat(avant, apres);
    expect(d.usages?.map((u) => u.cle)).toEqual(['guerrier-resistance-second-souffle', 'riposte']);
    expect(deltaVide(d)).toBe(false);
    expect(annuler(apres, d).etat.usages).toEqual(avant.usages);
    // Consommé depuis : conflit
    const depuis = etat({ usages: { riposte: 1 } });
    expect(annuler(depuis, d).conflits).toEqual(['etat.usages.riposte']);
    // Delta enregistré avant les usages : rien à rendre
    expect(deltaVide({ valeurs: [], possessions: [], bonus: [] })).toBe(true);
  });
});

describe('conversions vers le contrat', () => {
  it('une entrée donnée garde ses rangs et sa durée dans les bornes du contrat', () => {
    expect(
      versModification({
        entite: 'cible',
        entree: 'aveugle',
        operation: 'donner',
        rangs: 1.4,
        duree: 0,
      }),
    ).toEqual({ kind: 'entry', entity: 'target', entry: 'aveugle', operation: 'give', ranks: 1 });
    expect(
      versModification({
        entite: 'acteur',
        attribut: 'stress',
        operation: 'ajouter',
        valeur: 2,
        type: 'feu',
        brut: 4,
        resistances: [{ source: 'x', nom: 'X', operation: 'multiplier', valeur: 0.5 }],
      }),
    ).toEqual({
      kind: 'attribute',
      entity: 'actor',
      attribute: 'stress',
      operation: 'add',
      value: 2,
      damageType: 'feu',
      raw: 4,
      resistances: [{ source: 'x', name: 'X', operation: 'multiply', value: 0.5, ignored: false }],
    });
    // Minimum qui a relevé les dégâts (« au moins 1 DM ») : dans le rapport du MJ
    expect(
      versModification({
        entite: 'cible',
        attribut: 'PV',
        operation: 'retirer',
        valeur: 1,
        brut: 2,
        resistances: [{ source: 'rd', nom: 'Peau de pierre', operation: 'reduire', valeur: 5 }],
        minimum: 1,
      }),
    ).toMatchObject({ value: 1, raw: 2, minimum: 1, resistances: [{ name: 'Peau de pierre' }] });
  });
});

describe('durées au tour d’un personnage (docs/combat.md § 18)', () => {
  const ATTAQUANT = '0b5c1c9e-7f37-4b8a-9d55-1f2d3c4b5a69';

  it('la source devient l’attaquant ; la fin de round ne dit rien de plus', () => {
    const donner = {
      entite: 'cible' as const,
      entree: 'aveugle',
      operation: 'donner' as const,
      rangs: 1,
      duree: 1,
    };
    expect(
      versModification({ ...donner, decompte: { moment: 'debut-tour', source: true } }, ATTAQUANT),
    ).toMatchObject({ duration: 1, timing: { moment: 'turn_start', anchorId: ATTAQUANT } });
    // Porteur : pas d'ancre ; source inconnue : le porteur
    expect(versModification({ ...donner, decompte: { moment: 'fin-tour' } })).toMatchObject({
      timing: { moment: 'turn_end' },
    });
    expect(
      versModification({ ...donner, decompte: { moment: 'fin-tour', source: true } }).timing,
    ).toEqual({ moment: 'turn_end' });
    expect(versModification(donner)).not.toHaveProperty('timing');
  });

  it('décision du MJ : le moment et l’ancre passent au moteur', () => {
    const dnd = catalogueReference().charge('dnd-classic')!;
    const d = modificationsDecidees(
      dnd,
      'personnage',
      [
        {
          kind: 'entry',
          entry: 'aveugle',
          operation: 'give',
          ranks: 1,
          duration: 2,
          timing: { moment: 'turn_end', anchorId: ATTAQUANT },
        },
        {
          kind: 'entry',
          entry: 'effraye',
          operation: 'give',
          ranks: 1,
          duration: 2,
          timing: { moment: 'round_end' },
        },
      ],
      [],
    );
    expect(d.erreurs).toEqual([]);
    expect(d.modifications).toEqual([
      {
        entite: 'cible',
        entree: 'aveugle',
        operation: 'donner',
        rangs: 1,
        duree: 2,
        decompte: { moment: 'fin-tour', de: ATTAQUANT },
      },
      { entite: 'cible', entree: 'effraye', operation: 'donner', rangs: 1, duree: 2 },
    ]);
  });
});
