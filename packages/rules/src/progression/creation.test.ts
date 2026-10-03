import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { aleatoireImpose } from '../formules/index.js';
import { EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import {
  acheterEtape,
  choisirEtape,
  etapesCreation,
  optionsChoix,
  repartirEtape,
  saisirEtape,
  solde,
  terminerCreation,
  tirerEtape,
  type ResultatEtat,
} from './index.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

const etat = (s: SystemeCharge, e: Partial<EtatEntiteSaisi> = {}) =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: s.source.id, version: s.source.version },
    creation: true,
    ...e,
  });

const valide = (r: ResultatEtat): EtatEntite => {
  if (!r.ok) throw new Error(r.erreur);
  return r.etat;
};

const d20Avec = (...etapes: object[]) =>
  systeme({ ...miniD20, creation: [{ entite: 'personnage', etapes }] });

const statuts = (s: SystemeCharge, e: EtatEntite) =>
  etapesCreation(s, e).map((x) => [x.etape.id, x.statut]);

// ─── Système à symboles : espèce, carrière, XP ───────────────────────────────

const sym = systeme({
  ...miniSymboles,
  catalogue: [
    ...(miniSymboles.catalogue ?? []),
    {
      id: 'perception',
      sorte: 'competence',
      nom: 'Perception',
      champs: { caracteristique: 'agilite' },
    },
  ],
  creation: [
    {
      entite: 'personnage',
      etapes: [
        { id: 'carriere', nom: 'Carrière', type: 'choisir', sorte: 'carriere' },
        { id: 'espece', nom: 'Espèce', type: 'choisir', sorte: 'espece' },
        {
          id: 'xp',
          nom: 'Expérience',
          type: 'acheter',
          achats: ['rang-competence', 'caracteristique', 'noeud'],
        },
      ],
    },
  ],
} satisfies SystemeSaisi);

