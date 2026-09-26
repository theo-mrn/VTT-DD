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

// ─── Deuxième série : manques relevés par le portage Star Wars ─────────────

import { miniSymboles } from './test/mini-systemes.js';

const sw: SystemeSaisi = {
  ...miniSymboles,
  sortes: [
    ...miniSymboles.sortes!,
    {
      id: 'arme',
      nom: 'Arme',
      pour: ['personnage'],
      activable: true,
      champs: [
        { id: 'competence', nom: 'Compétence', type: 'entree', sorte: 'competence' },
        { id: 'poids', nom: 'Encombrement', type: 'nombre', defaut: 0 },
      ],
    },
    { id: 'blessure', nom: 'Blessure critique', pour: ['personnage'], rangs: { max: 10 } },
  ],
  catalogue: [
    ...miniSymboles.catalogue!,
    { id: 'blaster', sorte: 'arme', nom: 'Blaster', champs: { competence: 'distance', poids: 1 } },
    { id: 'fusil', sorte: 'arme', nom: 'Fusil', champs: { competence: 'distance', poids: 4 } },
    { id: 'jambe-cassee', sorte: 'blessure', nom: 'Jambe cassée' },
    {
      id: 'pisteur',
      sorte: 'talent',
      nom: 'Pisteur',
      effets: [
        { sur: 'jet', ajout: { retirer: 'difficulte', nombre: 'rang' } },
        { sur: 'jet', ajout: { retrograder: 'maitrise', vers: 'aptitude', nombre: 1 } },
      ],
    },
    {
      id: 'devouement',
      sorte: 'talent',
      nom: 'Dévouement',
      choixAttributs: [
        { id: 'carac', nom: '+1 à une caractéristique', nombre: 1, parmi: { groupe: 'carac' } },
      ],
    },
  ],
  entites: [
    {
      ...miniSymboles.entites[0]!,
      attributs: [
        ...miniSymboles.entites[0]!.attributs,
        {
          cle: 'encombrement',
          nom: 'Encombrement',
          nature: 'derivee',
          formule: 'somme_actifs("arme", "poids")',
        },
        {
          cle: 'critiques',
          nom: 'Critiques',
          nature: 'derivee',
          formule: 'somme_rangs("blessure")',
        },
      ],
    },
  ],
  actions: [
    ...miniSymboles.actions!,
    {
      id: 'tir',
      nom: 'Tir',
      pour: ['personnage'],
      parametres: [{ id: 'arme', nom: 'Arme', type: 'entree', sorte: 'arme' }],
      jet: {
        type: 'symboles',
        pool: [{ de: 'aptitude', nombre: 'valeur("agilite") + rang(arme.competence)' }],
      },
    },
  ],
  achats: [
    ...miniSymboles.achats!,
    {
      id: 'carac-calculee',
      nom: 'Caractéristique (valeur calculée)',
      obtient: { type: 'attribut', entite: 'personnage', groupe: 'carac' },
      monnaie: 'xp',
      cout: '10 * (calcule + 1)',
    },
  ],
};
const rsw = charger(sw);
if (!rsw.ok) throw new Error(JSON.stringify(rsw.erreurs));
const ssw = rsw.systeme;
const ficheSw = (e: Partial<EtatEntiteSaisi> = {}) =>
  calculer(
    ssw,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: ssw.source.id, version: '1.0.0' },
      ...e,
    }),
  );

describe('briques génériques (2)', () => {
  it('effets de jet qui rétrogradent et retirent des dés', () => {
    const r = executerAction(ssw, {
      action: 'test',
      acteur: ficheSw({
        valeurs: { vigueur: 3 },
        possessions: [
          { entree: 'athletisme', rang: 2 },
          { entree: 'pisteur', rang: 1 },
        ],
      }),
      parametres: { competence: 'athletisme', difficulte: 2 },
      aleatoire: aleatoireImpose([1, 1, 1, 1]),
    });
    if (!r.ok || r.resultat.jet.type !== 'symboles') throw new Error(JSON.stringify(r));
    // 3 dés dont 2 améliorés → 1 aptitude + 2 maîtrises ; une maîtrise rétrogradée ; une difficulté retirée
    expect(r.resultat.jet.pool).toEqual([
      { de: 'aptitude', nombre: 2 },
      { de: 'maitrise', nombre: 1 },
      { de: 'difficulte', nombre: 1 },
    ]);
  });

  it('rang() d’une entrée désignée par un champ', () => {
    const r = executerAction(ssw, {
      action: 'tir',
      acteur: ficheSw({
        valeurs: { agilite: 3 },
        possessions: [{ entree: 'blaster' }, { entree: 'distance', rang: 2 }],
      }),
      parametres: { arme: 'blaster' },
      aleatoire: aleatoireImpose([1, 1, 1, 1, 1]),
    });
    expect(r.ok && r.resultat.jet.type === 'symboles' && r.resultat.jet.pool).toEqual([
      { de: 'aptitude', nombre: 5 },
    ]);
  });

  it('agrégats limités aux entrées actives, somme des rangs', () => {
    const f = ficheSw({
      possessions: [
        { entree: 'blaster' },
        { entree: 'fusil', actif: false },
        { entree: 'jambe-cassee', rang: 2 },
      ],
    });
    expect(f.valeur('encombrement')).toBe(1);
    expect(f.valeur('critiques')).toBe(2);
  });

  it('choix d’attribut et coût d’achat sur la valeur calculée', () => {
    const f = ficheSw({
      valeurs: { vigueur: 2 },
      possessions: [{ entree: 'devouement', choix: { carac: ['vigueur'] } }],
    });
    expect(f.valeur('vigueur')).toBe(3);
    const vigueur = achatsPossibles(f, ['carac-calculee'])[0]!.objets.find(
      (o) => o.objet === 'vigueur',
    );
    expect(vigueur?.cout).toBe(40);
    const faux = ficheSw({
      possessions: [{ entree: 'devouement', choix: { carac: ['Encaissement'] } }],
    });
    expect(faux.erreurs.map((e) => e.message)).toEqual([
      '+1 à une caractéristique : « Encaissement » n’est pas proposé',
    ]);
  });
});
