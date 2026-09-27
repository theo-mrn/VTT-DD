/**
 * Objets hors catalogue et catégories : champ `choix` (valeurs déclarées par le système),
 * nom et description propres d'un exemplaire (`nomExemplaire`), entrée générique `libre`.
 * Et les blocs de fiche vérifiés contre le système (`erreursWidget`).
 */
import { describe, expect, it } from 'vitest';
import { calculer } from './calcul/index.js';
import { charger, type SystemeCharge } from './chargement/index.js';
import {
  descriptionPossession,
  EtatEntite,
  erreursWidget,
  nomPossession,
  nouvellePossession,
  verifierPresentation,
  type SystemeSaisi,
} from './schema/index.js';

const source: SystemeSaisi = {
  format: 1,
  id: 'mini-objets',
  version: '1.0.0',
  nom: 'Mini objets',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      attributs: [
        { cle: 'DEX', nom: 'Dextérité', nature: 'base', defaut: 10 },
        { cle: 'PV', nom: 'PV', nature: 'ressource', max: '10' },
        { cle: 'Defense', nom: 'Défense', nature: 'derivee', formule: '10' },
        { cle: 'histoire', nom: 'Histoire', nature: 'texte' },
        {
          cle: 'potions',
          nom: 'Potions',
          nature: 'derivee',
          formule: 'quantite("objet")',
        },
      ],
    },
  ],
  sortes: [
    {
      id: 'objet',
      nom: 'Objet',
      pour: ['personnage'],
      exemplaires: true,
      quantites: true,
      nomExemplaire: 'nom',
      descriptionExemplaire: 'description',
      champs: [
        {
          id: 'categorie',
          nom: 'Catégorie',
          type: 'choix',
          options: [
            { valeur: 'potions', nom: 'Potions' },
            { valeur: 'autre', nom: 'Autre' },
          ],
          defaut: 'autre',
        },
        { id: 'nom', nom: 'Nom', type: 'texte' },
        { id: 'description', nom: 'Description', type: 'texte' },
      ],
    },
    { id: 'arme', nom: 'Arme', pour: ['personnage'], activable: true, exemplaires: true },
  ],
  catalogue: [
    {
      id: 'potion',
      sorte: 'objet',
      nom: 'Potion',
      description: 'Rend 1d8 PV.',
      champs: { categorie: 'potions' },
    },
    { id: 'objet-libre', sorte: 'objet', nom: 'Objet personnalisé', libre: true },
    { id: 'dague', sorte: 'arme', nom: 'Dague' },
  ],
};

function systeme(s: SystemeSaisi = source): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(r.erreurs.map((e) => `${e.chemin} : ${e.message}`).join('\n'));
  return r.systeme;
}

function erreurs(s: SystemeSaisi): string[] {
  const r = charger(s);
  return r.ok ? [] : r.erreurs.map((e) => `${e.chemin} : ${e.message}`);
}

