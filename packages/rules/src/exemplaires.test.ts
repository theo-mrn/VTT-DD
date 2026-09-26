/**
 * Exemplaires multiples et quantités : deux dagues dont une +1, des munitions
 * par paquets, deux Obligations du même type. Et saisie des attributs de base
 * en cours de partie (`saisie`).
 */
import { describe, expect, it } from 'vitest';
import { calculer, erreursPossessions, ficheJson } from './calcul/index.js';
import { charger, type SystemeCharge } from './chargement/index.js';
import {
  appliquerModifications,
  appliquerTirage,
  donnerEntree,
  retirerEntree,
} from './jets/index.js';
import {
  acheter,
  achatsPossibles,
  choisirEtape,
  rembourser,
  refusSaisie,
} from './progression/index.js';
import {
  EtatEntite,
  nouvellePossession,
  type EtatEntiteSaisi,
  type SystemeSaisi,
} from './schema/index.js';

const source: SystemeSaisi = {
  format: 1,
  id: 'mini-exemplaires',
  version: '1.0.0',
  nom: 'Mini exemplaires',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      attributs: [
        { cle: 'FOR', nom: 'Force', nature: 'base', defaut: 10 },
        { cle: 'bourse', nom: 'Bourse', nature: 'base', defaut: 100, saisie: 'jeu' },
        { cle: 'xp', nom: 'XP', nature: 'base', defaut: 0, saisie: 'mj' },
        { cle: 'nom', nom: 'Nom', nature: 'texte' },
        { cle: 'Attaque', nom: 'Attaque', nature: 'derivee', formule: '0' },
        {
          cle: 'encombrement',
          nom: 'Encombrement',
          nature: 'derivee',
          formule: 'somme("arme", "poids") + somme("munition", "poids")',
        },
        {
          cle: 'armesEquipees',
          nom: 'Armes équipées',
          nature: 'derivee',
          formule: 'compte_actifs("arme")',
        },
        {
          cle: 'poidsEquipe',
          nom: 'Poids équipé',
          nature: 'derivee',
          formule: 'somme_actifs("arme", "poids")',
        },
        { cle: 'armes', nom: 'Armes', nature: 'derivee', formule: 'compte("arme")' },
        { cle: 'munitions', nom: 'Munitions', nature: 'derivee', formule: 'quantite("munition")' },
        { cle: 'paquets', nom: 'Paquets', nature: 'derivee', formule: 'compte("munition")' },
        {
          cle: 'obligation',
          nom: 'Obligation',
          nature: 'derivee',
          formule: 'somme("obligation", "valeur")',
        },
        {
          cle: 'critiques',
          nom: 'Critiques',
          nature: 'derivee',
          formule: 'somme_rangs("critique")',
        },
        { cle: 'Bonus', nom: 'Bonus', nature: 'derivee', formule: '0' },
      ],
    },
  ],
  sortes: [
    {
      id: 'arme',
      nom: 'Arme',
      pour: ['personnage'],
      activable: true,
      exemplaires: true,
      maximum: 3,
      champs: [
        { id: 'poids', nom: 'Poids', type: 'nombre', defaut: 1 },
        { id: 'prix', nom: 'Prix', type: 'nombre', defaut: 0 },
      ],
    },
    {
      id: 'munition',
      nom: 'Munition',
      pour: ['personnage'],
      quantites: true,
      exemplaires: true,
      champs: [
        { id: 'poids', nom: 'Poids', type: 'nombre', defaut: 0 },
        { id: 'prix', nom: 'Prix', type: 'nombre', defaut: 0 },
      ],
    },
    {
      id: 'obligation',
      nom: 'Obligation',
      pour: ['personnage'],
      exemplaires: true,
      champs: [{ id: 'valeur', nom: 'Valeur', type: 'nombre', defaut: 10 }],
    },
    { id: 'etat', nom: 'État', pour: ['personnage'], activable: true },
    { id: 'critique', nom: 'Critique', pour: ['personnage'], rangs: { max: 10 } },
  ],
  catalogue: [
    {
      id: 'dague',
      sorte: 'arme',
      nom: 'Dague',
      champs: { poids: 1, prix: 2 },
      effets: [{ sur: 'attribut', attribut: 'Attaque', operation: 'ajouter', valeur: 1 }],
    },
    { id: 'epee', sorte: 'arme', nom: 'Épée', champs: { poids: 3, prix: 15 } },
    {
      id: 'fleches',
      sorte: 'munition',
      nom: 'Flèches',
      champs: { poids: 1, prix: 1 },
      effets: [{ sur: 'attribut', attribut: 'Bonus', operation: 'ajouter', valeur: 'quantite' }],
    },
    { id: 'dette', sorte: 'obligation', nom: 'Dette' },
    { id: 'sonne', sorte: 'etat', nom: 'Sonné' },
    { id: 'jambe', sorte: 'critique', nom: 'Jambe cassée' },
  ],
  monnaies: [{ id: 'po', nom: 'Pièces', total: '@bourse', pour: ['personnage'] }],
  achats: [
    {
      id: 'arme',
      nom: 'Arme',
      obtient: { type: 'entree', sorte: 'arme' },
      monnaie: 'po',
      cout: 'entree.prix',
    },
    {
      id: 'munition',
      nom: 'Munition',
      obtient: { type: 'entree', sorte: 'munition' },
      monnaie: 'po',
      cout: 'entree.prix',
    },
  ],
  creation: [
    {
      entite: 'personnage',
      etapes: [
        {
          id: 'obligation',
          nom: 'Obligation',
          type: 'choisir',
          sorte: 'obligation',
          min: 0,
          max: 3,
        },
      ],
    },
  ],
  tables: [
    {
      id: 'dettes',
      nom: 'Dettes',
      jet: '1',
      lignes: [{ min: 1, max: 1, nom: 'Dette', entree: 'dette' }],
    },
  ],
};

