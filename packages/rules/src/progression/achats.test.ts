import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import {
  acheter,
  achatsPossibles,
  examinerAchat,
  rembourser,
  solde,
  soldes,
  type ObjetAchetable,
} from './index.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

/** Mini symboles, plus un achat d'entrée (talent libre) avec prérequis et condition. */
const symbolesPlus: SystemeSaisi = {
  ...miniSymboles,
  catalogue: [
    ...(miniSymboles.catalogue ?? []),
    { id: 'costaud', sorte: 'talent', nom: 'Costaud', exige: '@vigueur >= 3' },
    { id: 'kubaz', sorte: 'espece', nom: 'Kubaz' },
  ],
  achats: [
    ...(miniSymboles.achats ?? []),
    {
      id: 'talent-libre',
      nom: 'Talent libre',
      obtient: { type: 'entree', sorte: 'talent' },
      monnaie: 'xp',
      cout: '10 * (nombre + 1)',
    },
    {
      id: 'espece',
      nom: 'Espèce',
      obtient: { type: 'entree', sorte: 'espece' },
      monnaie: 'xp',
      cout: '0',
      condition: '@xpGagne >= 10',
    },
  ],
};

const d20 = systeme(miniD20);
const sym = systeme(symbolesPlus);

const etat = (s: SystemeCharge, e: Partial<EtatEntiteSaisi>) =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: s.source.id, version: s.source.version },
    ...e,
  });

/** Objet d'un achat dans la liste des achats possibles. */
function objet(s: SystemeCharge, e: EtatEntite, achat: string, id: string): ObjetAchetable {
  const a = achatsPossibles(calculer(s, e)).find((x) => x.achat.id === achat);
  const o = a?.objets.find((x) => x.objet === id);
  if (!o) throw new Error(`${achat}/${id} absent`);
  return o;
}

/** Enchaîne des achats qui doivent réussir. */
function achats(s: SystemeCharge, e: EtatEntite, ...demandes: [string, string][]): EtatEntite {
  return demandes.reduce((acc, [achat, o]) => {
    const r = acheter(s, acc, { achat, objet: o });
    if (!r.ok) throw new Error(`${achat}/${o} : ${r.erreur}`);
    return r.etat;
  }, e);
}

const codes = (o: ObjetAchetable) => o.blocages.map((b) => b.code);

describe('monnaies', () => {
  it('solde = total − dépenses du journal', () => {
    const e = etat(sym, {
      valeurs: { xpGagne: 20 },
      possessions: [{ entree: 'bothan' }],
      journal: [
        { achat: 'rang-competence', objet: 'athletisme', cout: 10, monnaie: 'xp', creation: true },
      ],
    });
    const f = calculer(sym, e);
    expect(solde(f, 'xp')).toBe(110);
    expect(soldes(f)).toEqual([
      { monnaie: sym.monnaies.get('xp'), total: 120, depense: 10, solde: 110 },
    ]);
  });

  it('refuse une monnaie inconnue', () => {
    expect(() => solde(calculer(sym, etat(sym, {})), 'credits')).toThrow('Monnaie inconnue');
  });
});

