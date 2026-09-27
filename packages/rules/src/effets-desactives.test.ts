/**
 * Effets coupés un à un (`etat.effetsDesactives`) : l'objet reste équipé, l'entrée
 * possédée, mais l'effet désigné par sa clé stable (`<source>/<index>`) ne s'applique pas.
 */
import { describe, expect, it } from 'vitest';
import {
  basculerEffet,
  calculer,
  erreursEffetsDesactives,
  listerEffets,
  nettoyerEffetsDesactives,
} from './calcul/index.js';
import { charger, type SystemeCharge } from './chargement/index.js';
import { aleatoireImpose } from './formules/index.js';
import { executerAction } from './jets/index.js';
import {
  cleEffet,
  CleEffet,
  EtatEntite,
  lireCleEffet,
  type EtatEntiteSaisi,
} from './schema/index.js';
import { miniD20, miniSymboles } from './test/mini-systemes.js';

const systeme = (s: unknown): SystemeCharge => {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
};
const d20 = systeme(miniD20);
const sym = systeme(miniSymboles);
const fiche = (s: SystemeCharge, e: Partial<EtatEntiteSaisi> = {}) =>
  calculer(
    s,
    EtatEntite.parse({ type: 'personnage', systeme: { id: s.source.id, version: '1.0.0' }, ...e }),
  );

const plusUn = {
  sur: 'attribut' as const,
  attribut: 'Defense',
  operation: 'ajouter' as const,
  valeur: 1,
  description: 'Armure +1',
};
const cuir = (actif = true) => ({ entree: 'armure-cuir', actif, effets: [plusUn] });

describe('clés d’effet', () => {
  it('source et position, lues dans les deux sens', () => {
    expect(cleEffet('dague#2', 0)).toBe('dague#2/0');
    expect(lireCleEffet('armure-cuir#exemplaire/3')).toEqual({
      source: 'armure-cuir#exemplaire',
      index: 3,
    });
    expect(lireCleEffet('bonus:potion/0')).toEqual({ source: 'bonus:potion', index: 0 });
    for (const faux of ['cuir', 'cuir/', 'cuir/01', 'a/b/0', '#x/0', 'cuir/-1'])
      expect(CleEffet.safeParse(faux).success, faux).toBe(false);
  });
});

describe('effets désactivés', () => {
  it('un effet du catalogue coupé ne compte pas, l’objet reste équipé', () => {
    const f = fiche(d20, { possessions: [cuir()], effetsDesactives: ['armure-cuir/0'] });
    expect(f.valeur('Defense')).toBe(11);
    expect(f.possessions.get('armure-cuir')?.actif).toBe(true);
    // L'explication le liste, marqué désactivé, après les effets appliqués
    expect(f.valeurs.get('Defense')!.detail).toEqual([
      expect.objectContaining({ source: 'formule' }),
      { source: 'armure-cuir#exemplaire', nom: 'Armure +1', operation: 'ajouter', valeur: 1 },
      {
        source: 'armure-cuir',
        nom: 'Armure de cuir',
        operation: 'ajouter',
        valeur: 2,
        desactive: true,
      },
    ]);
  });

  it('un effet propre d’exemplaire coupé ne compte pas, ni ne masque sa famille', () => {
    const f = fiche(d20, {
      possessions: [cuir()],
      effetsDesactives: ['armure-cuir#exemplaire/0'],
    });
    expect(f.valeur('Defense')).toBe(12);
    const d = f.valeurs.get('Defense')!.detail;
    expect(d.find((l) => l.source === 'armure-cuir#exemplaire')?.desactive).toBe(true);
    expect(d.find((l) => l.source === 'armure-cuir')?.ignore).toBeUndefined();
  });

  it('la famille non cumulable se départage sans l’effet coupé', () => {
    const deux = (coupes: string[]) =>
      fiche(d20, {
        possessions: [{ entree: 'armure-cuir' }, { entree: 'cotte' }],
        effetsDesactives: coupes,
      }).valeur('Defense');
    expect(deux([])).toBe(15);
    expect(deux(['cotte/0'])).toBe(12);
  });

  it('coupe aussi les rangs gratuits, les dés de jet et les résistances', () => {
    const base = {
      valeurs: { vigueur: 2, agilite: 2 },
      possessions: [{ entree: 'athletisme', rang: 1 }],
    };
    const pool = (e: Partial<EtatEntiteSaisi>) => {
      const r = executerAction(sym, {
        action: 'test',
        acteur: fiche(sym, { ...base, ...e }),
        parametres: { competence: 'athletisme', difficulte: 0 },
        aleatoire: aleatoireImpose([1, 1, 1, 1]),
      });
      if (!r.ok || r.resultat.jet.type !== 'symboles') throw new Error(JSON.stringify(r));
      return r.resultat.jet.pool.find((p) => p.de === 'aptitude')?.nombre ?? 0;
    };
    const posee = {
      entree: 'athletisme',
      rang: 1,
      effets: [
        {
          sur: 'jet' as const,
          implique: { entree: 'athletisme' },
          ajout: { de: 'aptitude', nombre: 1 },
        },
        { sur: 'rang' as const, entree: 'discretion', valeur: 1 },
      ],
    };
    expect(pool({ possessions: [posee] })).toBe(2);
    expect(pool({ possessions: [posee], effetsDesactives: ['athletisme#exemplaire/0'] })).toBe(1);
    const rangs = (coupes: string[]) =>
      fiche(sym, { possessions: [posee], effetsDesactives: coupes }).possessions.get('discretion')
        ?.rang ?? 0;
    expect(rangs([])).toBe(1);
    expect(rangs(['athletisme#exemplaire/1'])).toBe(0);
  });
});

