/** Briques génériques ajoutées après les premiers portages (D&D, Nooblies, Star Wars). */
import { describe, expect, it } from 'vitest';
import { calculer } from './calcul/index.js';
import { charger, type SystemeCharge } from './chargement/index.js';
import { aleatoireImpose } from './formules/index.js';
import { executerAction } from './jets/index.js';
import { achatsPossibles } from './progression/index.js';
import { EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from './schema/index.js';
import { miniD20 } from './test/mini-systemes.js';

const saisi: SystemeSaisi = {
  ...miniD20,
  entites: [
    ...miniD20.entites,
    {
      id: 'creature',
      nom: 'Créature',
      attributs: [
        { cle: 'Defense', nom: 'Défense', nature: 'base', defaut: 12 },
        { cle: 'PV', nom: 'PV', nature: 'ressource', max: 20 },
      ],
    },
  ],
  sortes: [
    ...miniD20.sortes!,
    { id: 'voie', nom: 'Voie', pour: ['personnage'], rangs: { max: 5 } },
    { id: 'capacite', nom: 'Capacité', pour: ['personnage'], rangs: { max: 1 } },
    {
      id: 'arme',
      nom: 'Arme',
      pour: ['personnage'],
      champs: [{ id: 'prix', nom: 'Prix', type: 'nombre' }],
    },
  ],
  catalogue: [
    ...miniD20.catalogue!,
    {
      id: 'peau-de-pierre',
      sorte: 'capacite',
      nom: 'Peau de pierre',
      effets: [{ sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: 2 }],
    },
    {
      id: 'voie-du-colosse',
      sorte: 'voie',
      nom: 'Voie du colosse',
      effets: [{ sur: 'rang', entree: 'peau-de-pierre', valeur: 1, condition: 'rang >= 3' }],
    },
    { id: 'dague', sorte: 'arme', nom: 'Dague', champs: { prix: 2 } },
    { id: 'epee', sorte: 'arme', nom: 'Épée', champs: { prix: 15 } },
  ],
  monnaies: [
    ...miniD20.monnaies!,
    { id: 'or', nom: 'Pièces d’or', total: 10, pour: ['personnage'] },
  ],
  achats: [
    ...miniD20.achats!,
    {
      id: 'equipement',
      nom: 'Équipement',
      obtient: { type: 'entree', sorte: 'arme' },
      monnaie: 'or',
      cout: 'entree.prix',
    },
  ],
  actions: [
    {
      id: 'frapper',
      nom: 'Frapper',
      pour: ['personnage'],
      cible: ['personnage', 'creature'],
      jet: { type: 'numerique', formule: '1d20 + @Contact', reussite: 'total >= @cible.Defense' },
      apres: [{ cle: 'degats', formule: '1d8 + mod(@FOR)' }],
      consequences: [
        {
          condition: 'reussi',
          entite: 'cible',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 'degats',
        },
      ],
    },
  ],
};

const r = charger(saisi);
if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
const s: SystemeCharge = r.systeme;
const fiche = (type: string, e: Partial<EtatEntiteSaisi> = {}) =>
  calculer(
    s,
    EtatEntite.parse({ type, systeme: { id: s.source.id, version: s.source.version }, ...e }),
  );

describe('briques génériques', () => {
  it('un effet de rang peut dépendre des rangs achetés de sa source', () => {
    expect(
      fiche('personnage', {
        possessions: [{ entree: 'voie-du-colosse', rang: 2 }],
      }).possessions.has('peau-de-pierre'),
    ).toBe(false);
    const f = fiche('personnage', { possessions: [{ entree: 'voie-du-colosse', rang: 3 }] });
    expect(f.possessions.get('peau-de-pierre')?.rang).toBe(1);
    expect(f.valeur('Defense')).toBe(12);
  });

  it('le coût d’un achat lit les champs de l’entrée visée', () => {
    const objets = achatsPossibles(fiche('personnage'), ['equipement'])[0]!.objets;
    expect(objets.map((o) => [o.objet, o.cout, o.possible])).toEqual([
      ['dague', 2, true],
      ['epee', 15, false],
    ]);
  });

  it('une action peut viser plusieurs types d’entité, et lancer des dés après le jet', () => {
    const r = executerAction(s, {
      action: 'frapper',
      acteur: fiche('personnage', { valeurs: { FOR: 14 } }),
      cible: fiche('creature'),
      aleatoire: aleatoireImpose([15, 6]),
    });
    expect(r.ok && r.resultat.variables.degats).toBe(8);
    expect(r.ok && r.resultat.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 8 },
    ]);
  });
});
