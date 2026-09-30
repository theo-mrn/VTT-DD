/**
 * Paramètres choisis après le jet (`etape: apres`) : l'arme d'une attaque, une fois la cible
 * touchée. Chargement (le jet ne les lit pas), exécution par étapes, déterminisme.
 */
import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { aleatoireImpose } from '../formules/index.js';
import { EtatEntite, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { aleatoirePlanifie, executerMulticible, ParametresRequis } from './index.js';
import { executer } from './actions.js';

const armes: SystemeSaisi = {
  ...miniD20,
  id: 'mini-armes',
  sortes: [
    ...miniD20.sortes!,
    {
      id: 'arme',
      nom: 'Arme',
      pour: ['personnage'],
      champs: [
        { id: 'faces', nom: 'Faces', type: 'nombre', defaut: 4 },
        { id: 'critique', nom: 'Critique', type: 'nombre', defaut: 20 },
        { id: 'hache', nom: 'Hache', type: 'booleen', defaut: false },
      ],
    },
  ],
  catalogue: [
    ...miniD20.catalogue!,
    { id: 'epee', sorte: 'arme', nom: 'Épée', champs: { faces: 8, critique: 19 } },
    { id: 'hachette', sorte: 'arme', nom: 'Hachette', champs: { faces: 6, hache: true } },
    {
      id: 'nain',
      sorte: 'don',
      nom: 'Nain',
      effets: [
        // Au toucher, l'arme n'est pas encore connue : sans effet ; aux DM, oui
        { sur: 'jet', si: 'arme.hache', ajout: { bonus: 5 } },
        { sur: 'jet', si: 'arme.hache', ajout: { variable: 'bonusDM', ajouter: 1 } },
      ],
    },
  ],
  actions: [
    {
      id: 'attaque',
      nom: 'Attaque',
      pour: ['personnage'],
      cible: 'personnage',
      parametres: [{ id: 'arme', nom: 'Arme', type: 'entree', sorte: 'arme', etape: 'apres' }],
      variables: [{ cle: 'bonusDM', formule: 0 }],
      jet: {
        type: 'numerique',
        formule: '1d20 + @Contact',
        reussite: 'naturel == 20 ou total >= @cible.Defense',
        critique: 'naturel == 20',
        confirmerCritique: 'naturel >= arme.critique',
      },
      apres: [
        {
          cle: 'degats',
          nom: 'Dégâts',
          visibilite: 'acteur',
          formule: 'si(reussi, des(si(critique, 2, 1), arme.faces) + bonusDM, 0)',
        },
      ],
      consequences: [{ entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 'degats' }],
    },
  ],
};

function systeme(x: unknown): SystemeCharge {
  const r = charger(x);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}
const s = systeme(armes);
const fiche = (dons: string[] = []) =>
  calculer(
    s,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: 'mini-armes', version: '1.0.0' },
      creation: false,
      possessions: [
        { entree: 'epee', rang: 0 },
        { entree: 'hachette', rang: 0 },
        ...dons.map((entree) => ({ entree, rang: 1 })),
      ],
    }),
  );
const heros = fiche(['nain']);
const gobelin = fiche(); // Défense 10

/** Exécution d'une cible avec des dés planifiés. */
const multicible = (faces: Record<string, number>, parametres?: Record<string, string>) =>
  executerMulticible(s, {
    action: 'attaque',
    acteur: heros,
    cibles: [{ id: 'g', fiche: gobelin }],
    ...(parametres ? { parametres } : {}),
    aleatoire: aleatoirePlanifie({ faces, commun: false }),
  });

describe('paramètres choisis après le jet', () => {
  it('chargement : le jet ne peut pas lire un paramètre choisi après lui', () => {
    const r = charger({
      ...armes,
      actions: [
        {
          ...armes.actions![0]!,
          variables: [{ cle: 'bonus', formule: 'arme.faces' }],
          jet: { type: 'numerique', formule: '1d20 + bonus' },
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.map((e) => e.message).join()).toContain('choisi après le jet');
  });

  it('touché : l’arme est demandée après le jet, puis ses dégâts', () => {
    const etape1 = multicible({ '0:jet:d20:0': 12 });
    expect(etape1.ok && etape1.parametres).toEqual(['arme']);
    expect(etape1.ok && etape1.enAttente[0]?.partiel?.reussi).toBe(true);
    expect(etape1.ok && etape1.requis).toEqual([]);

    // L'arme choisie : ses dés sont demandés, le jet est inchangé
    const etape2 = multicible({ '0:jet:d20:0': 12 }, { arme: 'hachette' });
    expect(etape2.ok && etape2.requis.map((d) => [d.id, d.faces])).toEqual([['0:apres:d6:0', 6]]);
    const fin = multicible({ '0:jet:d20:0': 12, '0:apres:d6:0': 4 }, { arme: 'hachette' });
    if (!fin.ok || !fin.cibles[0]?.ok) throw new Error('non résolue');
    const r = fin.cibles[0].resultat;
    // Nain : +5 au toucher ignoré (l'arme est inconnue au jet), +1 DM avec la hache
    expect(r.jet.type === 'numerique' && r.jet.total).toBe(13);
    expect(r.variables.degats).toBe(5);
    expect(r.parametres.arme).toBe('hachette');
    // Mêmes faces, mêmes paramètres : même résultat
    const encore = multicible({ '0:jet:d20:0': 12, '0:apres:d6:0': 4 }, { arme: 'hachette' });
    expect(encore).toEqual(fin);
  });

  it('raté : aucune arme demandée, pas d’étape des dégâts', () => {
    const r = multicible({ '0:jet:d20:0': 2 });
    if (!r.ok) throw new Error('refus');
    expect(r.parametres).toEqual([]);
    expect(r.enAttente).toEqual([]);
    expect(r.cibles[0]?.ok && r.cibles[0].resultat.reussi).toBe(false);
  });

  it('critique confirmé avec le seuil de l’arme, une fois l’arme connue', () => {
    const jet = { '0:jet:d20:0': 19 };
    const avant = multicible(jet);
    expect(avant.ok && avant.enAttente[0]?.partiel?.jet).toMatchObject({ critique: false });
    const fin = multicible({ ...jet, '0:apres:d8:0': 3, '0:apres:d8:1': 5 }, { arme: 'epee' });
    if (!fin.ok || !fin.cibles[0]?.ok) throw new Error('non résolue');
    expect(fin.cibles[0].resultat.jet).toMatchObject({ critique: true });
    expect(fin.cibles[0].resultat.variables.degats).toBe(8);
  });

  it('exécution seule : ParametresRequis sur une réussite, l’arme fournie d’avance sinon', () => {
    const acteur = heros;
    expect(() =>
      executer(s, { action: 'attaque', acteur, cible: gobelin, aleatoire: aleatoireImpose([15]) }),
    ).toThrow(ParametresRequis);
    const r = executer(s, {
      action: 'attaque',
      acteur,
      cible: gobelin,
      parametres: { arme: 'epee' },
      aleatoire: aleatoireImpose([15, 6]),
    });
    expect(r.ok && r.resultat.variables.degats).toBe(6);
  });
});
