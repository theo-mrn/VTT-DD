/**
 * Formules des objets : formule de jet d'une arme (`des`), remplacée par la formule propre
 * d'un exemplaire (« 1d6-CON+8 »), exemplaire visé par une action, critique qui multiplie
 * les dés seulement, aperçu lisible. Et dossiers / objets cachés de l'état.
 */
import { describe, expect, it } from 'vitest';
import { apercuFormule, calculer, type Fiche } from './calcul/index.js';
import {
  charger,
  compilerFormuleChamp,
  formuleChamp,
  normaliserFormule,
  verifierChampsExemplaire,
  type SystemeCharge,
} from './chargement/index.js';
import { aleatoireImpose, compiler } from './formules/index.js';
import { executerAction, type ResultatAction } from './jets/index.js';
import {
  EtatEntite,
  nouvellePossession,
  verifierPresentation,
  type EtatEntiteSaisi,
  type SystemeSaisi,
} from './schema/index.js';

const source: SystemeSaisi = {
  format: 1,
  id: 'mini-formules-objets',
  version: '1.0.0',
  nom: 'Mini formules d’objets',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      attributs: [
        { cle: 'CON', nom: 'Constitution', nature: 'base', defaut: 2 },
        { cle: 'FOR', nom: 'Force', nature: 'base', defaut: 3, abrege: 'For' },
        { cle: 'PV', nom: 'Points de vie', nature: 'ressource', max: '20' },
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
      nomExemplaire: 'nom',
      champs: [
        { id: 'nbDes', nom: 'Dés', type: 'nombre', defaut: 1 },
        { id: 'faces', nom: 'Faces', type: 'nombre', defaut: 4 },
        {
          id: 'degats',
          nom: 'Dégâts',
          type: 'formule',
          des: true,
          defaut: 'des(source.nbDes, source.faces)',
        },
        { id: 'bonus', nom: 'Bonus', type: 'formule', defaut: '0' },
        {
          id: 'categorie',
          nom: 'Catégorie',
          type: 'choix',
          options: [
            { valeur: 'contact', nom: 'Contact' },
            { valeur: 'distance', nom: 'Distance' },
          ],
        },
        { id: 'nom', nom: 'Nom propre', type: 'texte' },
      ],
    },
  ],
  catalogue: [
    { id: 'epee', sorte: 'arme', nom: 'Épée', champs: { nbDes: 1, faces: 8, bonus: '@FOR' } },
  ],
  actions: [
    {
      id: 'attaque',
      nom: 'Attaque',
      pour: ['personnage'],
      parametres: [{ id: 'arme', nom: 'Arme', type: 'entree', sorte: 'arme', possedee: true }],
      jet: { type: 'numerique', formule: '1d20', critique: 'naturel >= 20' },
      apres: [
        {
          cle: 'degats',
          formule: 'multiplier_des(si(critique, 2, 1), arme.degats) + arme.bonus',
        },
        { cle: 'maximum', formule: 'maximum_des(arme.degats)' },
      ],
    },
  ],
};

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}
const sys = systeme(source);
const fiche = (e: Partial<EtatEntiteSaisi> = {}): Fiche =>
  calculer(
    sys,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: sys.source.id, version: '1.0.0' },
      ...e,
    }),
  );
const arme = sys.sortes.get('arme')!;
const champ = (id: string) => arme.champs.find((c) => c.id === id)!;
const epee = sys.entrees.get('epee')!;

/** Épée du catalogue, et un second exemplaire à la formule propre. */
const deuxEpees = {
  possessions: [
    nouvellePossession('epee'),
    nouvellePossession('epee', 0, { exemplaire: '2', champs: { degats: '1d6 - @CON + 8' } }),
  ],
};

function attaque(f: Fiche, arme: string, des: number[]): ResultatAction {
  const r = executerAction(sys, {
    action: 'attaque',
    acteur: f,
    parametres: { arme },
    aleatoire: aleatoireImpose(des),
  });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.resultat;
}

const variable = (r: ResultatAction, cle: string) =>
  r.explications.find((l) => l.startsWith(`${cle} = `));

describe('écriture simple d’une formule', () => {
  it('un nom nu d’attribut devient une lecture d’attribut', () => {
    const attributs = [sys.entites.get('personnage')!.attributs];
    expect(normaliserFormule('1d6-CON+8', attributs)).toBe('1d6-@CON+8');
    // Abréviation sans casse, fonction et variable de la formule respectées
    expect(
      normaliserFormule('mod(for) + source.nbDes', attributs, { 'source.nbDes': 'nombre' }),
    ).toBe('mod(@FOR) + source.nbDes');
    expect(normaliserFormule('  2d6 + @CON ', attributs)).toBe('2d6 + @CON');
  });

  it('compile la formule propre avec les champs de l’objet et les dés d’un champ de jet', () => {
    const r = compilerFormuleChamp(sys, arme, champ('degats'), '2d6 + FOR + source.nbDes');
    expect(r.ok && r.texte).toBe('2d6 + @FOR + source.nbDes');
    // Pas de dés dans un champ qui n'est pas une formule de jet
    const bonus = compilerFormuleChamp(sys, arme, champ('bonus'), '1d4');
    expect(bonus.ok).toBe(false);
    // Une formule ne lit pas un autre champ formule
    expect(compilerFormuleChamp(sys, arme, champ('degats'), 'source.bonus').ok).toBe(false);
  });
});