describe('achats à symboles (progression EotE en données)', () => {
  const humainChasseur = etat(sym, {
    creation: true,
    possessions: [{ entree: 'humain' }, { entree: 'chasseur' }],
  });

  it('rang 1 : 5 en carrière, 10 hors carrière', () => {
    expect(objet(sym, humainChasseur, 'rang-competence', 'athletisme')).toMatchObject({
      actuel: 0,
      cible: 1,
      cout: 5,
      plafond: 2,
      possible: true,
    });
    expect(objet(sym, humainChasseur, 'rang-competence', 'discretion')).toMatchObject({
      cout: 10,
      possible: true,
    });
  });

  it('le rang gratuit d’espèce compte dans actuel, et le plafond de création est 2', () => {
    let e = etat(sym, { creation: true, possessions: [{ entree: 'bothan' }] });
    // Discrétion hors carrière, rang gratuit 1 : le rang 2 coûte 5 × 2 + 5
    expect(objet(sym, e, 'rang-competence', 'discretion')).toMatchObject({
      actuel: 1,
      cible: 2,
      cout: 15,
    });
    e = achats(sym, e, ['rang-competence', 'discretion']);
    expect(e.possessions.find((p) => p.entree === 'discretion')?.rang).toBe(1);
    expect(calculer(sym, e).possessions.get('discretion')?.rang).toBe(2);
    expect(solde(calculer(sym, e), 'xp')).toBe(85);

    const bloque = objet(sym, e, 'rang-competence', 'discretion');
    expect(bloque).toMatchObject({ cible: 3, plafond: 2, possible: false });
    expect(codes(bloque)).toEqual(['plafond']);
    const r = acheter(sym, e, { achat: 'rang-competence', objet: 'discretion' });
    expect(r).toMatchObject({ ok: false, erreur: 'Plafond atteint (2)' });

    // En jeu, le plafond passe à 5
    const jeu = { ...e, creation: false };
    expect(objet(sym, jeu, 'rang-competence', 'discretion')).toMatchObject({
      cout: 20,
      plafond: 5,
      possible: true,
    });
  });

  it('rang maximal de la sorte', () => {
    const e = etat(sym, {
      possessions: [{ entree: 'bothan' }, { entree: 'athletisme', rang: 5 }],
    });
    const o = objet(sym, e, 'rang-competence', 'athletisme');
    expect(codes(o)).toEqual(['rang-max', 'plafond']);
    expect(o.blocages[0]!.message).toBe('Athlétisme : rang maximal 5 atteint');
  });

  it('caractéristique : 10 × cible, plafond 5, seulement à la création', () => {
    let e = etat(sym, { creation: true, possessions: [{ entree: 'humain' }] });
    expect(objet(sym, e, 'caracteristique', 'vigueur')).toMatchObject({
      actuel: 2,
      cible: 3,
      cout: 30,
      possible: true,
    });
    e = achats(sym, e, ['caracteristique', 'vigueur'], ['caracteristique', 'vigueur']);
    expect(e.valeurs.vigueur).toBe(4);
    expect(solde(calculer(sym, e), 'xp')).toBe(110 - 30 - 40);
    expect(objet(sym, e, 'caracteristique', 'vigueur')).toMatchObject({ cout: 50 });

    const cinq = { ...e, valeurs: { vigueur: 5 } };
    expect(codes(objet(sym, cinq, 'caracteristique', 'vigueur'))).toEqual(['plafond', 'solde']);

    const jeu = { ...e, creation: false };
    expect(achatsPossibles(calculer(sym, jeu)).map((a) => a.achat.id)).not.toContain(
      'caracteristique',
    );
    expect(acheter(sym, jeu, { achat: 'caracteristique', objet: 'vigueur' })).toEqual({
      ok: false,
      erreur: '« Caractéristique » n’est possible qu’à la création',
    });
  });

  it('solde insuffisant', () => {
    const e = etat(sym, {});
    const o = objet(sym, e, 'rang-competence', 'athletisme');
    expect(o).toMatchObject({ cout: 10, possible: false });
    expect(o.blocages).toEqual([
      { code: 'solde', message: 'Solde insuffisant : 10 requis, 0 disponible' },
    ]);
    const r = acheter(sym, e, { achat: 'rang-competence', objet: 'athletisme' });
    expect(r.ok).toBe(false);
  });

  it('arbre : fermé sans la carrière, a2 bloqué tant que a1 n’est pas acquis', () => {
    const sans = etat(sym, { possessions: [{ entree: 'bothan' }] });
    expect(codes(objet(sym, sans, 'noeud', 'arbre-chasseur/a1'))).toEqual(['arbre-ferme']);

    let e = etat(sym, { possessions: [{ entree: 'bothan' }, { entree: 'chasseur' }] });
    expect(objet(sym, e, 'noeud', 'arbre-chasseur/a1')).toMatchObject({
      cout: 5,
      possible: true,
      entree: 'robuste',
      arbre: 'arbre-chasseur',
      noeud: 'a1',
    });
    const a2 = objet(sym, e, 'noeud', 'arbre-chasseur/a2');
    expect(a2.cout).toBe(10);
    expect(codes(a2)).toEqual(['non-relie']);

    e = achats(sym, e, ['noeud', 'arbre-chasseur/a1']);
    expect(e.noeuds).toEqual({ 'arbre-chasseur': ['a1'] });
    expect(objet(sym, e, 'noeud', 'arbre-chasseur/a2')).toMatchObject({
      actuel: 1,
      cout: 10,
      possible: true,
    });
    // Un nœud acquis n'est plus proposé
    const noeuds = achatsPossibles(calculer(sym, e)).find((a) => a.achat.id === 'noeud')!;
    expect(noeuds.objets.map((o) => o.objet)).toEqual(['arbre-chasseur/a2']);
    expect(acheter(sym, e, { achat: 'noeud', objet: 'arbre-chasseur/a1' })).toMatchObject({
      ok: false,
      erreur: 'Nœud déjà acquis',
    });

    e = achats(sym, e, ['noeud', 'arbre-chasseur/a2']);
    expect(calculer(sym, e).possessions.get('robuste')?.rang).toBe(2);
    expect(solde(calculer(sym, e), 'xp')).toBe(85);
  });

  it('lien simple : ne se remonte pas', () => {
    const s = systeme({
      ...symbolesPlus,
      arbres: [
        {
          id: 'arbre-chasseur',
          nom: 'Chasseur',
          noeuds: [
            { id: 'a1', entree: 'robuste', x: 0, y: 0, cout: '5' },
            { id: 'a2', entree: 'robuste', x: 0, y: 1, cout: '5', depart: true },
          ],
          liens: [{ de: 'a1', vers: 'a2', sens: 'simple' }],
        },
      ],
    });
    const e = etat(s, {
      possessions: [{ entree: 'bothan' }],
      noeuds: { 'arbre-chasseur': ['a2'] },
    });
    expect(codes(objet(s, e, 'noeud', 'arbre-chasseur/a1'))).toEqual(['non-relie']);
  });

  it('nouvelle entrée : nombre, prérequis, maximum de la sorte, condition', () => {
    let e = etat(sym, { possessions: [{ entree: 'bothan' }] });
    const costaud = objet(sym, e, 'talent-libre', 'costaud');
    expect(costaud).toMatchObject({ nombre: 0, cout: 10 });
    expect(codes(costaud)).toEqual(['exige']);

    e = achats(sym, e, ['talent-libre', 'robuste']);
    expect(e.possessions.at(-1)).toMatchObject({ entree: 'robuste', rang: 1 });
    e = { ...e, valeurs: { vigueur: 3 } };
    expect(objet(sym, e, 'talent-libre', 'costaud')).toMatchObject({
      nombre: 1,
      cout: 20,
      possible: true,
    });
    // Les entrées déjà possédées ne sont pas proposées
    const libres = achatsPossibles(calculer(sym, e)).find((a) => a.achat.id === 'talent-libre')!;
    expect(libres.objets.map((o) => o.objet)).toEqual(['costaud']);

    // Espèce : une seule par personnage, et condition sur l'XP gagnée
    const kubaz = objet(sym, e, 'espece', 'kubaz');
    expect(codes(kubaz)).toEqual(['maximum', 'condition']);
    expect(kubaz.blocages[0]!.message).toBe('Maximum de 1 Espèce atteint (1)');
  });

  it('objet inconnu d’un achat', () => {
    const f = calculer(sym, etat(sym, {}));
    expect(examinerAchat(f, 'rang-competence', 'vigueur')).toEqual({
      ok: false,
      erreur: '« vigueur » ne s’obtient pas par « Rang de compétence »',
    });
    expect(examinerAchat(f, 'inconnu', 'x')).toEqual({
      ok: false,
      erreur: 'Achat inconnu : inconnu',
    });
  });

  it('n’altère jamais l’état reçu', () => {
    const e = etat(sym, { creation: true, possessions: [{ entree: 'bothan' }] });
    const avant = structuredClone(e);
    const r = acheter(sym, e, {
      achat: 'rang-competence',
      objet: 'athletisme',
      date: '2026-09-26',
    });
    expect(e).toEqual(avant);
    expect(r).toMatchObject({
      ok: true,
      ligne: {
        achat: 'rang-competence',
        objet: 'athletisme',
        cout: 10,
        monnaie: 'xp',
        creation: true,
        date: '2026-09-26',
      },
    });
  });
});

