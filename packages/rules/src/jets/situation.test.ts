/**
 * Situation d'une action à cible (docs/regles.md, « Situation du combat ») : paramètre `choix`,
 * `section` et `description`, paramètres de situation communs fusionnés dans chaque action à
 * cible, effets de situation.
 */
import { describe, expect, it } from 'vitest';
import { calculer, type Fiche } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { aleatoireImpose } from '../formules/index.js';
import { EtatEntite, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { executerAction, type ResultatAction } from './index.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

function erreurs(s: unknown): string[] {
  const r = charger(s);
  return r.ok ? [] : r.erreurs.map((e) => `${e.chemin} : ${e.message}`);
}

const attaque = miniD20.actions![0]!;

/** Mini d20 avec une situation commune : avantage, couvert, bonus au toucher. */
const avecSituation: SystemeSaisi = {
  ...miniD20,
  id: 'mini-situation',
  situation: {
    parametres: [
      {
        id: 'avantage',
        nom: 'Avantage',
        description: 'Deux d20, le meilleur ou le pire',
        type: 'choix',
        options: [
          { valeur: 'normal', nom: 'Normal' },
          { valeur: 'avantage', nom: 'Avantage' },
          { valeur: 'desavantage', nom: 'Désavantage' },
        ],
        defaut: 'normal',
      },
      {
        id: 'couvert',
        nom: 'Couvert de la cible',
        type: 'choix',
        options: [
          { valeur: 'aucun', nom: 'Aucun' },
          { valeur: 'partiel', nom: 'Partiel (+2 DEF)' },
          { valeur: 'important', nom: 'Important (+5 DEF)' },
        ],
      },
      { id: 'bonusToucher', nom: 'Bonus au toucher', type: 'nombre' },
    ],
    effets: [
      {
        sur: 'jet',
        description: 'Couvert de la cible',
        ajout: { bonus: 'si(couvert == "partiel", -2, si(couvert == "important", -5, 0))' },
      },
      { sur: 'jet', description: 'Bonus de situation', ajout: { bonus: 'bonusToucher' } },
      {
        sur: 'jet',
        description: 'Avantage de situation',
        ajout: {
          variable: 'avantages',
          ajouter: 'si(avantage == "avantage", 1, si(avantage == "desavantage", -1, 0))',
        },
      },
    ],
  },
  actions: [
    {
      ...attaque,
      variables: [{ cle: 'avantages', formule: 0 }],
      jet: {
        type: 'numerique',
        formule: 'si(avantages > 0, 2d20k1, si(avantages < 0, 2d20kl1, 1d20)) + @Contact',
        reussite: 'total >= @cible.Defense',
        critique: 'naturel == 20',
      },
    },
    {
      id: 'soins',
      nom: 'Soins',
      pour: ['personnage'],
      cible: 'personnage',
      situation: false,
      jet: { type: 'numerique', formule: '1d8' },
    },
    {
      id: 'poussee',
      nom: 'Poussée',
      pour: ['personnage'],
      cible: 'personnage',
      situation: { sauf: ['avantage'] },
      parametres: [
        {
          id: 'avantage',
          nom: 'Avantage (propre)',
          type: 'booleen',
          section: 'situation',
        },
      ],
      jet: { type: 'numerique', formule: '1d20 + si(avantage, 5, 0)' },
    },
    {
      id: 'test',
      nom: 'Test',
      pour: ['personnage'],
      parametres: [{ id: 'difficulte', nom: 'Difficulté', type: 'nombre', defaut: 10 }],
      jet: { type: 'numerique', formule: '1d20', reussite: 'total >= difficulte' },
    },
  ],
};

const s = systeme(avecSituation);

function fiche(valeurs: Record<string, number> = {}): Fiche {
  const etat = EtatEntite.parse({
    type: 'personnage',
    systeme: { id: 'mini-situation', version: '1.0.0' },
    creation: false,
    valeurs,
  });
  return calculer(s, etat);
}

const heros = fiche({ FOR: 14 }); // Contact 3
const cible = fiche({ DEX: 14 }); // Défense 12

function jouer(
  action: string,
  parametres: Record<string, string | number | boolean>,
  des: number[],
): ResultatAction {
  const r = executerAction(s, {
    action,
    acteur: heros,
    cible,
    parametres,
    aleatoire: aleatoireImpose(des),
  });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.resultat;
}

describe('paramètre choix', () => {
  it('prend son défaut, sinon sa première option', () => {
    const r = jouer('attaque', {}, [10]);
    expect(r.parametres.avantage).toBe('normal');
    expect(r.parametres.couvert).toBe('aucun');
  });

  it('refuse une valeur hors des options', () => {
    const r = executerAction(s, {
      action: 'attaque',
      acteur: heros,
      cible,
      parametres: { couvert: 'total' },
      aleatoire: aleatoireImpose([10]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0]!.message).toContain('option attendue (aucun, partiel');
  });

  it('refuse au chargement un texte comparé qui n’est pas une option', () => {
    const faute = {
      ...avecSituation,
      situation: {
        ...avecSituation.situation!,
        effets: [{ sur: 'jet', ajout: { bonus: 'si(couvert == "partiell", -2, 0)' } }],
      },
    };
    expect(erreurs(faute).join('\n')).toContain('« partiell » n’est pas une option de couvert');
  });

  it('refuse un défaut hors des options et une option en double', () => {
    const e = erreurs({
      ...miniD20,
      actions: [
        {
          ...attaque,
          parametres: [
            {
              id: 'posture',
              nom: 'Posture',
              type: 'choix',
              options: [
                { valeur: 'a', nom: 'A' },
                { valeur: 'a', nom: 'A bis' },
              ],
              defaut: 'b',
            },
          ],
        },
      ],
    }).join('\n');
    expect(e).toContain('Option en double : a');
    expect(e).toContain('Option par défaut inconnue : b');
  });
});

describe('situation commune', () => {
  it('rejoint les paramètres de chaque action à cible, rangée en section situation', () => {
    const ids = (a: string) => s.actions.get(a)!.parametres.map((p) => `${p.id}:${p.section}`);
    expect(ids('attaque')).toEqual([
      'avantage:situation',
      'couvert:situation',
      'bonusToucher:situation',
    ]);
    // Action sans cible : rien ; action qui s'en exclut : rien ; exclusion partielle
    expect(ids('test')).toEqual(['difficulte:preparation']);
    expect(ids('soins')).toEqual([]);
    expect(ids('poussee')).toEqual([
      'avantage:situation',
      'couvert:situation',
      'bonusToucher:situation',
    ]);
    expect(s.actions.get('poussee')!.parametres[0]!.type).toBe('booleen');
    expect(s.actions.get('attaque')!.parametres[0]!.description).toBe(
      'Deux d20, le meilleur ou le pire',
    );
    // Le document source n'est pas touché : recharger donne le même résultat
    expect(s.source.actions.find((a) => a.id === 'attaque')!.parametres).toEqual([]);
  });

  it('refuse un paramètre déclaré à la fois par l’action et par la situation', () => {
    const e = erreurs({
      ...avecSituation,
      actions: [
        {
          ...attaque,
          parametres: [{ id: 'couvert', nom: 'Couvert', type: 'nombre' }],
        },
      ],
    });
    expect(e.join('\n')).toContain(
      'actions/attaque/parametres/couvert : Paramètre déjà déclaré par la situation',
    );
  });

  it('refuse une exclusion inconnue et un effet de situation côté cible', () => {
    const e = erreurs({
      ...avecSituation,
      situation: {
        ...avecSituation.situation!,
        effets: [{ sur: 'jet', cote: 'cible', ajout: { bonus: 1 } }],
      },
      actions: [{ ...attaque, situation: { sauf: ['inconnu'] } }],
    }).join('\n');
    expect(e).toContain('actions/attaque/situation : Paramètre de situation inconnu : inconnu');
    expect(e).toContain('situation/effets/0/cote');
  });

  it('ses effets s’appliquent à l’action, avec la valeur de ses paramètres', () => {
    // 10 + Contact 3 = 13 ≥ 12 : touche ; couvert partiel (−2) : 11, raté
    expect(jouer('attaque', {}, [10]).reussi).toBe(true);
    const couvert = jouer('attaque', { couvert: 'partiel' }, [10]);
    expect(couvert.reussi).toBe(false);
    expect(couvert.jet.type === 'numerique' && couvert.jet.bonus).toEqual([
      { source: 'situation', nom: 'Couvert de la cible', valeur: -2, cote: 'action' },
    ]);
    expect(couvert.explications).toContain('Couvert de la cible : Partiel (+2 DEF)');
    // Bonus au toucher : compense le couvert
    expect(jouer('attaque', { couvert: 'partiel', bonusToucher: 2 }, [10]).reussi).toBe(true);
  });

  it('un effet de situation sur une variable de l’action : avantage de situation', () => {
    const r = jouer('attaque', { avantage: 'avantage' }, [4, 15]);
    expect(r.variables.avantages).toBe(1);
    expect(r.jet.type === 'numerique' && r.jet.naturel).toBe(15);
    expect(r.explications).toContain('Avantage de situation : + 1 → avantages');
    const d = jouer('attaque', { avantage: 'desavantage' }, [4, 15]);
    expect(d.jet.type === 'numerique' && d.jet.naturel).toBe(4);
  });

  it('une situation sans rien de particulier ne dit rien', () => {
    const r = jouer('attaque', {}, [10]);
    expect(r.jet.type === 'numerique' && r.jet.bonus).toEqual([]);
    expect(r.explications.some((l) => l.startsWith('Couvert'))).toBe(false);
    expect(r.explications.some((l) => l.startsWith('Avantage'))).toBe(false);
  });

  it('une action qui s’en exclut n’en reçoit ni les paramètres ni les effets', () => {
    const soins = executerAction(s, {
      action: 'soins',
      acteur: heros,
      cible,
      parametres: { couvert: 'partiel' },
      aleatoire: aleatoireImpose([5]),
    });
    expect(soins.ok).toBe(false);
    // Exclusion partielle : son propre `avantage`, les effets lisent le reste
    const p = jouer('poussee', { avantage: true, couvert: 'important' }, [10]);
    expect(p.jet.type === 'numerique' && p.jet.total).toBe(10);
    expect(p.jet.type === 'numerique' && p.jet.valeur).toBe(15);
  });
});