describe('liste des effets', () => {
  it('tous les effets, actifs, coupés ou d’une source inactive', () => {
    const f = fiche(d20, {
      possessions: [cuir(false), { entree: 'elfe' }],
      effetsDesactives: ['elfe/1'],
      bonus: [
        {
          id: 'potion',
          nom: 'Potion',
          actif: false,
          effets: [{ sur: 'attribut', attribut: 'FOR', operation: 'ajouter', valeur: 2 }],
        },
      ],
    });
    expect(listerEffets(f).map((e) => [e.cle, e.statut, e.raison, e.basculable])).toEqual([
      ['armure-cuir/0', 'inactif', 'inactive', true],
      ['armure-cuir#exemplaire/0', 'inactif', 'inactive', true],
      ['elfe/0', 'actif', undefined, true],
      ['elfe/1', 'desactive', undefined, true],
      ['bonus:potion/0', 'inactif', 'bonus-inactif', false],
    ]);
  });

  it('une entrée à rangs sans rang est non effective', () => {
    const f = fiche(d20, { possessions: [{ entree: 'robustesse', rang: 0 }] });
    expect(listerEffets(f)[0]).toMatchObject({ cle: 'robustesse/0', raison: 'non-effective' });
  });
});

describe('bascule et nettoyage', () => {
  it('bascule idempotente, sans toucher à la source', () => {
    const f = fiche(d20, { possessions: [cuir()] });
    const r = basculerEffet(f, 'armure-cuir/0', false);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.change).toBe(true);
    expect(r.etat.effetsDesactives).toEqual(['armure-cuir/0']);
    expect(r.etat.possessions).toBe(f.etat.possessions);
    const encore = basculerEffet(calculer(d20, r.etat), 'armure-cuir/0', false);
    expect(encore.ok && encore.change).toBe(false);
    const retour = basculerEffet(calculer(d20, r.etat), 'armure-cuir/0', true);
    expect(retour.ok && retour.etat.effetsDesactives).toEqual([]);
  });

  it('refuse un effet inconnu et un effet de bonus libre', () => {
    const f = fiche(d20, {
      possessions: [cuir()],
      bonus: [
        {
          id: 'potion',
          nom: 'Potion',
          effets: [{ sur: 'attribut', attribut: 'FOR', operation: 'ajouter', valeur: 2 }],
        },
      ],
    });
    expect(basculerEffet(f, 'armure-cuir/4', false)).toMatchObject({
      ok: false,
      introuvable: true,
    });
    expect(basculerEffet(f, 'bonus:potion/0', false)).toMatchObject({ ok: false });
  });

  it('oublie les clés dont la source a disparu, refuse doublons et bonus libres', () => {
    const f = fiche(d20, {
      possessions: [cuir()],
      effetsDesactives: ['armure-cuir/0', 'dague#2/0', 'armure-cuir#exemplaire/5'],
    });
    expect(nettoyerEffetsDesactives(f)).toEqual(['armure-cuir/0']);
    const e = EtatEntite.parse({
      type: 'personnage',
      systeme: { id: 'd20', version: '1' },
      effetsDesactives: ['a/0', 'a/0', 'bonus:x/0'],
    });
    expect(erreursEffetsDesactives(e)).toEqual([
      'Effet coupé en double : a/0',
      'bonus:x/0 : un bonus libre s’active ou se désactive en entier (actif)',
    ]);
  });
});