describe('création à symboles', () => {
  it('étapes à faire, puis faites', () => {
    const e0 = etat(sym);
    expect(etapesCreation(sym, e0).map((x) => [x.etape.id, x.statut, x.raisons])).toEqual([
      ['carriere', 'a-faire', ['Carrière à choisir']],
      ['espece', 'a-faire', ['Espèce à choisir']],
      ['xp', 'faite', []],
    ]);
    expect(terminerCreation(sym, e0)).toEqual({
      ok: false,
      erreur: 'Carrière à choisir ; Espèce à choisir',
    });

    const e1 = valide(choisirEtape(sym, e0, 'carriere', [{ entree: 'chasseur' }]));
    const e2 = valide(choisirEtape(sym, e1, 'espece', [{ entree: 'bothan' }]));
    expect(statuts(sym, e2)).toEqual([
      ['carriere', 'faite'],
      ['espece', 'faite'],
      ['xp', 'faite'],
    ]);
    expect(e0.possessions).toEqual([]);

    const fin = valide(terminerCreation(sym, e2));
    expect(fin.creation).toBe(false);
    // Ressource non saisie : fixée à sa valeur initiale (Blessures démarre au minimum)
    expect(fin.valeurs.Blessures).toBe(0);
    expect(terminerCreation(sym, fin)).toEqual({
      ok: false,
      erreur: 'La création est déjà terminée',
    });
    expect(choisirEtape(sym, fin, 'espece', [{ entree: 'humain' }])).toEqual({
      ok: false,
      erreur: 'La création est terminée',
    });
  });

  it('choix d’espèce humain : deux compétences sans la marque de carrière', () => {
    const e1 = valide(choisirEtape(sym, etat(sym), 'carriere', [{ entree: 'chasseur' }]));
    const polyvalence = sym.entrees.get('humain')!.choix[0]!;
    expect(optionsChoix(calculer(sym, e1), polyvalence).map((x) => x.id)).toEqual([
      'discretion',
      'perception',
    ]);

    expect(
      choisirEtape(sym, e1, 'espece', [
        { entree: 'humain', choix: { polyvalence: ['distance', 'discretion'] } },
      ]),
    ).toEqual({
      ok: false,
      erreur: 'Deux compétences hors carrière : Distance (légère) a la marque « carriere »',
    });
    expect(
      choisirEtape(sym, e1, 'espece', [
        { entree: 'humain', choix: { polyvalence: ['discretion', 'discretion'] } },
      ]),
    ).toMatchObject({
      ok: false,
      erreur: 'Deux compétences hors carrière : entrée choisie deux fois',
    });
    expect(
      choisirEtape(sym, e1, 'espece', [{ entree: 'humain', choix: { autre: ['discretion'] } }]),
    ).toEqual({ ok: false, erreur: 'Humain : choix inconnu autre' });

    // Choix partiel : accepté, l'étape reste à faire
    const partiel = valide(
      choisirEtape(sym, e1, 'espece', [
        { entree: 'humain', choix: { polyvalence: ['discretion'] } },
      ]),
    );
    expect(etapesCreation(sym, partiel)[1]).toMatchObject({
      statut: 'a-faire',
      raisons: ['Humain : Deux compétences hors carrière (1/2)'],
    });

    const e2 = valide(
      choisirEtape(sym, partiel, 'espece', [
        { entree: 'humain', choix: { polyvalence: ['discretion', 'perception'] } },
      ]),
    );
    expect(statuts(sym, e2)[1]).toEqual(['espece', 'faite']);
    const f = calculer(sym, e2);
    expect(f.possessions.get('perception')?.rang).toBe(1);
    expect(f.valeur('xpDepart')).toBe(110);
  });

  it('nombre de choix de l’étape et sorte', () => {
    const e = etat(sym);
    expect(choisirEtape(sym, e, 'espece', [])).toEqual({
      ok: false,
      erreur: 'Espèce : 1 choix attendu(s)',
    });
    expect(choisirEtape(sym, e, 'espece', [{ entree: 'chasseur' }])).toEqual({
      ok: false,
      erreur: 'Chasseur de primes n’est pas de la sorte espece',
    });
    expect(choisirEtape(sym, e, 'xp', [])).toEqual({
      ok: false,
      erreur: 'L’étape « Expérience » n’est pas une étape « choisir »',
    });
  });

  it('changer de carrière est refusé si son arbre a des nœuds acquis', () => {
    const e = etat(sym, {
      possessions: [{ entree: 'chasseur' }, { entree: 'bothan' }],
      noeuds: { 'arbre-chasseur': ['a1'] },
    });
    expect(choisirEtape(sym, e, 'carriere', [{ entree: 'chasseur' }]).ok).toBe(true);
    const autre = systeme({
      ...miniSymboles,
      catalogue: [
        ...(miniSymboles.catalogue ?? []),
        { id: 'contrebandier', sorte: 'carriere', nom: 'Contrebandier' },
      ],
      creation: sym.source.creation,
    });
    expect(choisirEtape(autre, e, 'carriere', [{ entree: 'contrebandier' }])).toEqual({
      ok: false,
      erreur: 'Des nœuds de l’arbre « Chasseur » dépendent de chasseur',
    });
  });

  it('étape d’achat : délègue à acheter, invalide si la monnaie est dépassée', () => {
    let e = etat(sym, { possessions: [{ entree: 'chasseur' }, { entree: 'humain' }] });
    for (const [achat, objet] of [
      ['caracteristique', 'vigueur'],
      ['caracteristique', 'agilite'],
      ['caracteristique', 'vigueur'],
      ['rang-competence', 'athletisme'],
      ['rang-competence', 'distance'],
    ] as const) {
      const r = acheterEtape(sym, e, 'xp', { achat, objet });
      if (!r.ok) throw new Error(r.erreur);
      e = r.etat;
    }
    expect(solde(calculer(sym, e), 'xp')).toBe(0);
    expect(acheterEtape(sym, e, 'espece', { achat: 'noeud', objet: 'x' })).toMatchObject({
      ok: false,
      erreur: 'L’étape « Espèce » n’est pas une étape « acheter »',
    });

    // Passer de humain (110 XP) à bothan (100 XP) laisse 10 XP dépensés en trop
    const bothan = valide(choisirEtape(sym, e, 'espece', [{ entree: 'bothan' }]));
    expect(etapesCreation(sym, bothan)[2]).toMatchObject({
      statut: 'invalide',
      raisons: ['Expérience : 10 dépensé(s) en trop'],
    });
    expect(terminerCreation(sym, bothan).ok).toBe(false);
  });

  it('un achat hors de l’étape est refusé', () => {
    const s = systeme({
      ...sym.source,
      creation: [
        {
          entite: 'personnage',
          etapes: [{ id: 'xp', nom: 'XP', type: 'acheter', achats: ['caracteristique'] }],
        },
      ],
    });
    expect(
      acheterEtape(s, etat(s), 'xp', { achat: 'rang-competence', objet: 'athletisme' }),
    ).toEqual({ ok: false, erreur: '« rang-competence » n’est pas proposé à l’étape « XP »' });
  });
});

