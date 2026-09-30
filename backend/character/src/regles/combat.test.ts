/**
 * Delta d'une écriture du combat et son annulation (sans base) : chaque élément revient à sa
 * valeur d'avant s'il n'a pas changé depuis ; conversions du moteur vers le contrat.
 */
import { EtatEntite, nouvellePossession } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { annuler, deltaEtat, deltaVide, versModification } from './combat.js';

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
  });
});
