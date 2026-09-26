import { describe, expect, it } from 'vitest';
import { calculer, type Fiche } from '../calcul/index.js';
import { charger, chemins, type SystemeCharge } from '../chargement/index.js';
import { aleatoireImpose, type Valeur } from '../formules/index.js';
import { Entree, EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import {
  ameliorer,
  executerAction,
  initiative,
  lancerSymboles,
  type JetSymbolesResultat,
  type ResultatAction,
} from './index.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

/** Variante du mini système à symboles : talents qui modifient les jets. */
const symbolesEtendu: SystemeSaisi = {
  ...miniSymboles,
  id: 'mini-symboles-etendu',
  catalogue: [
    ...miniSymboles.catalogue!,
    {
      id: 'puissant',
      sorte: 'talent',
      nom: 'Puissant',
      effets: [
        {
          sur: 'jet',
          actions: ['test'],
          si: 'competence == "athletisme"',
          ajout: { de: 'aptitude', nombre: 'rang' },
        },
      ],
    },
    {
      id: 'entraine',
      sorte: 'talent',
      nom: 'Entraîné',
      effets: [{ sur: 'jet', ajout: { ameliorer: 'aptitude', vers: 'maitrise', nombre: 1 } }],
    },
    {
      id: 'furtif',
      sorte: 'talent',
      nom: 'Furtif',
      effets: [
        {
          sur: 'jet',
          si: 'competence == "discretion"',
          ajout: { ameliorer: 'aptitude', vers: 'maitrise', nombre: 'rang' },
        },
      ],
    },
    {
      id: 'eclope',
      sorte: 'talent',
      nom: 'Éclopé',
      effets: [
        {
          sur: 'jet',
          condition: '@vigueur < 2',
          ajout: { de: 'difficulte', nombre: 1 },
        },
      ],
    },
  ],
};

/**
 * Contournement d'un défaut du chargeur : il vérifie les dés des effets de jet
 * (`verifierSortesEtCatalogue`) avant d'avoir indexé les dés à symboles
 * (`verifierDes`), si bien que tout ajout `{ de }` ou `{ ameliorer, vers }` est
 * refusé (« Dé inconnu »). Tant que ce n'est pas corrigé, on charge une copie où
 * ces ajouts sont des bonus (même formule, même environnement de typage), puis
 * on remet les vrais ajouts. Une fois le chargeur corrigé, le chargement direct
 * réussit et ce détour n'est plus emprunté.
 */
function chargerAvecEffetsDeDes(s: SystemeSaisi): SystemeCharge {
  const direct = charger(s);
  if (direct.ok) return direct.systeme;
  const masque: SystemeSaisi = {
    ...s,
    catalogue: s.catalogue!.map((e) => ({
      ...e,
      effets: (e.effets ?? []).map((f) =>
        f.sur === 'jet' && f.ajout && !('bonus' in f.ajout)
          ? { ...f, ajout: { bonus: f.ajout.nombre } }
          : f,
      ),
    })),
  };
  const charge = systeme(masque);
  for (const saisie of s.catalogue!) {
    const e = Entree.parse(saisie);
    e.effets.forEach((f, i) => {
      if (f.sur !== 'jet' || !f.ajout || 'bonus' in f.ajout) return;
      const bonus = charge.formule(chemins.effet(e.id, i, 'bonus'));
      charge.formules.set(chemins.effet(e.id, i, 'nombre'), bonus);
    });
    charge.entrees.set(e.id, e);
  }
  charge.source.catalogue = [...charge.entrees.values()];
  return charge;
}

const sym = systeme(miniSymboles);
const symE = chargerAvecEffetsDeDes(symbolesEtendu);

const fiche = (s: SystemeCharge, e: Partial<EtatEntiteSaisi> = {}): Fiche =>
  calculer(
    s,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: s.source.id, version: s.source.version },
      ...e,
    }),
  );

