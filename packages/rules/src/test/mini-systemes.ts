/**
 * Petits systèmes de test, écrits uniquement en données : un d20 et un
 * système à dés à symboles, avec les briques principales du moteur.
 */
import type { SystemeSaisi } from '../schema/index.js';

export const miniD20: SystemeSaisi = {
  format: 1,
  id: 'mini-d20',
  version: '1.0.0',
  nom: 'Mini d20',
  modificateur: 'floor((valeur - 10) / 2)',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      groupes: [
        { id: 'carac', nom: 'Caractéristiques' },
        { id: 'combat', nom: 'Combat' },
      ],
      attributs: [
        {
          cle: 'FOR',
          nom: 'Force',
          nature: 'base',
          defaut: 10,
          min: 1,
          max: 20,
          modificateur: true,
          groupe: 'carac',
        },
        {
          cle: 'DEX',
          nom: 'Dextérité',
          nature: 'base',
          defaut: 10,
          min: 1,
          max: 20,
          modificateur: true,
          groupe: 'carac',
        },
        {
          cle: 'CON',
          nom: 'Constitution',
          nature: 'base',
          defaut: 10,
          min: 1,
          max: 20,
          modificateur: true,
          groupe: 'carac',
        },
        { cle: 'niveau', nom: 'Niveau', nature: 'base', defaut: 1, min: 1, max: 20 },
        {
          cle: 'Defense',
          nom: 'Défense',
          nature: 'derivee',
          formule: '10 + mod(@DEX)',
          groupe: 'combat',
        },
        {
          cle: 'Contact',
          nom: 'Contact',
          nature: 'derivee',
          formule: 'mod(@FOR) + @niveau',
          groupe: 'combat',
        },
        {
          cle: 'PV_Max',
          nom: 'PV max',
          nature: 'derivee',
          formule: 'max(1, 8 + mod(@CON) + (@niveau - 1) * 5)',
        },
        { cle: 'PV', nom: 'Points de vie', nature: 'ressource', max: '@PV_Max' },
        { cle: 'nom', nom: 'Nom', nature: 'texte' },
        {
          cle: 'alignement',
          nom: 'Alignement',
          nature: 'choix',
          options: [
            { valeur: 'bon', nom: 'Bon' },
            { valeur: 'neutre', nom: 'Neutre' },
          ],
          defaut: 'neutre',
        },
      ],
    },
  ],
  sortes: [
    { id: 'race', nom: 'Race', pour: ['personnage'], maximum: 1 },
    {
      id: 'objet',
      nom: 'Objet',
      pour: ['personnage'],
      activable: true,
      champs: [{ id: 'bonus', nom: 'Bonus', type: 'nombre', defaut: 0 }],
    },
    { id: 'don', nom: 'Don', pour: ['personnage'], rangs: { max: 3 } },
  ],
  catalogue: [
    {
      id: 'elfe',
      sorte: 'race',
      nom: 'Elfe',
      effets: [
        { sur: 'attribut', attribut: 'DEX', operation: 'ajouter', valeur: 2 },
        { sur: 'attribut', attribut: 'CON', operation: 'ajouter', valeur: -2 },
      ],
    },
    {
      id: 'armure-cuir',
      sorte: 'objet',
      nom: 'Armure de cuir',
      champs: { bonus: 2 },
      effets: [
        {
          sur: 'attribut',
          attribut: 'Defense',
          operation: 'ajouter',
          valeur: 'source.bonus',
          famille: 'armure',
        },
      ],
    },
    {
      id: 'cotte',
      sorte: 'objet',
      nom: 'Cotte de mailles',
      champs: { bonus: 5 },
      effets: [
        {
          sur: 'attribut',
          attribut: 'Defense',
          operation: 'ajouter',
          valeur: 'source.bonus',
          famille: 'armure',
        },
      ],
    },
    {
      id: 'robustesse',
      sorte: 'don',
      nom: 'Robustesse',
      effets: [{ sur: 'attribut', attribut: 'PV_Max', operation: 'ajouter', valeur: '3 * rang' }],
    },
  ],
  monnaies: [{ id: 'points', nom: 'Points', total: '27', pour: ['personnage'] }],
  achats: [
    {
      id: 'carac',
      nom: 'Caractéristique',
      obtient: { type: 'attribut', entite: 'personnage', groupe: 'carac' },
      monnaie: 'points',
      cout: 'si(cible <= 13, 1, 2)',
      plafond: 15,
      moment: 'creation',
    },
  ],
  actions: [
    {
      id: 'attaque',
      nom: 'Attaque au contact',
      pour: ['personnage'],
      cible: 'personnage',
      jet: {
        type: 'numerique',
        formule: '1d20 + @Contact',
        reussite: 'total >= @cible.Defense',
        critique: 'naturel == 20',
      },
      apres: [{ cle: 'degats', formule: 'si(critique, 2, 1) * 4 + mod(@FOR)' }],
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

export const miniSymboles: SystemeSaisi = {
  format: 1,
  id: 'mini-symboles',
  version: '1.0.0',
  nom: 'Mini symboles',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      groupes: [{ id: 'carac', nom: 'Caractéristiques' }],
      attributs: [
        {
          cle: 'vigueur',
          nom: 'Vigueur',
          nature: 'base',
          defaut: 2,
          min: 1,
          max: 6,
          groupe: 'carac',
        },
        {
          cle: 'agilite',
          nom: 'Agilité',
          nature: 'base',
          defaut: 2,
          min: 1,
          max: 6,
          groupe: 'carac',
        },
        { cle: 'baseBlessure', nom: 'Base blessure', nature: 'base', defaut: 10, visibilite: 'mj' },
        { cle: 'Encaissement', nom: 'Encaissement', nature: 'derivee', formule: '@vigueur' },
        {
          cle: 'Blessures',
          nom: 'Blessures',
          nature: 'ressource',
          max: '@baseBlessure + @vigueur',
          initiale: 'min',
          recuperation: 'min',
        },
        { cle: 'xpDepart', nom: 'XP de départ', nature: 'base', defaut: 0 },
        { cle: 'xpGagne', nom: 'XP gagnée', nature: 'base', defaut: 0 },
        {
          cle: 'obligation',
          nom: 'Obligation',
          nature: 'derivee',
          formule: '10 + somme("obligation", "valeur")',
        },
      ],
    },
  ],
  sortes: [
    { id: 'espece', nom: 'Espèce', pour: ['personnage'], maximum: 1 },
    { id: 'carriere', nom: 'Carrière', pour: ['personnage'], maximum: 1 },
    {
      id: 'competence',
      nom: 'Compétence',
      pour: ['personnage'],
      rangs: { max: 5 },
      champs: [
        { id: 'caracteristique', nom: 'Caractéristique', type: 'attribut', entite: 'personnage' },
      ],
    },
    { id: 'talent', nom: 'Talent', pour: ['personnage'], rangs: { max: 5 } },
    {
      id: 'obligation',
      nom: 'Obligation',
      pour: ['personnage'],
      champs: [{ id: 'valeur', nom: 'Valeur', type: 'nombre', defaut: 0 }],
    },
  ],
  catalogue: [
    {
      id: 'athletisme',
      sorte: 'competence',
      nom: 'Athlétisme',
      champs: { caracteristique: 'vigueur' },
    },
    {
      id: 'distance',
      sorte: 'competence',
      nom: 'Distance (légère)',
      champs: { caracteristique: 'agilite' },
    },
    {
      id: 'discretion',
      sorte: 'competence',
      nom: 'Discrétion',
      champs: { caracteristique: 'agilite' },
    },
    {
      id: 'bothan',
      sorte: 'espece',
      nom: 'Bothan',
      effets: [
        { sur: 'attribut', attribut: 'xpDepart', operation: 'fixer', valeur: 100 },
        { sur: 'rang', entree: 'discretion', valeur: 1 },
      ],
    },
    {
      id: 'humain',
      sorte: 'espece',
      nom: 'Humain',
      effets: [{ sur: 'attribut', attribut: 'xpDepart', operation: 'fixer', valeur: 110 }],
      choix: [
        {
          id: 'polyvalence',
          nom: 'Deux compétences hors carrière',
          nombre: 2,
          parmi: { sorte: 'competence', sansMarque: 'carriere' },
          donne: { type: 'rang', valeur: 1 },
        },
      ],
    },
    {
      id: 'chasseur',
      sorte: 'carriere',
      nom: 'Chasseur de primes',
      effets: [{ sur: 'marque', marque: 'carriere', entrees: ['athletisme', 'distance'] }],
    },
    {
      id: 'robuste',
      sorte: 'talent',
      nom: 'Robuste',
      effets: [
        { sur: 'attribut', attribut: 'Blessures', operation: 'ajouter', valeur: '2 * rang' },
      ],
    },
    { id: 'dette', sorte: 'obligation', nom: 'Dette', champs: { valeur: 5 } },
  ],
  monnaies: [{ id: 'xp', nom: 'Expérience', total: '@xpDepart + @xpGagne', pour: ['personnage'] }],
  achats: [
    {
      id: 'rang-competence',
      nom: 'Rang de compétence',
      obtient: { type: 'rang', sorte: 'competence' },
      monnaie: 'xp',
      cout: '5 * cible + si(marque("carriere"), 0, 5)',
      plafond: 'si(creation, 2, 5)',
    },
    {
      id: 'caracteristique',
      nom: 'Caractéristique',
      obtient: { type: 'attribut', entite: 'personnage', groupe: 'carac' },
      monnaie: 'xp',
      cout: '10 * cible',
      plafond: 5,
      moment: 'creation',
    },
    { id: 'noeud', nom: 'Talent', obtient: { type: 'noeud' }, monnaie: 'xp', cout: '0' },
  ],
  arbres: [
    {
      id: 'arbre-chasseur',
      nom: 'Chasseur',
      ouvertPar: 'chasseur',
      noeuds: [
        { id: 'a1', entree: 'robuste', x: 0, y: 0, cout: '5 * (y + 1)', depart: true },
        { id: 'a2', entree: 'robuste', x: 0, y: 1, cout: '5 * (y + 1)' },
      ],
      liens: [{ de: 'a1', vers: 'a2' }],
    },
  ],
  des: {
    symboles: [
      { id: 'succes', nom: 'Succès' },
      { id: 'echec', nom: 'Échec' },
      { id: 'avantage', nom: 'Avantage' },
      { id: 'menace', nom: 'Menace' },
    ],
    sortes: [
      {
        id: 'aptitude',
        nom: 'Aptitude',
        faces: [
          {},
          { succes: 1 },
          { succes: 1 },
          { succes: 2 },
          { avantage: 1 },
          { avantage: 1 },
          { succes: 1, avantage: 1 },
          { avantage: 2 },
        ],
      },
      {
        id: 'maitrise',
        nom: 'Maîtrise',
        faces: [
          {},
          { succes: 1 },
          { succes: 1 },
          { succes: 2 },
          { succes: 2 },
          { avantage: 1 },
          { succes: 1, avantage: 1 },
          { succes: 1, avantage: 1 },
          { succes: 1, avantage: 1 },
          { avantage: 2 },
          { avantage: 2 },
          { succes: 2 },
        ],
      },
      {
        id: 'difficulte',
        nom: 'Difficulté',
        faces: [
          {},
          { echec: 1 },
          { echec: 2 },
          { menace: 1 },
          { menace: 1 },
          { menace: 1 },
          { menace: 2 },
          { echec: 1, menace: 1 },
        ],
      },
    ],
    resultats: [
      { cle: 'succesNets', nom: 'Succès nets', formule: 'max(0, succes - echec)' },
      { cle: 'avantagesNets', nom: 'Avantages nets', formule: 'max(0, avantage - menace)' },
    ],
  },
  actions: [
    {
      id: 'test',
      nom: 'Test de compétence',
      pour: ['personnage'],
      parametres: [
        { id: 'competence', nom: 'Compétence', type: 'entree', sorte: 'competence' },
        { id: 'difficulte', nom: 'Difficulté', type: 'nombre', defaut: 2 },
      ],
      variables: [{ cle: 'carac', formule: 'valeur(competence.caracteristique)' }],
      jet: {
        type: 'symboles',
        pool: [
          { de: 'aptitude', nombre: 'max(carac, competence.rang)' },
          { de: 'difficulte', nombre: 'difficulte' },
        ],
        ameliorations: [
          { de: 'aptitude', vers: 'maitrise', nombre: 'min(carac, competence.rang)' },
        ],
        reussite: 'succesNets >= 1',
      },
    },
  ],
  initiative: { action: 'test', tri: ['succesNets', 'avantagesNets'] },
};
