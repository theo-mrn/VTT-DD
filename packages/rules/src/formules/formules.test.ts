import { describe, expect, it } from 'vitest';
import {
  afficher,
  aleatoireGraine,
  aleatoireImpose,
  analyser,
  compiler,
  evaluer,
  type ContexteEvaluation,
  type EnvironnementTypes,
  type Valeur,
} from './index.js';

const ATTRIBUTS: Record<string, number> = { FOR: 14, DEX: 17, niveau: 3, PV: 12 };

const env: EnvironnementTypes = {
  attribut: (cle, entite) =>
    entite === 'cible'
      ? cle === 'ENC'
        ? { type: 'nombre', modificateur: false }
        : undefined
      : cle in ATTRIBUTS
        ? { type: 'nombre', modificateur: cle !== 'PV' && cle !== 'niveau' }
        : undefined,
  variable: (nom) => ({ rang: 'nombre', carriere: 'booleen', 'arme.nom': 'texte' })[nom] as never,
  entree: (id) => id === 'athletisme',
  des: true,
};

const ctx = (surcharges: Partial<ContexteEvaluation> = {}): ContexteEvaluation => ({
  attribut: (cle, entite) => (entite === 'cible' ? 2 : ATTRIBUTS[cle]!),
  modificateur: (cle) => Math.floor((ATTRIBUTS[cle]! - 10) / 2),
  variable: (nom) =>
    (({ rang: 2, carriere: false, 'arme.nom': 'Blaster' }) as Record<string, Valeur>)[nom]!,
  rang: () => 3,
  possede: () => true,
  ...surcharges,
});

function calculer(texte: string, c = ctx()): Valeur {
  const r = compiler(texte, env);
  if (!r.ok) throw new Error(r.erreurs.map((e) => `${e.message} @${e.position}`).join(', '));
  return evaluer(r.formule.noeud, c).valeur;
}

describe('analyse', () => {
  it.each([
    ['1 + 2 * 3', '1 + (2 * 3)'],
    ['(1 + 2) * 3', '(1 + 2) * 3'],
    ['-@FOR + 1', '-@FOR + 1'],
    ['4d6k3', '4d6k3'],
    ['2d20kl1', '2d20kl1'],
    ['d20 + mod(@DEX)', '1d20 + mod(@DEX)'],
    ['1d6!', '1d6!'],
    ['des(@niveau, 6)', 'des(@niveau, 6)'],
    ['@cible.ENC', '@cible.ENC'],
    ['a et non b ou c', '(a et non b) ou c'],
    ['a && !b || c', '(a et non b) ou c'],
    ['si(carriere, 5, 10)', 'si(carriere, 5, 10)'],
    ['"texte"', '"texte"'],
    ['arme.nom', 'arme.nom'],
    ['@Défense_max', '@Défense_max'],
    ['1.5 * 2', '1.5 * 2'],
  ])('%s', (texte, attendu) => {
    const r = analyser(texte);
    expect(r.ok && afficher(r.noeud)).toBe(attendu);
  });

  it.each([
    ['1 +', 'Formule incomplète', 3],
    ['(1 + 2', '« ) » attendu', 6],
    ['1 $ 2', 'Caractère inattendu « $ »', 2],
    ['@', 'Nom d’attribut attendu après « @ »', 0],
    ['1 < 2 < 3', 'Comparaisons enchaînées : utilisez « et »', 6],
    ['"abc', 'Texte non terminé', 0],
    ['4d6k', 'Nombre de dés à garder attendu après « k »', 3],
    ['3abc', 'Nombre mal formé', 0],
    ['si(1, 2)', 'si(condition, alors, sinon) attend 3 arguments', 0],
  ])('refuse %s', (texte, message, position) => {
    expect(analyser(texte)).toEqual({ ok: false, erreur: { message, position } });
  });

  it('refuse les formules trop profondes ou trop longues', () => {
    expect(analyser('('.repeat(100) + '1' + ')'.repeat(100)).ok).toBe(false);
    expect(analyser('1+'.repeat(1500) + '1').ok).toBe(false);
  });
});