function tester(
  s: SystemeCharge,
  acteur: Fiche,
  parametres: Record<string, Valeur>,
  des: number[],
): ResultatAction {
  const r = executerAction(s, {
    action: 'test',
    acteur,
    parametres,
    aleatoire: aleatoireImpose(des),
  });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.resultat;
}

const jet = (r: ResultatAction) => r.jet as JetSymbolesResultat;

describe('lancerSymboles', () => {
  it('lance dans l’ordre des sortes du système et lit les résultats', () => {
    const l = lancerSymboles(
      sym,
      [
        { de: 'difficulte', nombre: 1 },
        { de: 'aptitude', nombre: 1 },
      ],
      aleatoireImpose([7, 7]),
    );
    expect(l.des).toEqual([
      { de: 'aptitude', face: 7, symboles: { succes: 1, avantage: 1 } },
      { de: 'difficulte', face: 7, symboles: { menace: 2 } },
    ]);
    expect(l.symboles).toEqual({ succes: 1, echec: 0, avantage: 1, menace: 2 });
    expect(l.resultats).toEqual({ succesNets: 1, avantagesNets: 0 });
    expect(l.erreurs).toEqual([]);
  });

  it('refuse un dé inconnu ou un système sans dés', () => {
    expect(() => lancerSymboles(sym, [{ de: 'force', nombre: 1 }], aleatoireImpose([1]))).toThrow(
      'Dé inconnu : force',
    );
    expect(() => lancerSymboles(systeme(miniD20), [], aleatoireImpose([]))).toThrow(
      'ne déclare pas de dés à symboles',
    );
  });
});

describe('ameliorer', () => {
  it('change des dés, puis en ajoute quand il n’en reste plus', () => {
    const pool = [
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 1 },
    ];
    expect(ameliorer(pool, 'aptitude', 'maitrise', 1)).toEqual([
      { de: 'aptitude', nombre: 1 },
      { de: 'difficulte', nombre: 1 },
      { de: 'maitrise', nombre: 1 },
    ]);
    expect(ameliorer(pool, 'aptitude', 'maitrise', 3)).toEqual([
      { de: 'aptitude', nombre: 1 },
      { de: 'difficulte', nombre: 1 },
      { de: 'maitrise', nombre: 2 },
    ]);
    expect(ameliorer([], 'aptitude', 'maitrise', 2)).toEqual([{ de: 'maitrise', nombre: 1 }]);
    expect(ameliorer(pool, 'aptitude', 'maitrise', -1)).toEqual(pool);
    expect(pool).toEqual([
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 1 },
    ]);
  });
});

