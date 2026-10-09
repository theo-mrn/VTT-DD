/**
 * Entrées libres d'une entité (`etat.entrees`, docs/entrees-libres.md) : voie maison et ses
 * capacités, calculées comme le catalogue, vérifiées à l'écriture, sans recharger le système.
 */
import { describe, expect, it } from 'vitest';
import { calculer } from './calcul/index.js';
import {
  avecOptions,
  charger,
  erreursEntreesLibres,
  systemePour,
  type SystemeCharge,
} from './chargement/index.js';
import { etapesCreation } from './progression/index.js';
import {
  EtatEntite,
  nouvellePossession,
  type EntreeSaisie,
  type SystemeSaisi,
} from './schema/index.js';

const source: SystemeSaisi = {
  format: 1,
  id: 'mini-voies',
  version: '1.0.0',
  nom: 'Mini voies',
  modificateur: 'floor((valeur - 10) / 2)',
  options: [{ id: 'dur', nom: 'Dur', defaut: false }],
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      attributs: [
        { cle: 'FOR', nom: 'Force', nature: 'base', defaut: 14, modificateur: true },
        { cle: 'DEF', nom: 'Défense', nature: 'derivee', formule: '10' },
        { cle: 'PV_Max', nom: 'PV max', nature: 'derivee', formule: '10' },
      ],
    },
  ],
  sortes: [
    { id: 'voie', nom: 'Voie', pour: ['personnage'], rangs: { max: '5' }, personnalisable: true },
    {
      id: 'capacite',
      nom: 'Capacité',
      pour: ['personnage'],
      rangs: { max: '1' },
      personnalisable: true,
      champs: [{ id: 'activation', nom: 'Activation', type: 'texte' }],
    },
    { id: 'race', nom: 'Race', pour: ['personnage'], maximum: 1 },
  ],
  catalogue: [{ id: 'humain', sorte: 'race', nom: 'Humain' }],
};

function systeme(): SystemeCharge {
  const r = charger(source);
  if (!r.ok) throw new Error(r.erreurs.map((e) => `${e.chemin} : ${e.message}`).join('\n'));
  return r.systeme;
}

const voieLibre: EntreeSaisie[] = [
  {
    id: 'perso-voie-du-roc',
    sorte: 'voie',
    nom: 'Voie du roc',
    effets: [
      { sur: 'rang', entree: 'perso-peau-de-pierre', valeur: 1, condition: 'rang >= 1' },
      { sur: 'rang', entree: 'perso-masse', valeur: 1, condition: 'rang >= 2' },
    ],
  },
  {
    id: 'perso-peau-de-pierre',
    sorte: 'capacite',
    nom: 'Peau de pierre',
    champs: { activation: 'Capacité passive' },
    effets: [{ sur: 'attribut', attribut: 'DEF', operation: 'ajouter', valeur: '2' }],
  },
  {
    id: 'perso-masse',
    sorte: 'capacite',
    nom: 'Masse',
    // Lit FOR : l'ordre de calcul est refait pour PV_Max
    effets: [{ sur: 'attribut', attribut: 'PV_Max', operation: 'ajouter', valeur: 'mod(@FOR)' }],
  },
];

function etat(entrees: EntreeSaisie[], rang = 2): EtatEntite {
  return EtatEntite.parse({
    type: 'personnage',
    systeme: { id: 'mini-voies', version: '1.0.0' },
    entrees,
    possessions: [nouvellePossession('perso-voie-du-roc', rang)],
  });
}

describe('entrées libres', () => {
  it('calcule une voie libre et ses capacités comme le catalogue', () => {
    const fiche = calculer(systeme(), etat(voieLibre));
    expect(fiche.erreurs).toEqual([]);
    expect(fiche.valeur('DEF')).toBe(12);
    expect(fiche.valeur('PV_Max')).toBe(12);
    expect(fiche.possessions.has('perso-masse')).toBe(true);
    expect(fiche.systeme.entrees.get('perso-voie-du-roc')?.nom).toBe('Voie du roc');
  });

  it('suit le rang de la voie', () => {
    const fiche = calculer(systeme(), etat(voieLibre, 1));
    expect(fiche.valeur('DEF')).toBe(12);
    expect(fiche.valeur('PV_Max')).toBe(10);
    expect(fiche.possessions.has('perso-masse')).toBe(false);
  });

  it('ne touche pas au système de départ et le reprend sans entrée libre', () => {
    const s = systeme();
    const etendu = systemePour(s, etat(voieLibre));
    expect(etendu).not.toBe(s);
    expect(s.entrees.has('perso-voie-du-roc')).toBe(false);
    expect(systemePour(etendu, etat([]))).toBe(s);
  });

  it('garde en cache le système étendu des mêmes entrées', () => {
    const s = systeme();
    const a = systemePour(s, etat(voieLibre));
    expect(systemePour(s, etat(voieLibre))).toBe(a);
    expect(systemePour(a, etat(voieLibre))).toBe(a);
  });

  it('garde les règles de la campagne', () => {
    const s = avecOptions(systeme(), { dur: true });
    const etendu = systemePour(s, etat(voieLibre));
    expect(etendu.optionsCampagne).toEqual({ dur: true });
    // Étendu d'autres entrées : repart du système réglé, pas du système nu
    const autre = systemePour(etendu, etat(voieLibre.slice(1)));
    expect(autre.optionsCampagne).toEqual({ dur: true });
    expect(autre.entrees.has('perso-voie-du-roc')).toBe(false);
  });

  it('se passe dans la création comme dans le calcul', () => {
    const e = { ...etat(voieLibre), creation: true };
    expect(() => etapesCreation(systeme(), e)).not.toThrow();
  });

  it('refuse une sorte non personnalisable, un identifiant sans préfixe, une formule fausse', () => {
    const s = systeme();
    const erreurs = (entrees: EntreeSaisie[]) =>
      erreursEntreesLibres(s, etat(entrees)).map((e) => e.message);
    expect(erreurs([{ id: 'perso-elfe', sorte: 'race', nom: 'Elfe' }])).toEqual([
      'La sorte race n’admet pas d’entrée libre',
    ]);
    expect(erreurs([{ id: 'voie-x', sorte: 'voie', nom: 'X' }])).toEqual([
      'Identifiant attendu : perso-…',
    ]);
    expect(
      erreurs([
        {
          id: 'perso-x',
          sorte: 'capacite',
          nom: 'X',
          effets: [{ sur: 'attribut', attribut: 'DEF', operation: 'ajouter', valeur: '@INCONNU' }],
        },
      ]),
    ).not.toEqual([]);
    expect(erreurs([{ id: 'humain', sorte: 'voie', nom: 'Doublon' }])).not.toEqual([]);
    expect(erreurs(voieLibre)).toEqual([]);
  });

  it('calcule sans les entrées libres invalides plutôt que d’échouer', () => {
    const fiche = calculer(
      systeme(),
      etat([{ id: 'perso-x', sorte: 'race', nom: 'X' }, ...voieLibre]),
    );
    expect(fiche.systeme.entrees.has('perso-voie-du-roc')).toBe(false);
    expect(fiche.valeur('DEF')).toBe(10);
  });
});
