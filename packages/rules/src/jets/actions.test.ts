import { describe, expect, it } from 'vitest';
import { calculer, type Fiche } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { aleatoireGraine, aleatoireImpose } from '../formules/index.js';
import { EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import {
  appliquerModifications,
  executerAction,
  tirerTable,
  type ResultatAction,
} from './index.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

/** Variante du mini d20 : armes à dégâts en formule, bonus de jet, table de critiques. */
const d20Etendu: SystemeSaisi = {
  ...miniD20,
  id: 'mini-d20-etendu',
  sortes: [
    ...miniD20.sortes!,
    {
      id: 'arme',
      nom: 'Arme',
      pour: ['personnage'],
      activable: true,
      champs: [
        { id: 'degats', nom: 'Dégâts', type: 'formule' },
        { id: 'portee', nom: 'Portée', type: 'texte', defaut: 'contact' },
      ],
    },
    { id: 'etat', nom: 'État', pour: ['personnage'] },
  ],
  catalogue: [
    ...miniD20.catalogue!,
    { id: 'epee', sorte: 'arme', nom: 'Épée', champs: { degats: '4 + mod(@FOR)' } },
    { id: 'hache', sorte: 'arme', nom: 'Hache', champs: { degats: '6' } },
    {
      id: 'anneau',
      sorte: 'objet',
      nom: 'Anneau de précision',
      champs: { bonus: 3 },
      effets: [{ sur: 'jet', actions: ['frappe'], ajout: { bonus: 'source.bonus' } }],
    },
    {
      id: 'beni',
      sorte: 'etat',
      nom: 'Béni',
      effets: [{ sur: 'jet', ajout: { bonus: 1 }, description: 'Bénédiction' }],
    },
    {
      id: 'maladroit',
      sorte: 'etat',
      nom: 'Maladroit',
      effets: [{ sur: 'jet', si: 'action == "attaque"', ajout: { bonus: -2 } }],
    },
  ],
  actions: [
    ...miniD20.actions!,
    {
      id: 'frappe',
      nom: 'Frappe armée',
      pour: ['personnage'],
      cible: 'personnage',
      parametres: [
        { id: 'arme', nom: 'Arme', type: 'entree', sorte: 'arme' },
        { id: 'bonus', nom: 'Bonus de situation', type: 'nombre', defaut: 0 },
      ],
      jet: {
        type: 'numerique',
        formule: '1d20 + @Contact + bonus',
        reussite: 'total >= 10 + mod(@cible.DEX)',
        critique: 'naturel >= 19',
        fumble: 'naturel == 1',
      },
      apres: [{ cle: 'degats', formule: 'si(critique, 2, 1) * arme.degats' }],
      consequences: [
        {
          condition: 'reussi',
          entite: 'cible',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 'degats',
        },
        {
          condition: 'naturel == 1',
          entite: 'acteur',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 1,
        },
      ],
      tables: [{ table: 'critiques', condition: 'critique', modificateur: '@niveau' }],
    },
  ],
  tables: [
    {
      id: 'critiques',
      nom: 'Critiques',
      jet: '1d10 + modificateur',
      lignes: [
        { min: 1, max: 5, nom: 'Égratignure' },
        { min: 6, max: 10, nom: 'Plaie', entree: 'maladroit' },
        { min: 13, max: 15, nom: 'Fracture' },
      ],
    },
  ],
};

const d20 = systeme(miniD20);
const d20e = systeme(d20Etendu);

const fiche = (s: SystemeCharge, e: Partial<EtatEntiteSaisi> = {}): Fiche =>
  calculer(
    s,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: s.source.id, version: s.source.version },
      ...e,
    }),
  );

function executer(...args: Parameters<typeof executerAction>): ResultatAction {
  const r = executerAction(...args);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.resultat;
}

// FOR 14 (mod +2), niveau 3 : Contact 5. Cible : DEX 14, Défense 12, 8 PV.
const guerrier = fiche(d20, { valeurs: { FOR: 14, niveau: 3 } });
const gobelin = fiche(d20, { valeurs: { DEX: 14 } });

