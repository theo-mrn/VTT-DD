import { describe, expect, it } from 'vitest';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { EtatEntite, type EtatEntiteSaisi } from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import { calculer } from './fiche.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

const d20 = systeme(miniD20);
const sym = systeme(miniSymboles);

const etat = (s: SystemeCharge, e: Partial<EtatEntiteSaisi>) =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: s.source.id, version: s.source.version },
    ...e,
  });

describe('fiche d20', () => {
  it('valeurs par défaut, dérivées et modificateurs', () => {
    const f = calculer(d20, etat(d20, {}));
    expect(f.valeur('FOR')).toBe(10);
    expect(f.valeurs.get('FOR')!.modificateur).toBe(0);
    expect(f.valeur('Defense')).toBe(10);
    expect(f.valeur('Contact')).toBe(1);
    expect(f.valeur('PV')).toBe(8);
    expect(f.valeur('alignement')).toBe('neutre');
    expect(f.erreurs).toEqual([]);
  });

  it('applique race, objets et familles non cumulables, avec explication', () => {
    const f = calculer(
      d20,
      etat(d20, {
        valeurs: { DEX: 15, CON: 12, niveau: 3, PV: 4 },
        possessions: [
          { entree: 'elfe' },
          { entree: 'armure-cuir' },
          { entree: 'cotte' },
          { entree: 'robustesse', rang: 2 },
        ],
      }),
    );
    expect(f.valeur('DEX')).toBe(17);
    expect(f.valeurs.get('DEX')!.modificateur).toBe(3);
    expect(f.valeur('CON')).toBe(10);
    // 10 + 3 (DEX) + 5 (cotte ; le cuir est de la même famille)
    expect(f.valeur('Defense')).toBe(18);
    expect(f.valeurs.get('Defense')!.detail).toEqual([
      { source: 'formule', nom: '10 + mod(@DEX)', operation: 'formule', valeur: 13 },
      { source: 'cotte', nom: 'Cotte de mailles', operation: 'ajouter', valeur: 5 },
      {
        source: 'armure-cuir',
        nom: 'Armure de cuir',
        operation: 'ajouter',
        valeur: 2,
        ignore: true,
      },
    ]);
    // 8 + 0 + 2×5 + 3×2 (robustesse rang 2)
    expect(f.valeur('PV_Max')).toBe(24);
    expect(f.valeur('PV')).toBe(4);
    expect(f.valeurs.get('PV')).toMatchObject({ min: 0, max: 24 });
  });

  it('un objet non équipé n’a pas d’effet', () => {
    const f = calculer(d20, etat(d20, { possessions: [{ entree: 'cotte', actif: false }] }));
    expect(f.valeur('Defense')).toBe(10);
  });

  it('borne les valeurs saisies', () => {
    const f = calculer(d20, etat(d20, { valeurs: { FOR: 35, PV: 99 } }));
    expect(f.valeur('FOR')).toBe(20);
    expect(f.valeur('PV')).toBe(8);
  });

  it('signale les possessions inconnues sans planter', () => {
    const f = calculer(d20, etat(d20, { possessions: [{ entree: 'epee-fantome' }] }));
    expect(f.erreurs).toEqual([
      { ou: 'possessions/epee-fantome', message: 'Entrée inconnue : epee-fantome' },
    ]);
  });
});

describe('fiche à symboles', () => {
  it('rangs gratuits, marques, agrégats et ressource qui démarre à 0', () => {
    const f = calculer(
      sym,
      etat(sym, {
        valeurs: { vigueur: 3 },
        possessions: [
          { entree: 'bothan' },
          { entree: 'chasseur' },
          { entree: 'athletisme', rang: 2 },
          { entree: 'dette', champs: { valeur: 10 } },
        ],
        noeuds: { 'arbre-chasseur': ['a1', 'a2'] },
      }),
    );
    expect(f.valeur('xpDepart')).toBe(100);
    expect(f.possessions.get('discretion')?.rang).toBe(1);
    expect(f.possessions.get('athletisme')?.rang).toBe(2);
    expect(f.marques.get('athletisme')).toEqual(new Set(['carriere']));
    expect(f.marques.get('discretion')).toBeUndefined();
    // Deux nœuds « robuste » = rang 2 → +4 au maximum de Blessures
    expect(f.possessions.get('robuste')?.rang).toBe(2);
    expect(f.valeurs.get('Blessures')).toMatchObject({ valeur: 0, max: 17 });
    expect(f.valeur('obligation')).toBe(20);
  });

  it('choix d’espèce qui donnent des rangs', () => {
    const f = calculer(
      sym,
      etat(sym, {
        possessions: [{ entree: 'humain', choix: { polyvalence: ['distance', 'discretion'] } }],
      }),
    );
    expect(f.possessions.get('distance')?.rang).toBe(1);
    expect(f.possessions.get('discretion')?.rang).toBe(1);
    expect(f.valeur('xpDepart')).toBe(110);
  });
});
