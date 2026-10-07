/**
 * Durées décomptées au nombre de tours (docs/combat.md § 18) : moments, ancre, attente de la fin
 * de tour, expiration, ancre absente du combat, durée par défaut des données, libellés.
 */
import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger } from '../chargement/index.js';
import { aleatoireImpose } from '../formules/index.js';
import {
  EtatEntite,
  type EtatEntiteSaisi,
  type Possession,
  type SystemeSaisi,
} from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import {
  appliquerModifications,
  avancerMinuterie,
  decompterDurees,
  donnerEntree,
  dureeActivation,
  dureeDonnee,
  executerAction,
  libelleCourtDuree,
  libelleDuree,
  poserDecompte,
  type EvenementDuree,
} from './index.js';

const MOI = 'porteur-1';
const LUI = 'source-2';

const saisi: SystemeSaisi = {
  ...miniD20,
  sortes: [
    ...miniD20.sortes!,
    { id: 'etat', nom: 'État', pour: ['personnage'] },
    {
      id: 'pouvoir',
      nom: 'Pouvoir à activer',
      pour: ['personnage'],
      activable: true,
      actifParDefaut: false,
      dureeActivation: { champ: 'duree' },
      champs: [{ id: 'duree', nom: 'Durée', type: 'formule', des: true }],
    },
  ],
  catalogue: [
    ...miniD20.catalogue!,
    {
      id: 'beni',
      sorte: 'etat',
      nom: 'Béni',
      effets: [{ sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: 1 }],
    },
    {
      id: 'etourdi',
      sorte: 'etat',
      nom: 'Étourdi',
      duree: { valeur: 1, moment: 'fin-tour' },
    },
    {
      id: 'rage',
      sorte: 'pouvoir',
      nom: 'Rage',
      champs: { duree: '2 + mod(@FOR)' },
      effets: [{ sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: 2 }],
    },
    { id: 'transe', sorte: 'pouvoir', nom: 'Transe', champs: { duree: '1d4' } },
    { id: 'aura', sorte: 'pouvoir', nom: 'Aura' },
    {
      id: 'marque',
      sorte: 'etat',
      nom: 'Marqué',
      duree: { valeur: 1, moment: 'debut-tour', de: 'source' },
    },
  ],
  actions: [
    {
      id: 'frappe',
      nom: 'Frappe',
      pour: ['personnage'],
      cible: 'personnage',
      jet: { type: 'numerique', formule: '1d20' },
      consequences: [
        { entite: 'cible', entree: 'etourdi', operation: 'donner' },
        { entite: 'cible', entree: 'marque', operation: 'donner' },
        { entite: 'cible', entree: 'beni', operation: 'donner', duree: 3 },
        {
          entite: 'acteur',
          entree: 'beni',
          operation: 'donner',
          duree: 2,
          decompte: { moment: 'fin-tour', de: 'source' },
        },
      ],
    },
  ],
};
const r = charger(saisi);
if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
const s = r.systeme;

const etat = (e: Partial<EtatEntiteSaisi> = {}) =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: s.source.id, version: '1.0.0' },
    valeurs: { niveau: 1 },
    ...e,
  });
const fiche = (e: Partial<EtatEntiteSaisi> = {}) => calculer(s, etat(e));

const debut = (personnage: string): EvenementDuree => ({ type: 'debut-tour', personnage });
const fin = (personnage: string): EvenementDuree => ({ type: 'fin-tour', personnage });
const ROUND: EvenementDuree = { type: 'fin-round' };

/** Avance une minuterie événement par événement ; `null` : expirée. */
function suivre(
  x: Pick<Possession, 'duree' | 'decompte'>,
  evenements: EvenementDuree[],
  participants?: string[],
) {
  const p = participants ? new Set(participants) : undefined;
  return avancerMinuterie(x, evenements, MOI, p);
}

