import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger } from '../chargement/index.js';
import { aleatoireImpose } from '../formules/index.js';
import { EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { appliquerModifications, executerAction, reduireDegats } from './index.js';

const saisi: SystemeSaisi = {
  ...miniD20,
  typesDegats: [
    { id: 'feu', nom: 'Feu' },
    { id: 'froid', nom: 'Froid' },
    { id: 'tranchant', nom: 'Tranchant' },
  ],
  sortes: [
    ...miniD20.sortes!,
    { id: 'trait', nom: 'Trait', pour: ['personnage'] },
    { id: 'etat', nom: 'État', pour: ['personnage'], rangs: { max: 5 } },
  ],
  catalogue: [
    ...miniD20.catalogue!,
    {
      id: 'ecailles',
      sorte: 'trait',
      nom: 'Écailles',
      effets: [
        {
          sur: 'degats',
          types: ['feu'],
          operation: 'multiplier',
          valeur: 0.5,
          famille: 'resistance-feu',
        },
        { sur: 'degats', operation: 'reduire', valeur: 2 },
        { sur: 'degats', types: ['froid'], operation: 'annuler' },
      ],
    },
    {
      id: 'anneau-feu',
      sorte: 'objet',
      nom: 'Anneau de feu',
      effets: [
        {
          sur: 'degats',
          types: ['feu'],
          operation: 'multiplier',
          valeur: 0.75,
          famille: 'resistance-feu',
        },
      ],
    },
    {
      id: 'brulure',
      sorte: 'etat',
      nom: 'Brûlure',
      effets: [{ sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: '-rang' }],
    },
  ],
  actions: [
    {
      id: 'souffle',
      nom: 'Souffle',
      pour: ['personnage'],
      cible: 'personnage',
      parametres: [{ id: 'element', nom: 'Élément', type: 'booleen' }],
      jet: { type: 'numerique', formule: '2d6' },
      consequences: [
        {
          condition: 'non element',
          entite: 'cible',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 'total',
          type: 'feu',
        },
        {
          condition: 'element',
          entite: 'cible',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 'total',
          type: 'froid',
        },
        {
          condition: 'non element',
          entite: 'cible',
          entree: 'brulure',
          operation: 'donner',
          rangs: 2,
          duree: 3,
        },
      ],
    },
  ],
};
const r = charger(saisi);
if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
const s = r.systeme;
const fiche = (e: Partial<EtatEntiteSaisi> = {}) =>
  calculer(
    s,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: s.source.id, version: '1.0.0' },
      valeurs: { niveau: 5 },
      ...e,
    }),
  );

describe('types de dégâts et résistances', () => {
  it('résistance, réduction et immunité', () => {
    const f = fiche({ possessions: [{ entree: 'ecailles' }] });
    expect(reduireDegats(f, 11, 'feu', 'PV').valeur).toBe(3); // 11 × 0,5 − 2 = 3,5 → 3
    expect(reduireDegats(f, 11, 'tranchant', 'PV').valeur).toBe(9);
    expect(reduireDegats(f, 11, 'froid', 'PV').valeur).toBe(0);
    expect(reduireDegats(f, 1, undefined, 'PV').valeur).toBe(0);
  });

  it('les résistances d’une même famille ne se cumulent pas', () => {
    const f = fiche({ possessions: [{ entree: 'ecailles' }, { entree: 'anneau-feu' }] });
    const d = reduireDegats(f, 20, 'feu', 'PV');
    expect(d.valeur).toBe(8);
    expect(d.lignes.filter((l) => l.ignore).map((l) => l.source)).toEqual(['anneau-feu']);
  });

  it('une action applique les dégâts typés et pose un état temporaire sur la cible', () => {
    const cible = fiche({ possessions: [{ entree: 'ecailles' }] });
    const res = executerAction(s, {
      action: 'souffle',
      acteur: fiche(),
      cible,
      aleatoire: aleatoireImpose([6, 5]),
    });
    if (!res.ok) throw new Error(JSON.stringify(res.erreurs));
    expect(res.resultat.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 3, type: 'feu', brut: 11 },
      { entite: 'cible', entree: 'brulure', operation: 'donner', rangs: 2, duree: 3 },
    ]);
    expect(res.resultat.explications).toContain('Dégâts (Feu) : 11 → 3');

    const apres = calculer(s, appliquerModifications(cible, res.resultat.modifications, 'cible'));
    expect(apres.valeur('PV')).toBe(Number(cible.valeur('PV')) - 3);
    expect(apres.etat.possessions.find((p) => p.entree === 'brulure')).toMatchObject({
      rang: 2,
      duree: 3,
    });
    expect(apres.valeur('Defense')).toBe(Number(cible.valeur('Defense')) - 2);

    const gueri = appliquerModifications(apres, [
      { entite: 'cible', entree: 'brulure', operation: 'retirer', rangs: 2 },
    ]);
    expect(gueri.possessions.some((p) => p.entree === 'brulure')).toBe(false);
  });

  it('refuse un type de dégâts inconnu', () => {
    const faux = structuredClone(saisi);
    (faux.actions![0]!.consequences![0] as { type: string }).type = 'acide';
    const r2 = charger(faux);
    expect(!r2.ok && r2.erreurs.map((e) => e.message)).toEqual(['Type de dégâts inconnu : acide']);
  });
});