// ─── d20 : tirage, répartition, saisie ───────────────────────────────────────

describe('tirage 4d6k3', () => {
  const tirage = (attribution: 'ordre' | 'libre') =>
    d20Avec({
      id: 'carac',
      nom: 'Caractéristiques',
      type: 'tirer',
      groupe: 'carac',
      formule: '4d6k3',
      essais: 2,
      contrainte: 'total >= 30',
      attribution,
    });
  // Premier tirage complet : 3, 3, 3 (total 9, refusé) ; second : 18, 15, 11
  const des = [...[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], ...[6, 6, 1, 6, 5, 5, 5, 5, 4, 2, 4, 3]];

  it('recommence tant que la contrainte n’est pas respectée, puis attribue librement', () => {
    const s = tirage('libre');
    const e = etat(s);
    expect(statuts(s, e)).toEqual([['carac', 'a-faire']]);

    const r = tirerEtape(s, e, 'carac', aleatoireImpose(des));
    if (!r.ok) throw new Error(r.erreur);
    expect(r.tirages.map((t) => [t.valeurs, t.total, t.min, t.max, t.valide])).toEqual([
      [[3, 3, 3], 9, 3, 3, false],
      [[18, 15, 11], 44, 11, 18, true],
    ]);
    expect(r.retenu).toBe(r.tirages[1]);
    expect(r.attributs).toEqual(['FOR', 'DEX', 'CON']);
    expect(r.retenu.jets[0]![0]!.des.map((d) => d.garde)).toEqual([true, true, false, true]);

    expect(r.attribuer()).toEqual({
      ok: false,
      erreur: 'Caractéristiques : indiquer quelle valeur va à quel attribut',
    });
    expect(r.attribuer({ FOR: 1, DEX: 1, CON: 2 })).toEqual({
      ok: false,
      erreur: 'DEX : valeur n°1 déjà attribuée',
    });
    const e2 = valide(r.attribuer({ FOR: 1, DEX: 0, CON: 2 }));
    expect(e2.valeurs).toEqual({ FOR: 15, DEX: 18, CON: 11 });
    expect(e.valeurs).toEqual({});
    expect(statuts(s, e2)).toEqual([['carac', 'faite']]);
  });

  it('attribution dans l’ordre', () => {
    const s = tirage('ordre');
    const r = tirerEtape(s, etat(s), 'carac', aleatoireImpose(des));
    if (!r.ok) throw new Error(r.erreur);
    expect(valide(r.attribuer()).valeurs).toEqual({ FOR: 18, DEX: 15, CON: 11 });
  });

  it('échoue quand tous les essais violent la contrainte', () => {
    const s = tirage('ordre');
    const r = tirerEtape(s, etat(s), 'carac', aleatoireImpose(Array(24).fill(1)));
    expect(r).toMatchObject({
      ok: false,
      erreur: 'Caractéristiques : aucun tirage ne respecte « total >= 30 » en 2 essai(s)',
    });
    expect(r.tirages).toHaveLength(2);
  });
});

describe('tirage avec relance automatique', () => {
  // 1d15 + 5 × 3, relancé tant qu'il n'y a pas exactement 2 valeurs paires et
  // une somme des modificateurs (floor((v − 10) / 2)) d'au moins 3
  const s = d20Avec({
    id: 'carac',
    nom: 'Caractéristiques',
    type: 'tirer',
    groupe: 'carac',
    formule: '1d15 + 5',
    contrainte: 'pairs == 2 et impairs == 1 et nombre == 3 et somme_modificateurs >= 3',
    relancer: true,
    attribution: 'ordre',
  });

  it('refait les tirages hors contrainte sans consommer d’essai', () => {
    // 6, 8, 10 : trois paires ; 16, 18, 7 : modificateurs 3 + 4 − 2 = 5
    const r = tirerEtape(s, etat(s), 'carac', aleatoireImpose([1, 3, 5, 11, 13, 2]));
    if (!r.ok) throw new Error(r.erreur);
    expect(r.tirages).toHaveLength(1);
    expect(r.retenu).toMatchObject({ valeurs: [16, 18, 7], relances: 1, valide: true });
    expect(valide(r.attribuer()).valeurs).toEqual({ FOR: 16, DEX: 18, CON: 7 });
  });

  it('les erreurs du générateur remontent (plus de dés imposés)', () => {
    expect(() => tirerEtape(s, etat(s), 'carac', aleatoireImpose([1, 3, 5]))).toThrow(
      'Plus de résultats imposés',
    );
  });
});