describe('moments du décompte', () => {
  it('fin de round (défaut) : un décompte par round, les tours ne comptent pas', () => {
    expect(suivre({ duree: 2 }, [fin(MOI), debut(LUI)])).toEqual({ duree: 2 });
    expect(suivre({ duree: 2 }, [fin(MOI), ROUND, debut(LUI)])).toEqual({ duree: 1 });
    expect(suivre({ duree: 2 }, [ROUND, ROUND])).toBeNull();
  });

  it('début de tour : seulement au début du tour de l’ancre', () => {
    const x = { duree: 1, decompte: { moment: 'debut-tour' as const, de: LUI } };
    expect(suivre(x, [fin(MOI), ROUND, debut(MOI), fin(LUI)])).toBe(x);
    expect(suivre(x, [debut(LUI)])).toBeNull();
  });

  it('fin de tour posée pendant le tour du porteur : la fin du tour suivant', () => {
    const pose = { duree: 1, decompte: poserDecompte(undefined, { moment: 'fin-tour' }) };
    expect(pose.decompte).toEqual({ moment: 'fin-tour', attente: true });
    // Fin du tour en cours : l'attente est levée, rien n'est décompté
    const apresTour = suivre(pose, [fin(MOI), ROUND]);
    expect(apresTour).toEqual({ duree: 1, decompte: { moment: 'fin-tour' } });
    expect(suivre(apresTour!, [debut(MOI)])).toBe(apresTour);
    expect(suivre(apresTour!, [debut(MOI), fin(MOI)])).toBeNull();
  });

  it('fin de tour posée hors de son tour : la fin de son prochain tour', () => {
    const pose = { duree: 1, decompte: poserDecompte(undefined, { moment: 'fin-tour' }) };
    const commence = suivre(pose, [fin(LUI), debut(MOI)]);
    expect(commence).toEqual({ duree: 1, decompte: { moment: 'fin-tour' } });
    expect(suivre(commence!, [fin(MOI)])).toBeNull();
  });

  it('plusieurs tours : un décompte par tour de l’ancre', () => {
    const x = { duree: 2, decompte: { moment: 'fin-tour' as const, de: LUI } };
    expect(suivre(x, [fin(LUI)])).toEqual({ duree: 1, decompte: { moment: 'fin-tour', de: LUI } });
    expect(suivre(x, [fin(LUI), ROUND, debut(LUI), fin(LUI)])).toBeNull();
  });

  it('une ancre absente du combat se rabat sur la fin de round', () => {
    const x = { duree: 2, decompte: { moment: 'fin-tour' as const, de: 'parti' } };
    expect(suivre(x, [ROUND], [MOI, LUI])).toEqual({ ...x, duree: 1 });
    // Sans liste des participants, l'ancre reste la référence
    expect(suivre(x, [ROUND])).toBe(x);
  });

  it('fin du combat : tout ce qui a une durée expire, le reste demeure', () => {
    expect(suivre({ duree: 9 }, [{ type: 'fin-combat' }])).toBeNull();
    expect(suivre({}, [{ type: 'fin-combat' }])).toEqual({});
  });
});

describe('décompte d’une fiche', () => {
  it('possessions et bonus avancent, les expirés partent avec leurs effets et leur nom', () => {
    const e = etat({
      possessions: [
        { entree: 'beni', duree: 1 },
        { entree: 'etourdi', duree: 2, decompte: { moment: 'fin-tour' } },
        { entree: 'marque' },
      ],
      bonus: [
        { id: 'priere', nom: 'Prière', duree: 1, decompte: { moment: 'debut-tour', de: LUI } },
      ],
    });
    expect(calculer(s, e).valeur('Defense')).toBe(Number(fiche().valeur('Defense')) + 1);
    const r1 = decompterDurees(e, [fin(MOI), ROUND, debut(LUI)], { porteur: MOI, systeme: s });
    expect(r1.expirees).toEqual([
      { cle: 'beni', nom: 'Béni' },
      { cle: 'bonus:priere', nom: 'Prière' },
    ]);
    expect(r1.etat!.possessions.map((p) => [p.entree, p.duree])).toEqual([
      ['etourdi', 1],
      ['marque', undefined],
    ]);
    expect(r1.etat!.bonus).toEqual([]);
    expect(calculer(s, r1.etat!).valeur('Defense')).toBe(fiche().valeur('Defense'));
  });

  it('rien à décompter : aucun état à enregistrer', () => {
    const e = etat({
      possessions: [{ entree: 'beni', duree: 2, decompte: { moment: 'fin-tour' } }],
    });
    expect(decompterDurees(e, [debut(LUI), fin(LUI)], { porteur: MOI })).toEqual({ expirees: [] });
    expect(decompterDurees(etat(), [ROUND], { porteur: MOI })).toEqual({ expirees: [] });
    expect(decompterDurees(e, [], { porteur: MOI })).toEqual({ expirees: [] });
  });

  it('un exemplaire identifié se nomme par sa clé', () => {
    const e = etat({ possessions: [{ entree: 'beni', exemplaire: '2', duree: 1 }] });
    const res = decompterDurees(e, [ROUND], { porteur: MOI, systeme: s });
    expect(res.expirees).toEqual([{ cle: 'beni#2', nom: 'Béni' }]);
  });
});