describe('vérification', () => {
  const erreurs = (texte: string, e = env) => {
    const r = compiler(texte, e);
    return r.ok ? [] : r.erreurs.map((x) => x.message);
  };

  it('collecte les dépendances', () => {
    const r = compiler('10 + mod(@DEX) + @cible.ENC + rang("athletisme") + 1d6', env);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.formule.dependances]).toEqual(['DEX']);
    expect([...r.formule.dependancesExternes.get('cible')!]).toEqual(['ENC']);
    expect([...r.formule.entrees]).toEqual(['athletisme']);
    expect(r.formule.aleatoire).toBe(true);
    expect(r.formule.type).toBe('nombre');
  });

  it('signale toutes les erreurs à la fois', () => {
    expect(erreurs('@INCONNU + inconnue + bidule(1) + mod(@PV) + rang("x")')).toEqual([
      'Attribut inconnu : @INCONNU',
      'Variable inconnue : inconnue',
      'Fonction inconnue : bidule()',
      '@PV n’a pas de modificateur',
      'Entrée inconnue : x',
    ]);
  });

  it('contrôle les types', () => {
    expect(erreurs('carriere + 1')).toEqual(['« + » : nombre attendu, booleen obtenu']);
    expect(erreurs('si(1, 2, 3)')).toEqual(['Condition de si() : booleen attendu, nombre obtenu']);
    expect(erreurs('si(carriere, 2, "x")')).toEqual([
      'si() : les deux branches doivent être du même type (nombre / texte)',
    ]);
    expect(erreurs('arme.nom == 3')).toEqual(['Comparaison entre texte et nombre']);
    expect(erreurs('min()')).toEqual(['min() attend au moins 1 argument(s)']);
    expect(erreurs('clamp(1, 2)')).toEqual(['clamp() attend 3 argument(s)']);
    expect(erreurs('mod(3)')).toEqual(['mod() attend un attribut : mod(@DEX)']);
    expect(erreurs('valeur("FOR")')).toEqual(['valeur() n’est pas permis ici']);
  });

  it('interdit les dés hors des jets', () => {
    expect(erreurs('1d6', { ...env, des: false })).toEqual(['Les dés ne sont pas permis ici']);
  });

  it('contrôle le type du résultat', () => {
    const r = compiler('@FOR > 10', env, 'nombre');
    expect(!r.ok && r.erreurs[0]!.message).toBe('Résultat de type nombre attendu, booleen obtenu');
  });

  it('accepte les fonctions du contexte', () => {
    const e = { ...env, fonctions: { compte: { args: ['texte'], retour: 'nombre' } as const } };
    const r = compiler('compte("talent") * 2', e);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(evaluer(r.formule.noeud, ctx({ fonctions: { compte: () => 4 } })).valeur).toBe(8);
  });
});

describe('évaluation', () => {
  it.each<[string, Valeur]>([
    ['1 + 2 * 3', 7],
    ['floor((@FOR - 10) / 2)', 2],
    ['mod(@DEX) + 10', 13],
    ['5 * rang + si(carriere, 0, 5)', 15],
    ['max(1, @niveau, 2)', 3],
    ['clamp(@PV, 0, 10)', 10],
    ['-7 % 3', 2],
    ['@FOR >= 14 et non carriere', true],
    ['arme.nom == "Blaster"', true],
    ['@cible.ENC', 2],
    ['rang("athletisme")', 3],
    ['round(2.5) + ceil(0.1) + abs(-2)', 6],
  ])('%s = %s', (texte, attendu) => {
    expect(calculer(texte)).toBe(attendu);
  });

  it('division par zéro', () => {
    expect(() => calculer('1 / (@FOR - 14)')).toThrow('Division par zéro');
  });

  it('court-circuite « et » / « ou »', () => {
    expect(calculer('faux et 1 / 0 > 1')).toBe(false);
    expect(calculer('vrai ou 1 / 0 > 1')).toBe(true);
  });
});

describe('dés', () => {
  const jet = (texte: string, resultats: number[]) => {
    const r = compiler(texte, env);
    if (!r.ok) throw new Error(r.erreurs[0]!.message);
    return evaluer(r.formule.noeud, ctx({ aleatoire: aleatoireImpose(resultats) }));
  };

  it('additionne et garde la trace', () => {
    const r = jet('2d6 + 3', [4, 5]);
    expect(r.valeur).toBe(12);
    expect(r.jets).toEqual([
      {
        position: 0,
        faces: 6,
        total: 9,
        des: [
          { valeur: 4, garde: true, explosion: false },
          { valeur: 5, garde: true, explosion: false },
        ],
      },
    ]);
  });

  it('garde les meilleurs ou les pires', () => {
    expect(jet('4d6k3', [1, 6, 3, 5]).valeur).toBe(14);
    expect(jet('2d20kl1', [15, 4]).valeur).toBe(4);
    expect(jet('4d6k3', [1, 6, 3, 5]).jets[0]!.des.map((d) => d.garde)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('fait exploser les dés', () => {
    const r = jet('1d6!', [6, 6, 2]);
    expect(r.valeur).toBe(14);
    expect(r.jets[0]!.des.map((d) => d.explosion)).toEqual([false, true, true]);
  });

  it('nombre de dés variable', () => {
    expect(jet('des(@niveau, 4)', [1, 2, 3]).valeur).toBe(6);
    expect(jet('des(0, 6)', []).valeur).toBe(0);
  });

  it('borne les jets', () => {
    expect(() => jet('des(1000, 6)', [])).toThrow('Nombre de dés invalide');
    expect(() => jet('des(-1, 6)', [])).toThrow('Nombre de dés invalide');
    expect(() => jet('des(1, @niveau - 3)', [])).toThrow('Nombre de faces invalide');
    expect(compiler('1d0', env).ok).toBe(false);
  });

  it('exige un générateur', () => {
    const r = compiler('1d6', env);
    expect(() => r.ok && evaluer(r.formule.noeud, ctx())).toThrow('Aucun générateur de dés fourni');
  });

  it('est reproductible avec une graine', () => {
    const tirer = (graine: string) => {
      const g = aleatoireGraine(graine);
      return Array.from({ length: 20 }, () => g.entier(20));
    };
    expect(tirer('partie-42')).toEqual(tirer('partie-42'));
    expect(tirer('partie-42')).not.toEqual(tirer('partie-43'));
  });

  it('reste uniforme', () => {
    const g = aleatoireGraine(1);
    const compte = new Array<number>(7).fill(0);
    for (let i = 0; i < 60_000; i++) compte[g.entier(6)]!++;
    for (let f = 1; f <= 6; f++) expect(Math.abs(compte[f]! - 10_000)).toBeLessThan(400);
  });
});