describe('attaque numérique (mini d20)', () => {
  it('touche : total, naturel, dégâts et modification proposée', () => {
    const r = executer(d20, {
      action: 'attaque',
      acteur: guerrier,
      cible: gobelin,
      aleatoire: aleatoireImpose([10]),
    });
    expect(r.reussi).toBe(true);
    expect(r.jet).toMatchObject({ type: 'numerique', valeur: 15, total: 15, naturel: 10 });
    expect(r.variables).toEqual({
      total: 15,
      naturel: 10,
      critique: false,
      reussi: true,
      degats: 6,
    });
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 6 },
    ]);
    expect(r.explications).toEqual([
      'Jet 1d20 + @Contact = 15 [d20 : 10]',
      'Réussite',
      'degats = 6',
      'Cible : Points de vie − 6',
    ]);
    expect(r.erreurs).toEqual([]);
    // L'état n'est pas touché par l'action
    expect(gobelin.etat.valeurs).toEqual({ DEX: 14 });
  });

  it('rate : aucune modification', () => {
    const r = executer(d20, {
      action: 'attaque',
      acteur: guerrier,
      cible: gobelin,
      aleatoire: aleatoireImpose([5]),
    });
    expect(r.reussi).toBe(false);
    expect(r.jet).toMatchObject({ total: 10, critique: false });
    expect(r.modifications).toEqual([]);
    expect(r.explications).toContain('Échec');
  });

  it('critique : dégâts doublés', () => {
    const r = executer(d20, {
      action: 'attaque',
      acteur: guerrier,
      cible: gobelin,
      aleatoire: aleatoireImpose([20]),
    });
    expect(r.jet).toMatchObject({ total: 25, naturel: 20, critique: true });
    expect(r.variables.degats).toBe(10);
    expect(r.explications).toContain('Critique');
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 10 },
    ]);
  });

  it('dégâts appliqués : nouvel état, bornes laissées au calcul', () => {
    const touche = executer(d20, {
      action: 'attaque',
      acteur: guerrier,
      cible: gobelin,
      aleatoire: aleatoireImpose([10]),
    });
    const etat = appliquerModifications(gobelin, touche.modifications, 'cible');
    // PV non stockés : on part des 8 PV calculés
    expect(etat.valeurs).toEqual({ DEX: 14, PV: 2 });
    expect(gobelin.etat.valeurs).toEqual({ DEX: 14 });
    const blesse = calculer(d20, etat);
    expect(blesse.valeur('PV')).toBe(2);

    const critique = executer(d20, {
      action: 'attaque',
      acteur: guerrier,
      cible: blesse,
      aleatoire: aleatoireImpose([20]),
    });
    const acheve = appliquerModifications(blesse, critique.modifications, 'cible');
    expect(acheve.valeurs.PV).toBe(-8);
    expect(calculer(d20, acheve).valeur('PV')).toBe(0);
  });

  it('résultat sérialisable et reproductible avec une graine', () => {
    const lancer = () =>
      executer(d20, {
        action: 'attaque',
        acteur: guerrier,
        cible: gobelin,
        aleatoire: aleatoireGraine('partie-1'),
      });
    const r = lancer();
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(lancer()).toEqual(r);
  });

  it('refuse une demande invalide avec des erreurs claires', () => {
    const sansCible = executerAction(d20, {
      action: 'attaque',
      acteur: guerrier,
      aleatoire: aleatoireImpose([10]),
    });
    expect(sansCible).toEqual({
      ok: false,
      erreurs: [{ message: 'Attaque au contact demande une cible' }],
    });

    const inconnue = executerAction(d20, {
      action: 'sort',
      acteur: guerrier,
      aleatoire: aleatoireImpose([]),
    });
    expect(inconnue).toEqual({ ok: false, erreurs: [{ message: 'Action inconnue : sort' }] });

    const autre = executerAction(d20, {
      action: 'attaque',
      acteur: fiche(d20e),
      cible: gobelin,
      parametres: { vitesse: 2 },
      aleatoire: aleatoireImpose([10]),
    });
    expect(autre).toEqual({
      ok: false,
      erreurs: [
        { message: 'La fiche de l’acteur a été calculée avec un autre système' },
        { parametre: 'vitesse', message: 'Paramètre inconnu : vitesse' },
      ],
    });
  });
});