describe('objets hors catalogue', () => {
  it('charge un système avec catégories, nom propre et entrée libre', () => {
    const s = systeme();
    expect(s.entrees.get('objet-libre')?.libre).toBe(true);
    expect(s.sortes.get('objet')?.nomExemplaire).toBe('nom');
  });

  it('refuse une option inconnue, un nom propre non texte, une entrée libre sans exemplaires', () => {
    const faux: SystemeSaisi = {
      ...source,
      sortes: [
        { ...source.sortes![0]!, nomExemplaire: 'categorie' },
        { ...source.sortes![1]!, exemplaires: false },
      ],
      catalogue: [
        { id: 'potion', sorte: 'objet', nom: 'Potion', champs: { categorie: 'armes' } },
        { id: 'arme-libre', sorte: 'arme', nom: 'Arme personnalisée', libre: true },
      ],
    };
    expect(erreurs(faux)).toEqual([
      'sortes/objet/nomExemplaire : Champ texte attendu : categorie',
      'catalogue/potion/champs/categorie : Option attendue (potions, autre) : armes',
      'catalogue/arme-libre/libre : La sorte arme n’admet pas d’exemplaires',
      'catalogue/arme-libre/libre : La sorte arme ne déclare pas nomExemplaire',
    ]);
  });

  it('un exemplaire libre porte son nom, sa description, sa catégorie et sa quantité', () => {
    const s = systeme();
    const libre = nouvellePossession('objet-libre', 0, {
      quantite: 3,
      champs: { nom: 'Ration', description: 'Une journée', categorie: 'autre' },
    });
    const f = calculer(s, {
      type: 'personnage',
      systeme: { id: 'mini-objets', version: '1.0.0' },
      valeurs: {},
      possessions: [nouvellePossession('potion', 0, { quantite: 2 }), libre],
      bonus: [],
      noeuds: {},
      journal: [],
      creation: false,
    });
    expect(f.erreurs).toEqual([]);
    expect(f.valeur('potions')).toBe(5);
    const entree = s.entrees.get('objet-libre')!;
    const sorte = s.sortes.get('objet')!;
    expect(nomPossession(entree, sorte, libre)).toBe('Ration');
    expect(descriptionPossession(entree, sorte, libre)).toBe('Une journée');
    // Sans nom propre : celui de l'entrée
    expect(nomPossession(s.entrees.get('potion')!, sorte, nouvellePossession('potion'))).toBe(
      'Potion',
    );
    expect(
      descriptionPossession(s.entrees.get('potion')!, sorte, nouvellePossession('potion')),
    ).toBe('Rend 1d8 PV.');
  });

  it('les effets propres d’un objet libre sont expliqués sous son nom', () => {
    const s = systeme();
    const f = calculer(
      s,
      EtatEntite.parse({
        type: 'personnage',
        systeme: { id: 'mini-objets', version: '1.0.0' },
        possessions: [
          nouvellePossession('objet-libre', 0, {
            exemplaire: 'amulette',
            champs: { nom: 'Amulette de protection' },
            effets: [{ sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: '1' }],
          }),
        ],
      }),
    );
    expect(f.valeur('Defense')).toBe(11);
    expect(f.valeurs.get('Defense')!.detail.map((l) => l.nom)).toContain('Amulette de protection');
  });
});

describe('blocs de fiche', () => {
  const s = systeme();

  it('ressources en valeur : une ressource et une valeur simple', () => {
    const w = { type: 'ressources', titre: 'Vitalité', attributs: ['PV', 'Defense'] } as const;
    expect(erreursWidget(s, 'personnage', { ...w, affichage: 'valeur' })).toEqual([]);
    expect(erreursWidget(s, 'personnage', w)).toEqual([
      'Defense n’est pas une ressource (affichage « valeur » pour une valeur simple)',
    ]);
    expect(
      erreursWidget(s, 'personnage', { ...w, attributs: ['histoire'], affichage: 'valeur' }),
    ).toEqual(['histoire est un texte : bloc « texte » attendu']);
  });

  it('inventaire regroupé par un champ de chaque sorte, sorte sans champ regroupée à part', () => {
    const w = { type: 'inventaire', titre: 'Inventaire', sortes: ['objet', 'arme'] } as const;
    expect(erreursWidget(s, 'personnage', { ...w, groupeChamp: ['categorie'] })).toEqual([]);
    expect(erreursWidget(s, 'personnage', { ...w, groupeChamp: 'categorie' })).toEqual([]);
    expect(erreursWidget(s, 'personnage', { ...w, groupeChamp: ['poids'] })).toEqual([
      'Champ inconnu des sortes objet, arme : poids',
    ]);
  });

  it('un bloc enregistré qui vise un attribut retiré est signalé', () => {
    expect(
      erreursWidget(s, 'personnage', { type: 'attributs', titre: 'Bourse', attributs: ['bourse'] }),
    ).toEqual(['Attribut inconnu de personnage : bourse']);
  });

  it('présentation : ressources en valeur acceptées', () => {
    const r = verifierPresentation(
      {
        format: 1,
        systeme: 'mini-objets',
        fiches: {
          personnage: {
            widgets: [
              {
                type: 'ressources',
                titre: 'Vitalité',
                attributs: ['PV', 'Defense'],
                affichage: 'valeur',
              },
              {
                type: 'inventaire',
                titre: 'Inventaire',
                sortes: ['arme', 'objet'],
                groupeChamp: ['categorie'],
              },
            ],
          },
        },
      },
      s,
    );
    expect(r.ok).toBe(true);
  });
});