describe('poser une durée', () => {
  it('fin de round : rien à enregistrer ; début de tour : pas d’attente', () => {
    expect(poserDecompte(undefined, { moment: 'fin-round', de: LUI })).toBeUndefined();
    expect(poserDecompte(undefined, undefined)).toBeUndefined();
    expect(poserDecompte(undefined, { moment: 'debut-tour', de: LUI })).toEqual({
      moment: 'debut-tour',
      de: LUI,
    });
  });

  it('fin de tour inchangée : l’attente en cours est gardée ; changée : reposée', () => {
    const leve = { moment: 'fin-tour' as const };
    expect(poserDecompte(leve, { moment: 'fin-tour' })).toBe(leve);
    expect(poserDecompte(leve, { moment: 'fin-tour', de: LUI })).toEqual({
      moment: 'fin-tour',
      de: LUI,
      attente: true,
    });
  });

  it('redonner une entrée : la durée la plus longue l’emporte, avec son décompte', () => {
    let l = donnerEntree(s, [], 'beni', { duree: 1 });
    l = donnerEntree(s, l, 'beni', { duree: 2, decompte: { moment: 'fin-tour', de: LUI } });
    expect(l).toMatchObject([
      { entree: 'beni', duree: 2, decompte: { moment: 'fin-tour', de: LUI, attente: true } },
    ]);
    l = donnerEntree(s, l, 'beni', { duree: 1 });
    expect(l[0]!.duree).toBe(2);
    l = donnerEntree(s, l, 'beni', { duree: 4 });
    expect(l[0]).toMatchObject({ duree: 4 });
    expect(l[0]!.decompte).toBeUndefined();
  });

  it('durée donnée : celle de la conséquence, sinon celle de l’entrée', () => {
    const def = { valeur: 1, moment: 'fin-tour' as const, de: 'porteur' as const };
    expect(dureeDonnee(undefined, undefined, def)).toEqual({
      duree: 1,
      decompte: { moment: 'fin-tour', de: 'porteur' },
    });
    expect(dureeDonnee(3, undefined, undefined)).toEqual({ duree: 3 });
    expect(dureeDonnee(3, { moment: 'fin-round', de: 'porteur' }, def)).toEqual({ duree: 3 });
    expect(dureeDonnee(undefined, undefined, undefined)).toEqual({});
  });
});

describe('action : durée par défaut de l’entrée, source résolue à l’application', () => {
  it('reprend la durée du catalogue et résout la source', () => {
    const res = executerAction(s, {
      action: 'frappe',
      acteur: fiche(),
      cible: fiche(),
      aleatoire: aleatoireImpose([10]),
    });
    if (!res.ok) throw new Error(JSON.stringify(res.erreurs));
    const entrees = res.resultat.modifications.filter((m) => 'entree' in m);
    expect(entrees).toEqual([
      {
        entite: 'cible',
        entree: 'etourdi',
        operation: 'donner',
        rangs: 1,
        duree: 1,
        decompte: { moment: 'fin-tour' },
      },
      {
        entite: 'cible',
        entree: 'marque',
        operation: 'donner',
        rangs: 1,
        duree: 1,
        decompte: { moment: 'debut-tour', source: true },
      },
      { entite: 'cible', entree: 'beni', operation: 'donner', rangs: 1, duree: 3 },
      {
        entite: 'acteur',
        entree: 'beni',
        operation: 'donner',
        rangs: 1,
        duree: 2,
        decompte: { moment: 'fin-tour', source: true },
      },
    ]);
    expect(res.resultat.explications).toContain(
      'Cible : reçoit Étourdi (jusqu’à la fin de son prochain tour)',
    );
    const apres = appliquerModifications(fiche(), res.resultat.modifications, 'cible', {
      source: LUI,
    });
    expect(apres.possessions.find((p) => p.entree === 'marque')).toMatchObject({
      duree: 1,
      decompte: { moment: 'debut-tour', de: LUI },
    });
    expect(apres.possessions.find((p) => p.entree === 'etourdi')?.decompte).toEqual({
      moment: 'fin-tour',
      attente: true,
    });
    // Sans source connue : le porteur
    const seul = appliquerModifications(fiche(), res.resultat.modifications, 'cible');
    expect(seul.possessions.find((p) => p.entree === 'marque')?.decompte).toEqual({
      moment: 'debut-tour',
    });
  });

  it('refuse une source sans décompte au tour', () => {
    const faux = structuredClone(saisi);
    faux.catalogue!.push({
      id: 'faux',
      sorte: 'etat',
      nom: 'Faux',
      duree: { valeur: 1, moment: 'fin-round', de: 'source' },
    });
    const r2 = charger(faux);
    expect(!r2.ok && r2.erreurs.map((e) => e.message)).toEqual([
      'La source ne compte qu’avec un décompte au tour (debut-tour, fin-tour)',
    ]);
  });
});