describe('actions avec paramètres, effets de jet et tables', () => {
  // FOR 16 (mod +3), niveau 2 : Contact 5. Épée : 4 + 3 = 7 dégâts.
  const heros = fiche(d20e, {
    valeurs: { FOR: 16, niveau: 2 },
    possessions: [
      { entree: 'epee' },
      { entree: 'hache', actif: false },
      { entree: 'anneau', actif: false },
    ],
  });
  const cible = fiche(d20e, { valeurs: { DEX: 16 } }); // réussite si total >= 13

  it('champs de l’entrée : formule évaluée sur l’acteur, défaut, rang', () => {
    const r = executer(d20e, {
      action: 'frappe',
      acteur: heros,
      cible,
      parametres: { arme: 'epee', bonus: 1 },
      aleatoire: aleatoireImpose([7]),
    });
    expect(r.parametres).toEqual({ arme: 'epee', bonus: 1 });
    expect(r.variables).toMatchObject({
      arme: 'epee',
      'arme.rang': 0,
      'arme.degats': 7,
      'arme.portee': 'contact',
      bonus: 1,
      total: 13,
      reussi: true,
      degats: 7,
    });
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 7 },
    ]);
    expect(r.explications[0]).toBe('Arme : Épée (rang 0)');
  });

  it('paramètres invalides', () => {
    const essai = (parametres: Record<string, string | number>) =>
      executerAction(d20e, {
        action: 'frappe',
        acteur: heros,
        cible,
        parametres,
        aleatoire: aleatoireImpose([10]),
      });
    expect(essai({})).toEqual({
      ok: false,
      erreurs: [{ parametre: 'arme', message: 'Arme : Arme requise' }],
    });
    expect(essai({ arme: 'hache', bonus: 'deux' })).toEqual({
      ok: false,
      erreurs: [
        { parametre: 'arme', message: 'Arme : Hache n’est pas active' },
        { parametre: 'bonus', message: 'Bonus de situation : nombre attendu' },
      ],
    });
    expect(essai({ arme: 'cotte' })).toMatchObject({
      erreurs: [{ parametre: 'arme', message: 'Arme : Cotte de mailles n’est pas Arme' }],
    });
    expect(essai({ arme: 'baton' })).toMatchObject({
      erreurs: [{ parametre: 'arme', message: 'Arme : entrée inconnue « baton »' }],
    });
    const sansEpee = fiche(d20e, { possessions: [{ entree: 'hache' }] });
    expect(
      executerAction(d20e, {
        action: 'frappe',
        acteur: sansEpee,
        cible,
        parametres: { arme: 'epee' },
        aleatoire: aleatoireImpose([10]),
      }),
    ).toMatchObject({
      erreurs: [{ parametre: 'arme', message: 'Arme : Épée n’est pas possédée par l’acteur' }],
    });
  });

  it('effets de jet : bonus des possessions actives, filtre d’action, condition « si »', () => {
    const equipe = fiche(d20e, {
      valeurs: { FOR: 16, niveau: 2 },
      possessions: [
        { entree: 'epee' },
        { entree: 'anneau' },
        { entree: 'beni' },
        { entree: 'maladroit' },
      ],
    });
    const frappe = executer(d20e, {
      action: 'frappe',
      acteur: equipe,
      cible,
      parametres: { arme: 'epee' },
      aleatoire: aleatoireImpose([4]),
    });
    // 4 + 5 = 9, + 3 (anneau) + 1 (béni) ; « maladroit » ne vise que l'attaque
    expect(frappe.jet).toMatchObject({
      valeur: 9,
      total: 13,
      naturel: 4,
      bonus: [
        { source: 'anneau', nom: 'Anneau de précision', valeur: 3 },
        { source: 'beni', nom: 'Bénédiction', valeur: 1 },
      ],
    });
    expect(frappe.reussi).toBe(true);
    expect(frappe.explications).toContain('Anneau de précision : + 3');
    expect(frappe.explications).toContain('Total : 13');

    const attaque = executer(d20e, {
      action: 'attaque',
      acteur: equipe,
      cible,
      aleatoire: aleatoireImpose([4]),
    });
    // L'anneau ne vise que la frappe : béni + 1, maladroit − 2
    expect(attaque.jet).toMatchObject({ valeur: 9, total: 8 });
    expect(attaque.explications).toContain('Maladroit : − 2');
  });

  it('critique : table tirée avec son modificateur', () => {
    const r = executer(d20e, {
      action: 'frappe',
      acteur: heros,
      cible,
      parametres: { arme: 'epee' },
      aleatoire: aleatoireImpose([19, 6]),
    });
    expect(r.jet).toMatchObject({ critique: true, fumble: false });
    expect(r.variables.degats).toBe(14);
    expect(r.tables).toEqual([
      {
        table: 'critiques',
        modificateur: 2,
        valeur: 8,
        jets: [
          { position: 0, faces: 10, des: [{ valeur: 6, garde: true, explosion: false }], total: 6 },
        ],
        ligne: { min: 6, max: 10, nom: 'Plaie', entree: 'maladroit' },
        horsTable: false,
        erreurs: [],
      },
    ]);
    expect(r.explications).toContain('Critiques : 8 → Plaie');
  });

  it('échec critique : conséquence sur l’acteur', () => {
    const r = executer(d20e, {
      action: 'frappe',
      acteur: heros,
      cible,
      parametres: { arme: 'epee' },
      aleatoire: aleatoireImpose([1]),
    });
    expect(r.reussi).toBe(false);
    expect(r.jet).toMatchObject({ fumble: true });
    expect(r.modifications).toEqual([
      { entite: 'acteur', attribut: 'PV', operation: 'retirer', valeur: 1 },
    ]);
    expect(r.explications).toContain('Acteur : Points de vie − 1');
    const etat = appliquerModifications(heros, r.modifications, 'acteur');
    expect(heros.valeur('PV')).toBe(13);
    expect(etat.valeurs.PV).toBe(12);
    expect(appliquerModifications(heros, r.modifications, 'cible')).toEqual(heros.etat);
  });
});