describe('achat par points d20', () => {
  it('27 points, 1 point jusqu’à 13 puis 2, plafond 15', () => {
    let e = etat(d20, { creation: true });
    const f = calculer(d20, e);
    const carac = achatsPossibles(f).find((a) => a.achat.id === 'carac')!;
    expect(carac.solde).toBe(27);
    // Le groupe « carac » ne contient que les attributs de base du groupe
    expect(carac.objets.map((o) => [o.objet, o.cout])).toEqual([
      ['FOR', 1],
      ['DEX', 1],
      ['CON', 1],
    ]);

    e = achats(d20, e, ['carac', 'FOR'], ['carac', 'FOR'], ['carac', 'FOR']);
    expect(objet(d20, e, 'carac', 'FOR')).toMatchObject({ actuel: 13, cible: 14, cout: 2 });
    e = achats(d20, e, ['carac', 'FOR'], ['carac', 'FOR']);
    expect(e.valeurs.FOR).toBe(15);
    expect(solde(calculer(d20, e), 'points')).toBe(20);
    const o = objet(d20, e, 'carac', 'FOR');
    expect(o).toMatchObject({ plafond: 15, possible: false });
    expect(codes(o)).toEqual(['plafond']);
  });

  it('les effets de race ne comptent pas dans la valeur achetée', () => {
    const e = etat(d20, { creation: true, possessions: [{ entree: 'elfe' }] });
    expect(objet(d20, e, 'carac', 'DEX')).toMatchObject({ actuel: 10, cible: 11 });
    expect(calculer(d20, e).valeur('DEX')).toBe(12);
  });

  it('hors création, l’achat n’est pas proposé', () => {
    expect(achatsPossibles(calculer(d20, etat(d20, {})))).toEqual([]);
  });
});

