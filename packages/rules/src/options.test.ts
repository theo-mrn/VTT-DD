/**
 * Règles optionnelles de campagne : déclarées par le système (`options`), lues par
 * `option("id")` dans les formules, conditions `option: id` sur les attributs, les champs
 * et les blocs de fiche ; réglées par campagne (`calculer(…, { options })`, `avecOptions`).
 */
import { describe, expect, it } from 'vitest';
import {
  attributsJetables,
  basculerEffet,
  calculer,
  listerEffets,
  type Fiche,
} from './calcul/index.js';
import {
  avecOptions,
  champsActifs,
  charger,
  normaliserOptions,
  optionPermet,
  optionsResolues,
  systemeRacine,
  type SystemeCharge,
} from './chargement/index.js';
import { aleatoireImpose } from './formules/index.js';
import { executerAction } from './jets/index.js';
import { EtatEntite, erreursWidget, type EtatEntiteSaisi } from './schema/index.js';

/** Encombrement : poids des objets, charge et charge maximale, malus au-delà. */
const saisie = () => ({
  format: 1,
  id: 'mini-options',
  version: '1.0.0',
  nom: 'Mini options',
  options: [
    {
      id: 'encombrement',
      nom: 'Encombrement',
      description: 'Poids des objets ; au-delà de la charge maximale, −2 en Défense.',
    },
    { id: 'toujours', nom: 'Toujours', defaut: true },
  ],
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      groupes: [{ id: 'equipement', nom: 'Équipement' }],
      attributs: [
        { cle: 'FOR', nom: 'Force', nature: 'base', defaut: 2 },
        { cle: 'Defense', nom: 'Défense', nature: 'derivee', formule: '10' },
        {
          cle: 'charge',
          nom: 'Charge',
          nature: 'derivee',
          formule: 'somme("objet", "poids")',
          groupe: 'equipement',
          option: 'encombrement',
        },
        {
          cle: 'chargeMax',
          nom: 'Charge maximale',
          nature: 'derivee',
          formule: '@FOR * 5',
          groupe: 'equipement',
          option: 'encombrement',
          jet: { apport: 'valeur' },
        },
        {
          cle: 'surcharge',
          nom: 'Surchargé',
          nature: 'derivee',
          type: 'booleen',
          formule: '@charge > @chargeMax',
          groupe: 'equipement',
          option: 'encombrement',
        },
        { cle: 'bonus', nom: 'Bonus', nature: 'derivee', formule: 'si(option("toujours"), 1, 0)' },
      ],
      effets: [
        {
          sur: 'attribut',
          attribut: 'Defense',
          operation: 'ajouter',
          valeur: -2,
          condition: 'option("encombrement") et @surcharge',
          description: 'Surcharge',
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
      champs: [
        { id: 'prix', nom: 'Prix', type: 'nombre' },
        { id: 'poids', nom: 'Poids (kg)', type: 'nombre', defaut: 0, option: 'encombrement' },
      ],
    },
  ],
  catalogue: [
    { id: 'corde', sorte: 'objet', nom: 'Corde', champs: { poids: 2 } },
    { id: 'enclume', sorte: 'objet', nom: 'Enclume', champs: { poids: 9 } },
  ],
  actions: [
    {
      id: 'parer',
      nom: 'Parer',
      pour: ['personnage'],
      cible: 'personnage',
      jet: { type: 'numerique', formule: '1d20 + @Defense', reussite: 'total >= @cible.Defense' },
    },
  ],
});

const charge = (s: unknown): SystemeCharge => {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
};
const erreurs = (s: unknown) => {
  const r = charger(s);
  return r.ok ? [] : r.erreurs;
};
const systeme = charge(saisie());

const etat = (e: Partial<EtatEntiteSaisi> = {}) =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: 'mini-options', version: '1.0.0' },
    ...e,
  });
/** 2 cordes et une enclume : 13 kg, au-delà de FOR × 5 = 10. */
const charge13 = etat({
  possessions: [
    { entree: 'corde', exemplaire: 'a', quantite: 2 },
    { entree: 'enclume', exemplaire: 'b' },
  ],
});
const defense = (f: Fiche) => f.valeurs.get('Defense')!.valeur;