describe('tirerTable', () => {
  it('ligne correspondante, valeurs hors table et trous', () => {
    expect(tirerTable(d20e, 'critiques', 0, aleatoireImpose([3])).ligne?.nom).toBe('Égratignure');
    const haut = tirerTable(d20e, 'critiques', 10, aleatoireImpose([9]));
    expect(haut).toMatchObject({ valeur: 19, horsTable: true, ligne: { nom: 'Fracture' } });
    const bas = tirerTable(d20e, 'critiques', -5, aleatoireImpose([2]));
    expect(bas).toMatchObject({ valeur: -3, horsTable: true, ligne: { nom: 'Égratignure' } });
    const trou = tirerTable(d20e, 'critiques', 2, aleatoireImpose([10]));
    expect(trou).toMatchObject({ valeur: 12, horsTable: false, ligne: null });
    expect(() => tirerTable(d20e, 'rencontres', 0, aleatoireImpose([1]))).toThrow(
      'Table inconnue : rencontres',
    );
  });
});

describe('appliquerModifications', () => {
  it('part de la valeur de base (sans effets) pour un attribut de base', () => {
    const elfe = fiche(d20, { possessions: [{ entree: 'elfe' }] });
    expect(elfe.valeur('DEX')).toBe(12);
    const etat = appliquerModifications(elfe, [
      { entite: 'acteur', attribut: 'DEX', operation: 'ajouter', valeur: 1 },
      { entite: 'acteur', attribut: 'DEX', operation: 'ajouter', valeur: 1 },
      { entite: 'acteur', attribut: 'FOR', operation: 'fixer', valeur: 15 },
    ]);
    expect(etat.valeurs).toEqual({ DEX: 12, FOR: 15 });
    expect(calculer(d20, etat).valeur('DEX')).toBe(14);
    expect(() =>
      appliquerModifications(elfe, [
        { entite: 'acteur', attribut: 'Defense', operation: 'ajouter', valeur: 1 },
      ]),
    ).toThrow('Attribut de base ou ressource attendu');
  });
});