describe('valeurs propres d’un exemplaire', () => {
  it('vérifie le type de chaque champ et normalise les formules', () => {
    const r = verifierChampsExemplaire(sys, epee, {
      degats: '1d6-CON+8',
      nbDes: 2,
      categorie: 'distance',
      nom: 'Lame du nord',
    });
    expect(r.erreurs).toEqual([]);
    expect(r.champs).toEqual({
      degats: '1d6-@CON+8',
      nbDes: 2,
      categorie: 'distance',
      nom: 'Lame du nord',
    });
  });

  it('refuse une formule invalide, trop longue, un champ inconnu ou une option inconnue', () => {
    const r = verifierChampsExemplaire(sys, epee, {
      degats: '1d6 + @SAG',
      bonus: `1${' + 1'.repeat(200)}`,
      nbDes: 'deux',
      categorie: 'magie',
      inconnu: 1,
    });
    expect(r.erreurs).toHaveLength(5);
    expect(r.erreurs.join(' ; ')).toMatch(/Attribut inconnu : @SAG/);
    expect(r.erreurs.join(' ; ')).toMatch(/500 caractères au plus/);
  });
});

describe('formule de jet d’une arme', () => {
  it('défaut de la sorte, formule du catalogue, formule propre de l’exemplaire', () => {
    const f = fiche(deuxEpees);
    const [premier, second] = f.possessions.get('epee')!.exemplaires;
    expect(formuleChamp(sys, epee, champ('degats'), premier)?.texte).toBe(
      'des(source.nbDes, source.faces)',
    );
    expect(formuleChamp(sys, epee, champ('degats'), second)?.texte).toBe('1d6 - @CON + 8');
  });

  it('l’action tire les dés de l’exemplaire choisi, formule propre comprise', () => {
    const f = fiche(deuxEpees);
    // Premier exemplaire : 1d8 du catalogue + FOR 3
    const r1 = attaque(f, 'epee', [10, 5]);
    expect(variable(r1, 'degats')).toMatch(/^degats = 8 /);
    // Second : 1d6 − CON 2 + 8, + FOR 3
    const r2 = attaque(f, 'epee#2', [10, 4]);
    expect(variable(r2, 'degats')).toMatch(/^degats = 13 /);
    expect(variable(r2, 'maximum')).toMatch(/^maximum = 12 /);
  });

  it('le critique multiplie les dés de la formule, pas ses constantes', () => {
    const r = attaque(fiche(deuxEpees), 'epee#2', [20, 3, 5]);
    // (3 + 5) − 2 + 8 + FOR 3
    expect(variable(r, 'degats')).toMatch(/^degats = 17 \[/);
  });

  it('refuse un exemplaire inconnu', () => {
    const r = executerAction(sys, {
      action: 'attaque',
      acteur: fiche(deuxEpees),
      parametres: { arme: 'epee#9' },
      aleatoire: aleatoireImpose([10]),
    });
    expect(r.ok).toBe(false);
  });

  it('aperçu lisible : attributs et champs calculés, dés écrits', () => {
    const f = fiche(deuxEpees);
    const [premier, second] = f.possessions.get('epee')!.exemplaires;
    const vars = (ex: typeof premier) => (nom: string) =>
      nom === 'source.nbDes'
        ? Number(ex?.champs.nbDes ?? 1)
        : nom === 'source.faces'
          ? 8
          : undefined;
    expect(apercuFormule(f, formuleChamp(sys, epee, champ('degats'), second)!, vars(second))).toBe(
      '1d6 − 2 + 8',
    );
    expect(
      apercuFormule(f, formuleChamp(sys, epee, champ('degats'), premier)!, vars(premier)),
    ).toBe('1d8');
    const f2 = compiler('2d6 + @CON * 2 - 5', {
      attribut: () => ({ type: 'nombre', modificateur: false }),
      variable: () => undefined,
      des: true,
    });
    if (!f2.ok) throw new Error('formule');
    expect(apercuFormule(f, f2.formule)).toBe('2d6 + 4 − 5');
  });
});

describe('dossiers et objets cachés', () => {
  it('l’état porte les dossiers, le dossier et le masquage d’un exemplaire', () => {
    const e = EtatEntite.parse({
      type: 'personnage',
      systeme: { id: sys.source.id, version: '1.0.0' },
      folders: [{ id: 'sac', name: 'Sac à dos' }],
      possessions: [{ entree: 'epee', folder: 'sac', hidden: true }],
    });
    expect(e.folders).toEqual([{ id: 'sac', name: 'Sac à dos' }]);
    expect(e.possessions[0]).toMatchObject({ folder: 'sac', hidden: true });
    expect(EtatEntite.parse({ ...e, folders: undefined }).folders).toEqual([]);
  });
});

describe('icônes des objets de la présentation', () => {
  const presentation = (iconesObjets: unknown[]) =>
    verifierPresentation({ format: 1, systeme: sys.source.id, iconesObjets }, sys);

  it('accepte une sorte, ou la valeur possible d’un champ', () => {
    const r = presentation([
      { champ: 'categorie', valeur: 'distance', icone: 'cible' },
      { sorte: 'arme', icone: 'epee' },
    ]);
    expect(r.ok && r.presentation.iconesObjets).toHaveLength(2);
  });

  it('refuse une sorte, un champ, une valeur ou une icône inconnus', () => {
    for (const regle of [
      { sorte: 'potion', icone: 'fiole' },
      { champ: 'couleur', valeur: 'rouge', icone: 'fiole' },
      { champ: 'categorie', valeur: 'magie', icone: 'baguette' },
      { sorte: 'arme', icone: 'licorne' },
      { champ: 'categorie', icone: 'cible' },
    ])
      expect(presentation([regle]).ok, JSON.stringify(regle)).toBe(false);
  });
});