describe('chargement', () => {
  it('déclare les options, option() se lit dans les formules d’une entité', () => {
    expect([...systeme.options.keys()]).toEqual(['encombrement', 'toujours']);
    expect(systeme.options.get('encombrement')?.defaut).toBe(false);
    expect(systeme.optionsCampagne).toEqual({});
  });

  it('refuse une option non déclarée, dans une formule ou une condition', () => {
    const s = saisie();
    s.entites[0]!.attributs.push({
      cle: 'x',
      nom: 'X',
      nature: 'derivee',
      formule: 'si(option("inconnue"), 1, 0)',
    });
    s.entites[0]!.attributs[0]!.option = 'absente';
    s.sortes[0]!.champs[0]!.option = 'manquante';
    const e = erreurs(s);
    expect(e.map((x) => x.message)).toEqual(
      expect.arrayContaining([
        'Option inconnue : inconnue',
        'Option inconnue : absente',
        'Option inconnue : manquante',
      ]),
    );
  });

  it('option() demande un identifiant littéral, et une entité', () => {
    const s = saisie();
    s.entites[0]!.attributs.push({
      cle: 'x',
      nom: 'X',
      nature: 'derivee',
      formule: 'si(option("en" + "combrement"), 1, 0)',
    });
    expect(erreurs(s).some((x) => x.message.includes('option() attend'))).toBe(true);
    const t = { ...saisie(), tables: [] as unknown[] };
    t.tables = [
      {
        id: 't',
        nom: 'T',
        jet: 'si(option("encombrement"), 1d6, 1d4)',
        lignes: [{ min: 1, max: 6, nom: 'L' }],
      },
    ];
    expect(erreurs(t).some((x) => x.message === 'option() n’est pas permis ici')).toBe(true);
  });

  it('option en double refusée', () => {
    const s = saisie();
    s.options.push({ id: 'encombrement', nom: 'Bis', description: '' });
    expect(erreurs(s).some((x) => x.message === 'Option en double : encombrement')).toBe(true);
  });

  it('bloc de fiche : son option doit être déclarée', () => {
    const w = { type: 'monnaies' as const, titre: 'Bourse' };
    expect(erreursWidget(systeme, 'personnage', { ...w, option: 'encombrement' })).toEqual([]);
    expect(erreursWidget(systeme, 'personnage', { ...w, option: 'nulle' })).toEqual([
      'Option inconnue : nulle',
    ]);
  });
});

describe('calcul', () => {
  it('option éteinte (défaut) : attributs absents, effet sans effet, données gardées', () => {
    const f = calculer(systeme, charge13);
    expect(f.options).toEqual({ encombrement: false, toujours: true });
    expect(f.valeurs.has('charge')).toBe(false);
    expect(f.valeurs.has('chargeMax')).toBe(false);
    expect(f.attributActif('charge')).toBe(false);
    expect(f.attributActif('Defense')).toBe(true);
    expect(defense(f)).toBe(10);
    expect(f.valeurs.get('bonus')!.valeur).toBe(1);
    expect(f.erreurs).toEqual([]);
  });

  it('option allumée : charge (quantités comprises), charge maximale, malus au-delà', () => {
    const f = calculer(systeme, charge13, { options: { encombrement: true } });
    expect(f.options.encombrement).toBe(true);
    expect(f.valeurs.get('charge')!.valeur).toBe(13);
    expect(f.valeurs.get('chargeMax')!.valeur).toBe(10);
    expect(f.valeurs.get('surcharge')!.valeur).toBe(true);
    expect(defense(f)).toBe(8);
    expect(f.valeurs.get('Defense')!.detail).toContainEqual(
      expect.objectContaining({ source: 'regles', nom: 'Surcharge', valeur: -2 }),
    );
    // Sous la charge maximale : pas de malus
    const leger = calculer(systeme, etat({ possessions: [{ entree: 'corde', exemplaire: 'a' }] }), {
      options: { encombrement: true },
    });
    expect(leger.valeurs.get('charge')!.valeur).toBe(2);
    expect(defense(leger)).toBe(10);
  });

  it('une option allumée par défaut s’éteint pour la campagne', () => {
    const f = calculer(systeme, etat(), { options: { toujours: false } });
    expect(f.valeurs.get('bonus')!.valeur).toBe(0);
  });

  it('options inconnues ignorées ; les réglages ne gardent que les écarts', () => {
    expect(normaliserOptions(systeme, { toujours: true, encombrement: true, x: true })).toEqual({
      encombrement: true,
    });
    expect(optionsResolues(systeme, { x: true } as Record<string, boolean>)).toEqual({
      encombrement: false,
      toujours: true,
    });
    expect(calculer(systeme, etat(), { options: { x: true } }).systeme).toBe(systeme);
  });
});

