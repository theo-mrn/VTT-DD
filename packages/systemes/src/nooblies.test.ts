/**
 * Nooblies Chroniques : chargement du système et personnages de référence
 * (valeurs dérivées connues, calculées à la main depuis les règles legacy).
 */
import { describe, expect, it } from 'vitest';
import { calculer, EtatEntite, type EtatEntiteSaisi, type SystemeCharge } from '@vtt/rules';
import { chargerSource } from './test-utils.js';

const systeme: SystemeCharge = chargerSource('nooblies');

function fiche(saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>) {
  return calculer(
    systeme,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: 'nooblies', version: '1.0.0' },
      ...saisi,
    }),
  );
}

describe('Nooblies Chroniques', () => {
  it('se charge sans erreur, avec toutes ses races, profils et actions', () => {
    expect(systeme.source.version).toBe('1.0.0');
    const parSorte = (s: string) => [...systeme.entrees.values()].filter((e) => e.sorte === s);
    expect(parSorte('race')).toHaveLength(8);
    expect(parSorte('profil')).toHaveLength(11);
    expect([...systeme.actions.keys()]).toEqual(
      expect.arrayContaining([
        'attaque-contact',
        'attaque-distance',
        'attaque-magie',
        'initiative',
      ]),
    );
    expect(systeme.source.initiative?.action).toBe('initiative');
  });

  it('nain guerrier : modificateurs raciaux, combat et PV', () => {
    // Tirage : FOR 14, DEX 11, CON 16, SAG 9, INT 12, CHA 13 (3 paires, mods = 6)
    const f = fiche({
      valeurs: { FOR: 14, DEX: 11, CON: 16, SAG: 9, INT: 12, CHA: 13, jetDeVie: 7 },
      possessions: [{ entree: 'nain' }, { entree: 'guerrier' }],
    });
    expect(f.erreurs).toEqual([]);
    expect(f.valeur('DEX')).toBe(9); // 11 − 2
    expect(f.valeur('CON')).toBe(18); // 16 + 2
    expect(f.valeurs.get('DEX')?.modificateur).toBe(-1);
    expect(f.valeurs.get('CON')?.modificateur).toBe(4);
    expect(f.valeur('Defense')).toBe(17); // 18 − 1
    expect(f.valeur('Contact')).toBe(3); // 1 + 2
    expect(f.valeur('Distance')).toBe(0); // 1 − 1
    expect(f.valeur('Magie')).toBe(2); // 1 + 1
    expect(f.valeur('INIT')).toBe(9);
    expect(f.valeur('facesDeVie')).toBe(10);
    expect(f.valeur('PV_Max')).toBe(12); // 1 + 4 + 7
    expect(f.valeur('PV')).toBe(12); // démarre au maximum
    expect(f.possessions.has('vision-dans-le-noir')).toBe(true);
  });

  it('halfelin voleur : Petite taille (+1 DEF) et PV bornés au maximum', () => {
    // Tirage : FOR 8, DEX 17, CON 10, SAG 15, INT 12, CHA 13 (3 paires, mods = 6)
    const f = fiche({
      valeurs: { FOR: 8, DEX: 17, CON: 10, SAG: 15, INT: 12, CHA: 13, jetDeVie: 4, PV: 20 },
      possessions: [{ entree: 'halfelin' }, { entree: 'voleur' }],
    });
    expect(f.erreurs).toEqual([]);
    expect(f.valeur('FOR')).toBe(6);
    expect(f.valeur('DEX')).toBe(19);
    expect(f.valeur('Defense')).toBe(23); // 18 + 4 + 1 (Petite taille)
    expect(f.valeurs.get('Defense')?.detail.map((l) => l.source)).toEqual([
      'formule',
      'petite-taille',
    ]);
    expect(f.valeur('Contact')).toBe(-1); // 1 − 2
    expect(f.valeur('Distance')).toBe(5);
    expect(f.valeur('Magie')).toBe(2);
    expect(f.valeur('INIT')).toBe(19);
    expect(f.valeur('facesDeVie')).toBe(6);
    expect(f.valeur('PV_Max')).toBe(5); // 1 + 0 + 4
    expect(f.valeur('PV')).toBe(5); // 20 ramené au maximum
  });

  it('le jet de dé de vie ne dépasse pas le dé du profil', () => {
    const f = fiche({ valeurs: { jetDeVie: 9 }, possessions: [{ entree: 'ensorceleur' }] });
    expect(f.valeur('jetDeVie')).toBe(4);
  });

  it('contrainte de tirage : total des caractéristiques = 75', () => {
    const contrainte = systeme.formule('creation/personnage/caracteristiques/contrainte');
    const f = fiche({});
    const avec = (total: number) =>
      f.evaluer(contrainte, { variable: (n) => (n === 'total' ? total : 0) });
    expect(avec(75)).toBe(true);
    expect(avec(74)).toBe(false);
  });
});