describe('remboursement', () => {
  const depart = etat(sym, {
    creation: true,
    possessions: [{ entree: 'bothan' }, { entree: 'chasseur' }],
  });

  it('annule le dernier achat d’un objet et rend son coût', () => {
    let e = achats(
      sym,
      depart,
      ['rang-competence', 'athletisme'],
      ['rang-competence', 'athletisme'],
      ['caracteristique', 'vigueur'],
    );
    expect(solde(calculer(sym, e), 'xp')).toBe(100 - 5 - 10 - 30);

    expect(rembourser(sym, e, 0)).toEqual({
      ok: false,
      erreur: 'Un achat plus récent de « athletisme » doit être annulé d’abord',
    });
    expect(rembourser(sym, e, 9)).toEqual({
      ok: false,
      erreur: 'Aucun achat à la ligne 9 du journal',
    });

    const avant = structuredClone(e);
    let r = rembourser(sym, e, 1);
    expect(e).toEqual(avant);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.ligne).toMatchObject({ objet: 'athletisme', cout: 10 });
    e = r.etat;
    expect(e.possessions.find((p) => p.entree === 'athletisme')?.rang).toBe(1);
    expect(solde(calculer(sym, e), 'xp')).toBe(65);

    r = rembourser(sym, e, 0);
    if (!r.ok) throw new Error(r.erreur);
    e = r.etat;
    // La possession créée par l'achat disparaît avec son dernier rang
    expect(e.possessions.map((p) => p.entree)).toEqual(['bothan', 'chasseur']);

    r = rembourser(sym, e, 0);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.etat.valeurs.vigueur).toBe(2);
    expect(r.etat.journal).toEqual([]);
    expect(solde(calculer(sym, r.etat), 'xp')).toBe(100);
  });

  it('un nœud ne se retire pas s’il en relie d’autres', () => {
    const e = achats(sym, depart, ['noeud', 'arbre-chasseur/a1'], ['noeud', 'arbre-chasseur/a2']);
    expect(rembourser(sym, e, 0)).toEqual({
      ok: false,
      erreur: 'Nœuds qui ne seraient plus reliés : a2',
    });
    const r = rembourser(sym, e, 1);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.etat.noeuds).toEqual({ 'arbre-chasseur': ['a1'] });
    const r2 = rembourser(sym, r.etat, 0);
    expect(r2.ok && r2.etat.noeuds).toEqual({ 'arbre-chasseur': [] });
  });

  it('une entrée achetée se retire', () => {
    const e = achats(sym, depart, ['talent-libre', 'robuste']);
    const r = rembourser(sym, e, 0);
    expect(r.ok && r.etat.possessions.map((p) => p.entree)).toEqual(['bothan', 'chasseur']);
  });

  it('un achat de création ne s’annule plus en jeu', () => {
    const e = achats(sym, depart, ['rang-competence', 'athletisme']);
    expect(rembourser(sym, { ...e, creation: false }, 0)).toEqual({
      ok: false,
      erreur: 'Un achat de création ne s’annule plus une fois la création terminée',
    });
  });
});