describe('système réglé pour une campagne', () => {
  it('avecOptions : même objet pour les mêmes réglages, le système d’origine sans écart', () => {
    const a = avecOptions(systeme, { encombrement: true });
    expect(avecOptions(systeme, { encombrement: true, toujours: true })).toBe(a);
    expect(avecOptions(a, { encombrement: false })).toBe(systeme);
    expect(avecOptions(systeme, {})).toBe(systeme);
    expect(systemeRacine(a)).toBe(systeme);
    expect(a.optionsCampagne).toEqual({ encombrement: true });
    expect(a.formules).toBe(systeme.formules);
  });

  it('calculer sur un système réglé lit ses réglages ; la fiche garde ce système', () => {
    const a = avecOptions(systeme, { encombrement: true });
    const f = calculer(a, charge13);
    expect(defense(f)).toBe(8);
    expect(f.systeme).toBe(a);
    // Les options explicites remplacent celles du système réglé
    expect(defense(calculer(a, charge13, { options: { encombrement: false } }))).toBe(10);
    // Les options explicites donnent le système réglé correspondant
    expect(calculer(systeme, charge13, { options: { encombrement: true } }).systeme).toBe(a);
  });

  it('une action accepte des fiches réglées différemment du même système', () => {
    const acteur = calculer(systeme, charge13, { options: { encombrement: true } });
    const cible = calculer(systeme, etat());
    const r = executerAction(systeme, {
      action: 'parer',
      acteur,
      cible,
      aleatoire: aleatoireImpose([11]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultat.jet.type === 'numerique' && r.resultat.jet.total).toBe(19);
  });
});

describe('présentation et listes', () => {
  it('champs : celui d’une option éteinte est caché, sa valeur reste', () => {
    const objet = systeme.sortes.get('objet')!;
    expect(champsActifs(objet, optionsResolues(systeme)).map((c) => c.id)).toEqual(['prix']);
    expect(champsActifs(objet, { encombrement: true }).map((c) => c.id)).toEqual(['prix', 'poids']);
    expect(optionPermet({ option: 'encombrement' }, { encombrement: false })).toBe(false);
    expect(optionPermet({}, {})).toBe(true);
  });

  it('lanceur : un attribut d’une option éteinte n’est pas proposé', () => {
    expect(attributsJetables(calculer(systeme, etat())).map((a) => a.cle)).toEqual([]);
    const f = calculer(systeme, etat(), { options: { encombrement: true } });
    expect(attributsJetables(f).map((a) => [a.cle, a.apport])).toEqual([['chargeMax', 10]]);
  });

  it('effets de règle : listés, jamais basculables, « règle désactivée » si l’option est éteinte', () => {
    const eteinte = listerEffets(calculer(systeme, charge13));
    expect(eteinte).toEqual([
      expect.objectContaining({
        cle: 'regles/0',
        genre: 'regle',
        statut: 'inactif',
        raison: 'regle-desactivee',
        basculable: false,
      }),
    ]);
    const allumee = calculer(systeme, charge13, { options: { encombrement: true } });
    expect(listerEffets(allumee)[0]).toMatchObject({ statut: 'actif', valeur: -2 });
    expect(listerEffets(allumee)[0]!.raison).toBeUndefined();
    const r = basculerEffet(allumee, 'regles/0', false);
    expect(r.ok).toBe(false);
  });
});