describe('durée d’une activation', () => {
  const rage = (p: Partial<Possession> = {}) => ({ entree: 'rage', actif: true, ...p });

  it('lue sur le porteur à l’activation, dés compris ; sans formule : pas de durée', () => {
    const f = fiche({ valeurs: { niveau: 1, FOR: 14 }, possessions: [rage()] });
    expect(dureeActivation(f, 'rage')).toEqual({ duree: 4 });
    expect(dureeActivation(f, 'transe', aleatoireImpose([3]))).toEqual({ duree: 3 });
    expect(dureeActivation(f, 'transe')).toBeUndefined(); // dés sans générateur
    expect(dureeActivation(f, 'aura')).toBeUndefined();
    expect(dureeActivation(f, 'beni')).toBeUndefined(); // sorte sans durée d'activation
  });

  it('à son terme, l’entrée s’éteint au lieu d’être retirée, fin du combat comprise', () => {
    for (const evenements of [[ROUND], [{ type: 'fin-combat' } as const]]) {
      const r = decompterDurees(etat({ possessions: [rage({ duree: 1 })] }), evenements, {
        porteur: MOI,
        systeme: s,
      });
      expect(r.expirees).toEqual([{ cle: 'rage', nom: 'Rage' }]);
      expect(r.etat?.possessions).toEqual([
        expect.objectContaining({ entree: 'rage', actif: false }),
      ]);
      expect(r.etat?.possessions[0]).not.toHaveProperty('duree');
      expect(calculer(s, r.etat!).valeur('Defense')).toBe(fiche().valeur('Defense'));
    }
  });

  it('refusée au chargement hors d’une sorte activable, ou sans champ formule', () => {
    const avec = (sorte: Record<string, unknown>) =>
      charger({
        ...saisi,
        sortes: [...miniD20.sortes!, { id: 'x', nom: 'X', pour: ['personnage'], ...sorte }],
        catalogue: miniD20.catalogue,
        actions: [],
      });
    expect(
      avec({ dureeActivation: { champ: 'd' }, champs: [{ id: 'd', nom: 'D', type: 'formule' }] })
        .ok,
    ).toBe(false);
    expect(
      avec({
        activable: true,
        dureeActivation: { champ: 'd' },
        champs: [{ id: 'd', nom: 'D', type: 'nombre' }],
      }).ok,
    ).toBe(false);
    expect(
      avec({
        activable: true,
        dureeActivation: { champ: 'd' },
        champs: [{ id: 'd', nom: 'D', type: 'formule' }],
      }).ok,
    ).toBe(true);
  });
});

describe('libellés', () => {
  const nomDe = (id: string) => (id === LUI ? 'Gobelin' : undefined);
  it('court : rounds ou tours', () => {
    expect(libelleCourtDuree({ duree: 2 })).toBe('2 rounds');
    expect(libelleCourtDuree({ duree: 1, decompte: { moment: 'fin-tour' } })).toBe('1 tour');
    expect(libelleCourtDuree({})).toBeNull();
  });

  it('complet : moment, ancre, prochain tour', () => {
    expect(libelleDuree({})).toBe('jusqu’au retrait');
    expect(libelleDuree({ duree: 1 })).toBe('1 round');
    expect(libelleDuree({ duree: 1, decompte: { moment: 'fin-tour', attente: true } })).toBe(
      'jusqu’à la fin de son prochain tour',
    );
    expect(libelleDuree({ duree: 1, decompte: { moment: 'fin-tour' } })).toBe(
      'jusqu’à la fin de son tour',
    );
    expect(libelleDuree({ duree: 1, decompte: { moment: 'debut-tour', de: LUI } }, { nomDe })).toBe(
      'jusqu’au début du prochain tour de Gobelin',
    );
    expect(
      libelleDuree(
        { duree: 3, decompte: { moment: 'fin-tour', de: LUI } },
        { porteur: MOI, nomDe },
      ),
    ).toBe('3 tours, jusqu’à la fin du tour de Gobelin');
    // L'ancre est le porteur lui-même
    expect(
      libelleDuree({ duree: 1, decompte: { moment: 'debut-tour', de: MOI } }, { porteur: MOI }),
    ).toBe('jusqu’au début de son prochain tour');
  });
});