describe('répartition par points', () => {
  const points = (budget: string) =>
    d20Avec({
      id: 'points',
      nom: 'Achat par points',
      type: 'repartir',
      groupe: 'carac',
      budget,
      // 8 → 0 … 13 → 5, puis 2 points par niveau : 14 → 7, 15 → 9
      cout: 'si(valeur <= 13, valeur - 8, 2 * valeur - 21)',
      min: '8',
      max: '15',
    });

  it('budget, coût cumulé et bornes', () => {
    const s = points('27');
    const e = etat(s);
    expect(etapesCreation(s, e)[0]).toMatchObject({
      statut: 'a-faire',
      budget: 27,
      depense: 6,
      raisons: ['Achat par points : Force, Dextérité, Constitution à répartir'],
    });

    const e1 = valide(repartirEtape(s, e, 'points', { FOR: 15, DEX: 14, CON: 13 }));
    expect(e1.valeurs).toEqual({ FOR: 15, DEX: 14, CON: 13 });
    expect(etapesCreation(s, e1)[0]).toMatchObject({ statut: 'faite', depense: 21 });

    const e2 = valide(repartirEtape(s, e1, 'points', { DEX: 15, CON: 15 }));
    expect(etapesCreation(s, e2)[0]).toMatchObject({ statut: 'faite', depense: 27 });

    expect(repartirEtape(s, e1, 'points', { FOR: 16 })).toEqual({
      ok: false,
      erreur: 'Force : 16 supérieur au maximum 15',
    });
    expect(repartirEtape(s, e1, 'points', { niveau: 3 })).toEqual({
      ok: false,
      erreur: 'niveau ne se répartit pas à l’étape « Achat par points »',
    });
  });

  it('budget dépassé', () => {
    const s = points('20');
    expect(repartirEtape(s, etat(s), 'points', { FOR: 15, DEX: 15, CON: 12 })).toEqual({
      ok: false,
      erreur: 'Achat par points : 22 points dépensés pour un budget de 20',
    });
  });
});

describe('saisie et choix facultatif', () => {
  const s = d20Avec(
    { id: 'race', nom: 'Race', type: 'choisir', sorte: 'race', min: 0 },
    { id: 'identite', nom: 'Identité', type: 'saisir', attributs: ['nom', 'alignement'] },
  );

  it('choix facultatif et saisie vérifiée', () => {
    const e = etat(s);
    expect(statuts(s, e)).toEqual([
      ['race', 'faite'],
      ['identite', 'a-faire'],
    ]);
    expect(choisirEtape(s, e, 'race', [{ entree: 'elfe' }]).ok).toBe(true);
    expect(saisirEtape(s, e, 'identite', { alignement: 'chaotique' })).toEqual({
      ok: false,
      erreur: 'Alignement : option inconnue « chaotique »',
    });
    expect(saisirEtape(s, e, 'identite', { FOR: 12 })).toEqual({
      ok: false,
      erreur: 'FOR ne se saisit pas à l’étape « Identité »',
    });
    expect(saisirEtape(s, e, 'identite', { nom: 3 })).toEqual({
      ok: false,
      erreur: 'Nom : texte attendu',
    });
    const e1 = valide(saisirEtape(s, e, 'identite', { nom: 'Arwen', alignement: 'bon' }));
    expect(statuts(s, e1)).toEqual([
      ['race', 'faite'],
      ['identite', 'faite'],
    ]);
    const fin = valide(terminerCreation(s, e1));
    // PV non saisis : fixés au maximum
    expect(fin.valeurs).toEqual({ nom: 'Arwen', alignement: 'bon', PV: 8 });
  });

  it('sans création déclarée, aucune étape', () => {
    const d20 = systeme(miniD20);
    expect(etapesCreation(d20, etat(d20))).toEqual([]);
    expect(valide(terminerCreation(d20, etat(d20))).creation).toBe(false);
  });
});
