/**
 * Situation d'une action à cible (docs/regles.md, « Situation du combat ») : paramètre `choix`,
 * `section` et `description`, paramètres de situation communs fusionnés dans chaque action à
 * cible, effets de situation.
 */
import { describe, expect, it } from 'vitest';
import { calculer, type Fiche } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { afficher, aleatoireImpose } from '../formules/index.js';
import { EtatEntite, verifierPresentation, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { executerAction, executerMulticible, vueActeur, type ResultatAction } from './index.js';

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

  it('la vue de l’acteur rappelle la situation déclarée', () => {
    const r = jouer('attaque', { couvert: 'partiel', bonusToucher: 1 }, [10]);
    const vue = vueActeur(s, r);
    expect(vue.explications.slice(0, 2)).toEqual([
      'Couvert de la cible : Partiel (+2 DEF)',
      'Bonus au toucher : 1',
    ]);
    expect(vue.explications).toContain('Couvert de la cible : − 2');
    expect(vueActeur(s, jouer('attaque', {}, [10])).explications[0]).toMatch(/^Jet /);
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

describe('contexte du combat (@combat.*)', () => {
  /** Situation et talent qui lisent le combat ; action qui compte ses propres attaques. */
  const avecCombat: SystemeSaisi = {
    ...avecSituation,
    id: 'mini-combat-contexte',
    catalogue: [
      ...avecSituation.catalogue!,
      {
        id: 'frappe-rapide',
        sorte: 'don',
        nom: 'Frappe rapide',
        effets: [
          {
            sur: 'jet',
            description: 'Frappe rapide',
            si: '@combat.premierRound et non @combat.cible.aAgi',
            ajout: { bonus: '2 * rang' },
          },
        ],
      },
    ],
    situation: {
      parametres: [
        ...avecSituation.situation!.parametres!,
        { id: 'cibleSurprise', nom: 'Cible surprise', type: 'booleen' },
      ],
      effets: [
        ...avecSituation.situation!.effets!,
        {
          sur: 'jet',
          description: 'Cible surprise',
          si: 'cibleSurprise ou @combat.cible.surpris',
          ajout: { bonus: 5 },
        },
      ],
    },
    actions: [
      ...avecSituation.actions!.filter((a) => a.id !== 'test'),
      {
        id: 'abordage',
        nom: 'À l’abordage',
        pour: ['personnage'],
        cible: 'personnage',
        situation: false,
        variables: [
          { cle: 'premiere', formule: '@combat.enCours et @combat.acteur.attaques == 0' },
          { cle: 'rythme', formule: '@combat.round * 10 + @combat.cible.viseRound' },
        ],
        jet: { type: 'numerique', formule: '1d20 + si(premiere, 5, 0)' },
      },
    ],
  };
  const sc = systeme(avecCombat);
  const f = (
    valeurs: Record<string, number>,
    possessions: { entree: string; rang: number }[] = [],
  ) =>
    calculer(
      sc,
      EtatEntite.parse({
        type: 'personnage',
        systeme: { id: 'mini-combat-contexte', version: '1.0.0' },
        creation: false,
        valeurs,
        possessions,
      }),
    );
  const rapide = f({ FOR: 14 }, [{ entree: 'frappe-rapide', rang: 1 }]);
  const gobelin = f({ DEX: 14 });
  const jouerC = (
    action: string,
    combat: Parameters<typeof executerAction>[1]['combat'],
    parametres: Record<string, string | number | boolean> = {},
    des = [10],
  ): ResultatAction => {
    const r = executerAction(sc, {
      action,
      acteur: rapide,
      cible: gobelin,
      parametres,
      aleatoire: aleatoireImpose(des),
      ...(combat ? { combat } : {}),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    return r.resultat;
  };
  const total = (r: ResultatAction) => (r.jet.type === 'numerique' ? r.jet.total : NaN);

  it('valide les références au chargement', () => {
    const avec = (formule: string) =>
      erreurs({
        ...avecCombat,
        actions: [
          {
            id: 'x',
            nom: 'X',
            pour: ['personnage'],
            cible: 'personnage',
            situation: false,
            jet: { type: 'numerique', formule },
          },
        ],
      }).join('\n');
    expect(avec('1d20 + @combat.round')).toBe('');
    expect(avec('1d20 + si(@combat.cible.surpris, 2, 0)')).toBe('');
    expect(avec('1d20 + @combat.tour')).toContain('Attribut inconnu : @combat.tour');
    expect(avec('1d20 + @combat.cible.pv')).toContain('Attribut inconnu : @combat.cible.pv');
    expect(avec('1d20 + si(@combat.round, 1, 0)')).toContain('booleen attendu, nombre obtenu');
    // Hors d'une action (attribut dérivé) : pas de combat
    const e = erreurs({
      ...avecCombat,
      entites: [
        {
          ...avecCombat.entites![0]!,
          attributs: [
            ...avecCombat.entites![0]!.attributs,
            { cle: 'enRage', nom: 'En rage', nature: 'derivee', formule: '@combat.round' },
          ],
        },
      ],
    }).join('\n');
    expect(e).toContain('Attribut inconnu : @combat.round');
  });

  it('hors combat, valeurs neutres', () => {
    const r = jouerC('abordage', undefined);
    expect(r.variables.premiere).toBe(false);
    expect(r.variables.rythme).toBe(0);
    expect(total(jouerC('attaque', undefined))).toBe(13);
  });

  it('lit le round et ce que le combat a compté pour l’acteur et la cible', () => {
    const premiere = jouerC('abordage', {
      round: 2,
      acteur: { attaques: 0 },
      cible: { viseRound: 3 },
    });
    expect(premiere.variables.premiere).toBe(true);
    expect(premiere.variables.rythme).toBe(23);
    expect(total(premiere)).toBe(15);
    const deja = jouerC('abordage', { round: 2, acteur: { attaques: 1 } });
    expect(deja.variables.premiere).toBe(false);
  });

  it('un effet possédé lit le combat : Frappe rapide contre une cible qui n’a pas agi', () => {
    const r = jouerC('attaque', { round: 1, cible: { aAgi: false } });
    expect(r.jet.type === 'numerique' && r.jet.bonus.map((b) => [b.nom, b.valeur])).toEqual([
      ['Frappe rapide', 2],
    ]);
    expect(total(jouerC('attaque', { round: 1, cible: { aAgi: true } }))).toBe(13);
    expect(total(jouerC('attaque', { round: 2, cible: { aAgi: false } }))).toBe(13);
  });

  it('la situation lit le combat : cible surprise par le MJ ou déclarée', () => {
    expect(total(jouerC('attaque', { round: 3, cible: { surpris: true } }))).toBe(18);
    expect(total(jouerC('attaque', undefined, { cibleSurprise: true }))).toBe(18);
    expect(total(jouerC('attaque', { round: 3, cible: { surpris: false } }))).toBe(13);
  });

  it('un contexte par cible dans une action à plusieurs cibles', () => {
    const r = executerMulticible(sc, {
      action: 'attaque',
      acteur: rapide,
      cibles: [
        { id: 'a', fiche: gobelin, combat: { round: 3, cible: { surpris: true } } },
        { id: 'b', fiche: gobelin },
      ],
      combat: { round: 3 },
      aleatoire: aleatoireImpose([10, 10]),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    const totaux = r.cibles.map((c) =>
      c.ok && c.resultat.jet.type === 'numerique' ? c.resultat.jet.total : NaN,
    );
    expect(totaux).toEqual([18, 13]);
  });

  it('refuse un contexte mal formé', () => {
    const r = executerAction(sc, {
      action: 'attaque',
      acteur: rapide,
      cible: gobelin,
      combat: { round: -1, cible: { attaques: 1.5 } } as never,
      aleatoire: aleatoireImpose([10]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0]!.message).toContain('Contexte du combat invalide');
  });

  it('une clé à plusieurs niveaux se relit telle quelle', () => {
    const f = sc.formules.get('actions/abordage/variables/rythme')!;
    expect(afficher(f.noeud)).toBe('(@combat.round * 10) + @combat.cible.viseRound');
  });
});

describe('présentation : icônes de la situation', () => {
  it('seulement pour des paramètres rangés en situation', () => {
    const p = (icones: Record<string, string>) =>
      verifierPresentation(
        { format: 1, systeme: 'mini-situation', combat: { situation: { icones } } },
        s,
      );
    expect(p({ couvert: 'couvert', avantage: 'alerte' }).ok).toBe(true);
    expect(p({ couvert: 'inconnue' }).ok).toBe(false);
    const ko = p({ difficulte: 'etat' });
    expect(ko.ok).toBe(false);
    if (ko.ok) return;
    expect(ko.erreurs.map((e) => e.message).join('\n')).toContain(
      'difficulte n’est pas un paramètre de situation d’une action',
    );
  });
});