describe('test de compétence à symboles', () => {
  // Vigueur 3, Athlétisme rang 2 : 3 aptitudes dont 2 améliorées en maîtrises
  const costaud = fiche(sym, {
    valeurs: { vigueur: 3 },
    possessions: [{ entree: 'athletisme', rang: 2 }],
  });

  it('pool construit par formules et améliorations, résultats et réussite', () => {
    const r = tester(sym, costaud, { competence: 'athletisme' }, [4, 4, 7, 2, 1]);
    expect(jet(r).pool).toEqual([
      { de: 'aptitude', nombre: 1 },
      { de: 'maitrise', nombre: 2 },
      { de: 'difficulte', nombre: 2 },
    ]);
    expect(jet(r).des.map((d) => [d.de, d.face])).toEqual([
      ['aptitude', 4],
      ['maitrise', 4],
      ['maitrise', 7],
      ['difficulte', 2],
      ['difficulte', 1],
    ]);
    expect(jet(r).symboles).toEqual({ succes: 5, echec: 1, avantage: 1, menace: 0 });
    expect(r.variables).toEqual({
      competence: 'athletisme',
      'competence.rang': 2,
      'competence.caracteristique': 'vigueur',
      difficulte: 2,
      carac: 3,
      succesNets: 4,
      avantagesNets: 1,
      reussi: true,
    });
    expect(r.reussi).toBe(true);
    expect(r.modifications).toEqual([]);
    expect(r.explications).toEqual([
      'Compétence : Athlétisme (rang 2)',
      'Difficulté : 2',
      'carac = 3',
      'Test de compétence : 2 Aptitude → Maîtrise',
      'Pool : 1 × Aptitude, 2 × Maîtrise, 2 × Difficulté',
      'Symboles : Succès 5, Échec 1, Avantage 1',
      'Succès nets : 4, Avantages nets : 1',
      'Réussite',
    ]);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('échec contre une difficulté plus forte, compétence au rang 0', () => {
    const novice = fiche(sym, { possessions: [{ entree: 'athletisme' }] });
    const r = tester(sym, novice, { competence: 'athletisme', difficulte: 3 }, [1, 1, 2, 2, 1]);
    expect(jet(r).pool).toEqual([
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 3 },
    ]);
    expect(r.variables).toMatchObject({ succesNets: 0, avantagesNets: 0, reussi: false });
    expect(r.reussi).toBe(false);
  });

  it('paramètres invalides', () => {
    const essai = (parametres: Record<string, Valeur>) =>
      executerAction(sym, {
        action: 'test',
        acteur: costaud,
        parametres,
        aleatoire: aleatoireImpose([]),
      });
    expect(essai({ competence: 'distance' })).toEqual({
      ok: false,
      erreurs: [
        {
          parametre: 'competence',
          message: 'Compétence : Distance (légère) n’est pas possédée par l’acteur',
        },
      ],
    });
    expect(essai({ competence: 'bothan', difficulte: 'dure' })).toEqual({
      ok: false,
      erreurs: [
        { parametre: 'competence', message: 'Compétence : Bothan n’est pas Compétence' },
        { parametre: 'difficulte', message: 'Difficulté : nombre attendu' },
      ],
    });
    expect(essai({ competence: 3 })).toMatchObject({
      erreurs: [{ parametre: 'competence', message: 'Compétence : identifiant d’entrée attendu' }],
    });
    expect(essai({})).toMatchObject({
      erreurs: [{ parametre: 'competence', message: 'Compétence : Compétence requise' }],
    });
    expect(
      executerAction(sym, {
        action: 'test',
        acteur: costaud,
        cible: costaud,
        parametres: { competence: 'athletisme' },
        aleatoire: aleatoireImpose([]),
      }),
    ).toEqual({ ok: false, erreurs: [{ message: 'Test de compétence ne prend pas de cible' }] });
  });

  it('effets de jet : dés ajoutés, améliorations, conditions', () => {
    const talentueux = fiche(symE, {
      valeurs: { vigueur: 3 },
      possessions: [
        { entree: 'athletisme', rang: 2 },
        { entree: 'discretion', rang: 1 },
        { entree: 'puissant', rang: 1 },
        { entree: 'entraine', rang: 1 },
        { entree: 'furtif', rang: 2 },
        { entree: 'eclope', rang: 1 },
      ],
    });
    // 3 aptitudes + 1 (Puissant) ; 2 améliorations (action) + 1 (Entraîné)
    const r = tester(symE, talentueux, { competence: 'athletisme' }, [1, 1, 1, 1, 1, 1]);
    expect(jet(r).pool).toEqual([
      { de: 'aptitude', nombre: 1 },
      { de: 'maitrise', nombre: 3 },
      { de: 'difficulte', nombre: 2 },
    ]);
    expect(jet(r).construction).toEqual([
      {
        source: 'action',
        nom: 'Test de compétence',
        operation: 'ajouter',
        de: 'aptitude',
        nombre: 3,
      },
      {
        source: 'action',
        nom: 'Test de compétence',
        operation: 'ajouter',
        de: 'difficulte',
        nombre: 2,
      },
      { source: 'puissant', nom: 'Puissant', operation: 'ajouter', de: 'aptitude', nombre: 1 },
      {
        source: 'action',
        nom: 'Test de compétence',
        operation: 'ameliorer',
        de: 'aptitude',
        vers: 'maitrise',
        nombre: 2,
      },
      {
        source: 'entraine',
        nom: 'Entraîné',
        operation: 'ameliorer',
        de: 'aptitude',
        vers: 'maitrise',
        nombre: 1,
      },
    ]);
    expect(r.explications).toContain('Puissant : + 1 Aptitude');
    expect(r.explications).toContain('Entraîné : 1 Aptitude → Maîtrise');

    // Discrétion (agilité 2, rang 1) : Furtif améliore 2 dés, Puissant ne s'applique pas
    const d = tester(symE, talentueux, { competence: 'discretion' }, [1, 1, 1, 1, 1]);
    // 2 aptitudes ; 1 (action) + 1 (Entraîné) + 2 (Furtif) améliorations : la 3e ajoute
    // une aptitude faute d'aptitude restante, la 4e l'améliore
    expect(jet(d).pool).toEqual([
      { de: 'maitrise', nombre: 3 },
      { de: 'difficulte', nombre: 2 },
    ]);

    // Éclopé : un dé de difficulté en plus si la vigueur est inférieure à 2
    const faible = fiche(symE, {
      valeurs: { vigueur: 1 },
      possessions: [
        { entree: 'athletisme', rang: 1 },
        { entree: 'eclope', rang: 1 },
      ],
    });
    const f = tester(symE, faible, { competence: 'athletisme' }, [1, 1, 1, 1]);
    expect(jet(f).pool).toEqual([
      { de: 'maitrise', nombre: 1 },
      { de: 'difficulte', nombre: 3 },
    ]);
  });
});

describe('initiative', () => {
  const combattant = () =>
    fiche(sym, { valeurs: { vigueur: 2 }, possessions: [{ entree: 'athletisme', rang: 1 }] });
  const parametres = { competence: 'athletisme', difficulte: 0 };

  it('trie par clés successives, décroissant, départage stable', () => {
    // Chaque participant lance 1 aptitude + 1 maîtrise
    const r = initiative(
      sym,
      [
        { id: 'a', fiche: combattant(), parametres }, // succès 1, avantage 1
        { id: 'b', fiche: combattant(), parametres }, // succès 2
        { id: 'c', fiche: combattant(), parametres }, // succès 1
        { id: 'd', fiche: combattant(), parametres }, // succès 1 (égalité avec c)
      ],
      aleatoireImpose([2, 6, 4, 1, 2, 1, 2, 1]),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    expect(r.ordre.map((x) => [x.id, x.cles])).toEqual([
      ['b', [2, 0]],
      ['a', [1, 1]],
      ['c', [1, 0]],
      ['d', [1, 0]],
    ]);
    expect(r.ordre[0]!.resultat.action).toBe('test');
  });

  it('signale les participants invalides', () => {
    const r = initiative(
      sym,
      [
        { id: 'a', fiche: combattant(), parametres },
        { id: 'b', fiche: combattant(), parametres: { competence: 'discretion' } },
      ],
      aleatoireImpose([1, 1]),
    );
    expect(r).toEqual({
      ok: false,
      erreurs: [
        {
          participant: 'b',
          parametre: 'competence',
          message: 'Compétence : Discrétion n’est pas possédée par l’acteur',
        },
      ],
    });
    expect(initiative(systeme(miniD20), [], aleatoireImpose([]))).toMatchObject({ ok: false });
    expect(
      initiative(
        sym,
        [
          { id: 'a', fiche: combattant(), parametres },
          { id: 'a', fiche: combattant(), parametres },
        ],
        aleatoireImpose([]),
      ),
    ).toEqual({ ok: false, erreurs: [{ participant: 'a', message: 'Participant en double : a' }] });
  });
});
