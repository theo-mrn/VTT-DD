/**
 * Système de bonus : une seule mécanique (les effets) pour trois sources —
 * entrée du catalogue, exemplaire possédé, bonus libre — quel que soit le système.
 */
import { describe, expect, it } from 'vitest';
import { calculer } from './calcul/index.js';
import { charger, compilerEffets, type SystemeCharge } from './chargement/index.js';
import { aleatoireImpose } from './formules/index.js';
import { executerAction } from './jets/index.js';
import { EtatEntite, type EtatEntiteSaisi } from './schema/index.js';
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

describe('bonus libres', () => {
  const potion = {
    id: 'potion',
    nom: 'Potion de force',
    source: 'Inventaire',
    effets: [
      { sur: 'attribut' as const, attribut: 'FOR', operation: 'ajouter' as const, valeur: 2 },
    ],
  };

  it('s’appliquent comme un effet du catalogue et s’expliquent', () => {
    const f = fiche(d20, { bonus: [potion] });
    expect(f.valeur('FOR')).toBe(12);
    expect(f.valeurs.get('FOR')!.detail).toContainEqual({
      source: 'bonus:potion',
      nom: 'Potion de force',
      operation: 'ajouter',
      valeur: 2,
    });
    // Le Contact lit mod(@FOR) : le bonus se propage
    expect(f.valeur('Contact')).toBe(2);
    expect(f.sources.map((s) => [s.id, s.genre])).toContainEqual(['bonus:potion', 'bonus']);
  });

  it('un bonus inactif ne compte pas', () => {
    expect(fiche(d20, { bonus: [{ ...potion, actif: false }] }).valeur('FOR')).toBe(10);
  });

  it('un bonus invalide est ignoré et signalé, sans casser la fiche', () => {
    const f = fiche(d20, {
      bonus: [
        {
          id: 'faux',
          nom: 'Faux',
          effets: [{ sur: 'attribut', attribut: 'SAGESSE', operation: 'ajouter', valeur: 1 }],
        },
      ],
    });
    expect(f.erreurs.map((e) => e.message)).toEqual([
      'Effet invalide, ignoré : Attribut inconnu du porteur : SAGESSE',
    ]);
    expect(f.valeur('FOR')).toBe(10);
  });

  it('ne peut lire qu’un attribut calculé avant sa cible', () => {
    const lit = (cible: string, formule: string) =>
      fiche(d20, {
        valeurs: { DEX: 14 },
        bonus: [
          {
            id: 'b',
            nom: 'B',
            effets: [{ sur: 'attribut', attribut: cible, operation: 'ajouter', valeur: formule }],
          },
        ],
      });
    expect(lit('Defense', 'mod(@DEX)').valeur('Defense')).toBe(14);
    const tardif = lit('DEX', '@Defense');
    expect(tardif.erreurs.map((e) => e.message)).toEqual([
      'Effet ignoré : il lit @Defense, calculé après @DEX',
    ]);
    expect(tardif.valeur('DEX')).toBe(14);
  });

  it('peuvent donner des rangs', () => {
    const f = fiche(sym, {
      bonus: [
        {
          id: 'entrainement',
          nom: 'Entraînement',
          effets: [{ sur: 'rang', entree: 'discretion', valeur: 1 }],
        },
      ],
    });
    expect(f.possessions.get('discretion')?.rang).toBe(1);
  });
});

describe('effets propres à un exemplaire', () => {
  it('l’armure +1 : effets de l’entrée et de l’exemplaire, seulement équipée', () => {
    const cuir = (actif: boolean) =>
      fiche(d20, {
        possessions: [
          {
            entree: 'armure-cuir',
            actif,
            effets: [
              {
                sur: 'attribut',
                attribut: 'Defense',
                operation: 'ajouter',
                valeur: 1,
                description: 'Armure +1',
              },
            ],
          },
        ],
      });
    const portee = cuir(true);
    expect(portee.valeur('Defense')).toBe(13);
    expect(portee.valeurs.get('Defense')!.detail.map((l) => l.source)).toEqual([
      'formule',
      'armure-cuir',
      'armure-cuir#exemplaire',
    ]);
    expect(cuir(false).valeur('Defense')).toBe(10);
  });
});

describe('bonus de jet ciblés par « implique »', () => {
  const test = (bonus: EtatEntiteSaisi['bonus'], competence: string) => {
    const r = executerAction(sym, {
      action: 'test',
      acteur: fiche(sym, {
        valeurs: { vigueur: 2, agilite: 2 },
        possessions: [
          { entree: 'athletisme', rang: 1 },
          { entree: 'discretion', rang: 1 },
        ],
        bonus,
      }),
      parametres: { competence, difficulte: 0 },
      aleatoire: aleatoireImpose([1, 1, 1, 1]),
    });
    if (!r.ok || r.resultat.jet.type !== 'symboles') throw new Error(JSON.stringify(r));
    return r.resultat.jet.pool;
  };
  const plusUnDe = (implique: { entree?: string; attribut?: string }) => [
    {
      id: 'b',
      nom: 'Bonus',
      effets: [{ sur: 'jet' as const, implique, ajout: { de: 'aptitude', nombre: 1 } }],
    },
  ];
  const aptitudes = (pool: { de: string; nombre: number }[]) =>
    pool.find((p) => p.de === 'aptitude')?.nombre ?? 0;

  it('une compétence désignée par le paramètre', () => {
    expect(aptitudes(test(plusUnDe({ entree: 'athletisme' }), 'athletisme'))).toBe(2);
    expect(aptitudes(test(plusUnDe({ entree: 'athletisme' }), 'discretion'))).toBe(1);
  });

  it('une caractéristique liée par un champ de la compétence', () => {
    expect(aptitudes(test(plusUnDe({ attribut: 'vigueur' }), 'athletisme'))).toBe(2);
    expect(aptitudes(test(plusUnDe({ attribut: 'vigueur' }), 'discretion'))).toBe(1);
  });
});

describe('vérification à l’écriture', () => {
  it('compilerEffets refuse ce que refuserait le catalogue', () => {
    const r = compilerEffets(
      sym,
      'personnage',
      [
        { sur: 'jet', implique: { entree: 'inconnue' }, ajout: { de: 'pouvoir', nombre: 1 } },
        { sur: 'attribut', attribut: 'vigueur', operation: 'ajouter', valeur: '1d6' },
      ],
      (i, x) => `bonus/x/effets/${i}/${x}`,
      { rang: 'nombre', actif: 'booleen' },
    );
    expect(r.erreurs.map((e) => `${e.chemin} : ${e.message}`)).toEqual([
      'bonus/x/effets/0/implique : Entrée inconnue : inconnue',
      'bonus/x/effets/0/ajout : Dé inconnu : pouvoir',
      'bonus/x/effets/1/valeur : Les dés ne sont pas permis ici',
    ]);
  });
});