const charge = (s: unknown): SystemeCharge => {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
};
const sys = charge(source);
const etat = (e: Partial<EtatEntiteSaisi> = {}) =>
  EtatEntite.parse({ type: 'personnage', systeme: { id: sys.source.id, version: '1.0.0' }, ...e });
const fiche = (e: Partial<EtatEntiteSaisi> = {}) => calculer(sys, etat(e));

const plus1 = [
  { sur: 'attribut' as const, attribut: 'Attaque', operation: 'ajouter' as const, valeur: 1 },
];

describe('chargement', () => {
  it('refuse exemplaires et quantités sur une sorte à rangs', () => {
    const r = charger({
      ...source,
      sortes: source.sortes!.map((s) =>
        s.id === 'critique' ? { ...s, exemplaires: true, quantites: true } : s,
      ),
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.erreurs.map((e) => e.chemin)).toEqual([
        'sortes/critique/exemplaires',
        'sortes/critique/quantites',
      ]);
  });

  it('vérifie la sorte de quantite()', () => {
    const r = charger({
      ...source,
      entites: [
        {
          ...source.entites[0]!,
          attributs: [
            ...source.entites[0]!.attributs,
            { cle: 'x', nom: 'X', nature: 'derivee', formule: 'quantite("inconnue")' },
          ],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe('exemplaires multiples', () => {
  const deuxDagues = {
    possessions: [
      nouvellePossession('dague'),
      nouvellePossession('dague', 0, { exemplaire: '2', effets: plus1, champs: { poids: 2 } }),
      nouvellePossession('epee', 0, { actif: false }),
    ],
  };

  it('les agrégats comptent chaque exemplaire, la possession reste agrégée par entrée', () => {
    const f = fiche(deuxDagues);
    expect(f.valeur('armes')).toBe(3);
    expect(f.valeur('armesEquipees')).toBe(2);
    // Champ propre à l'exemplaire : 1 + 2 + 3
    expect(f.valeur('encombrement')).toBe(6);
    expect(f.valeur('poidsEquipe')).toBe(3);
    const dague = f.possessions.get('dague')!;
    expect(dague.exemplaires).toHaveLength(2);
    expect(dague.actif).toBe(true);
    expect(f.erreurs).toEqual([]);
    expect(ficheJson(f).possessions.find((p) => p.entree === 'dague')).toMatchObject({
      exemplaires: 2,
      quantite: 2,
    });
  });

  it('effets du catalogue une fois par entrée, effets propres une source par exemplaire', () => {
    const f = fiche({
      possessions: [
        nouvellePossession('dague', 0, { effets: plus1 }),
        nouvellePossession('dague', 0, { exemplaire: '2', effets: plus1 }),
        nouvellePossession('dague', 0, { exemplaire: '3', effets: plus1, actif: false }),
      ],
    });
    expect(f.sources.map((s) => [s.id, s.genre])).toEqual([
      ['dague', 'entree'],
      ['dague#exemplaire', 'exemplaire'],
      ['dague#2', 'exemplaire'],
    ]);
    expect(f.valeur('Attaque')).toBe(3);
  });

  it('une entrée à rangs ou sans exemplaires ne se possède qu’une fois', () => {
    const e = etat({
      possessions: [
        nouvellePossession('jambe', 1),
        nouvellePossession('jambe', 1),
        nouvellePossession('sonne'),
        nouvellePossession('sonne', 0, { exemplaire: 'b' }),
        nouvellePossession('dague', 0, { exemplaire: 'x' }),
        nouvellePossession('dague', 0, { exemplaire: 'x' }),
        nouvellePossession('sonne', 0, { exemplaire: 'c', quantite: 2 }),
      ],
    });
    expect(erreursPossessions(sys, e).map((x) => x.message)).toEqual([
      'Jambe cassée se possède une seule fois : ses rangs s’additionnent',
      'Sonné se possède une seule fois (État sans exemplaires multiples)',
      'Dague : exemplaire « x » en double',
      'Sonné : pas de quantité pour la sorte État',
    ]);
    expect(calculer(sys, e).erreurs.length).toBe(4);
  });

  it('le maximum d’une sorte compte les exemplaires', () => {
    const e = etat({
      possessions: ['1', '2', '3', '4'].map((x) =>
        nouvellePossession('dague', 0, { exemplaire: x }),
      ),
    });
    expect(erreursPossessions(sys, e).map((x) => x.message)).toEqual(['Maximum de 3 Arme dépassé']);
  });
});

describe('quantités', () => {
  it('somme multiplie par la quantité, quantite() additionne, compte compte les exemplaires', () => {
    const f = fiche({
      possessions: [
        nouvellePossession('fleches', 0, { quantite: 20 }),
        nouvellePossession('fleches', 0, { exemplaire: 'argent', quantite: 5 }),
      ],
    });
    expect(f.valeur('munitions')).toBe(25);
    expect(f.valeur('paquets')).toBe(2);
    expect(f.valeur('encombrement')).toBe(25);
    // Variable `quantite` d'un effet du catalogue : quantité totale de l'entrée
    expect(f.valeur('Bonus')).toBe(25);
  });
});

describe('don et retrait', () => {
  it('une entrée déjà possédée : nouvel exemplaire, unités, ou durée prolongée', () => {
    let l = donnerEntree(sys, [], 'dague');
    l = donnerEntree(sys, l, 'dague');
    expect(l.map((p) => p.exemplaire)).toEqual([undefined, '2']);
    l = donnerEntree(sys, l, 'fleches', { rangs: 10 });
    l = donnerEntree(sys, l, 'fleches', { rangs: 5 });
    expect(l.find((p) => p.entree === 'fleches')?.quantite).toBe(15);
    l = donnerEntree(sys, l, 'sonne', { duree: 1 });
    l = donnerEntree(sys, l, 'sonne', { duree: 3 });
    expect(l.filter((p) => p.entree === 'sonne').map((p) => p.duree)).toEqual([3]);
    l = donnerEntree(sys, l, 'jambe');
    l = donnerEntree(sys, l, 'jambe');
    expect(l.filter((p) => p.entree === 'jambe').map((p) => p.rang)).toEqual([2]);

    l = retirerEntree(sys, l, 'fleches', { rangs: 4 });
    expect(l.find((p) => p.entree === 'fleches')?.quantite).toBe(11);
    l = retirerEntree(sys, l, 'fleches', { rangs: 11 });
    expect(l.some((p) => p.entree === 'fleches')).toBe(false);
    l = retirerEntree(sys, l, 'dague', { exemplaire: undefined });
    expect(l.filter((p) => p.entree === 'dague').map((p) => p.exemplaire)).toEqual([undefined]);
  });

  it('conséquences et tables suivent les mêmes règles', () => {
    const f = fiche({ possessions: [nouvellePossession('dette', 0, { champs: { valeur: 5 } })] });
    const e = appliquerModifications(f, [
      { entite: 'acteur', entree: 'dette', operation: 'donner', rangs: 1, exemplaire: 'mafia' },
    ]);
    expect(e.possessions.map((p) => p.exemplaire)).toEqual([undefined, 'mafia']);
    const t = appliquerTirage(sys, e, { ligne: { entree: 'dette' } });
    expect(t.possessions.map((p) => p.exemplaire)).toEqual([undefined, 'mafia', '2']);
    expect(calculer(sys, t).valeur('obligation')).toBe(25);
    const r = appliquerModifications(calculer(sys, t), [
      { entite: 'acteur', entree: 'dette', operation: 'retirer', rangs: 1, exemplaire: 'mafia' },
    ]);
    expect(r.possessions.map((p) => p.exemplaire)).toEqual([undefined, '2']);
  });
});

describe('achats', () => {
  it('racheter une entrée : nouvel exemplaire ou une unité de plus, remboursables', () => {
    let e = etat();
    for (const objet of ['dague', 'dague']) {
      const r = acheter(sys, e, { achat: 'arme', objet });
      if (!r.ok) throw new Error(r.erreur);
      e = r.etat;
    }
    expect(e.possessions.map((p) => p.exemplaire)).toEqual([undefined, '2']);
    for (let i = 0; i < 2; i++) {
      const r = acheter(sys, e, { achat: 'munition', objet: 'fleches' });
      if (!r.ok) throw new Error(r.erreur);
      e = r.etat;
    }
    expect(e.possessions.find((p) => p.entree === 'fleches')?.quantite).toBe(2);
    const f = calculer(sys, e);
    const objets = achatsPossibles(f).flatMap((a) => a.objets);
    expect(objets.find((o) => o.objet === 'dague')).toMatchObject({
      mode: 'exemplaire',
      nombre: 2,
    });
    expect(objets.find((o) => o.objet === 'fleches')).toMatchObject({ mode: 'quantite' });

    const r = rembourser(sys, e, e.journal.length - 1);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.etat.possessions.find((p) => p.entree === 'fleches')?.quantite).toBe(1);
  });

  it('le maximum de la sorte bloque un exemplaire de trop', () => {
    const e = etat({
      possessions: [
        nouvellePossession('dague'),
        nouvellePossession('dague', 0, { exemplaire: '2' }),
        nouvellePossession('epee'),
      ],
    });
    const r = acheter(sys, e, { achat: 'arme', objet: 'dague' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain('Maximum de 3');
  });
});

describe('création', () => {
  it('deux Obligations du même type deviennent deux exemplaires', () => {
    const r = choisirEtape(sys, etat({ creation: true }), 'obligation', [
      { entree: 'dette' },
      { entree: 'dette' },
      { entree: 'dette', exemplaire: 'jabba' },
    ]);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.etat.possessions.map((p) => p.exemplaire)).toEqual([undefined, '2', 'jabba']);
    expect(calculer(sys, r.etat).valeur('obligation')).toBe(30);
    const doublon = choisirEtape(sys, etat({ creation: true }), 'obligation', [
      { entree: 'dette', exemplaire: 'a' },
      { entree: 'dette', exemplaire: 'a' },
    ]);
    expect(doublon.ok).toBe(false);
  });
});

describe('saisie des attributs de base', () => {
  const attr = (cle: string) => sys.entites.get('personnage')!.attributs.get(cle)!;
  const joueur = { proprietaire: true, mj: false };
  const mj = { proprietaire: false, mj: true };

  it('pendant la création, tout attribut de base se saisit', () => {
    expect(refusSaisie(attr('FOR'), true, joueur)).toBeUndefined();
    expect(refusSaisie(attr('xp'), true, joueur)).toBeUndefined();
  });

  it('en jeu : `jeu` pour le propriétaire et le MJ, `mj` pour le MJ seul, sinon jamais', () => {
    expect(refusSaisie(attr('FOR'), false, mj)).toContain('pendant la création');
    expect(refusSaisie(attr('bourse'), false, joueur)).toBeUndefined();
    expect(refusSaisie(attr('bourse'), false, mj)).toBeUndefined();
    expect(refusSaisie(attr('xp'), false, joueur)).toContain('MJ');
    expect(refusSaisie(attr('xp'), false, mj)).toBeUndefined();
    expect(refusSaisie(attr('nom'), false, joueur)).toBeUndefined();
    expect(refusSaisie(attr('Attaque'), true, joueur)).toContain('calculé');
  });
});
