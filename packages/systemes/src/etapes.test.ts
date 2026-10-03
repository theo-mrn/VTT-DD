/**
 * Attaque en étapes, sur les trois systèmes (docs/combat.md § 6.1) : une phase de l'action qui
 * demande des dés est une étape que l'attaquant déclenche. D&D et Nooblies : le d20 (touché ou
 * raté par cible), puis les dés de dégâts des seules cibles touchées. Star Wars : la réserve dit
 * tout (rien à lancer après le jet), la table des blessures critiques est une étape s'il y a
 * critique. Rien n'est écrit en dur : les étapes viennent des phases du moteur.
 */
import { describe, expect, it } from 'vitest';
import {
  aleatoireImpose,
  aleatoirePlanifie,
  calculer,
  EtatEntite,
  executerMulticible,
  vueActeur,
  type CibleAction,
  type DeRequis,
  type EtatEntiteSaisi,
  type Fiche,
  type ResultatMulticible,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import { chargerSource } from './test-utils.js';

function fabrique(systeme: SystemeCharge) {
  const version = { id: systeme.source.id, version: systeme.source.version };
  return (saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>): Fiche =>
    calculer(
      systeme,
      EtatEntite.parse({ type: 'personnage', systeme: version, creation: false, ...saisi }),
    );
}

type Fini = Extract<ResultatMulticible, { ok: true }>;

/**
 * Joue une attaque étape par étape, comme le serveur : chaque étape rend les dés à lancer,
 * `lancer` leur donne une face, puis tout est rejoué avec les faces connues.
 */
function parEtapes(
  systeme: SystemeCharge,
  o: {
    action: string;
    acteur: Fiche;
    cibles: CibleAction[];
    parametres?: Record<string, Valeur>;
    jet?: 'commun' | 'par-cible';
  },
  lancer: (d: DeRequis, rang: number) => number,
) {
  const commun = (o.jet ?? systeme.actions.get(o.action)?.multicible?.jet) === 'commun';
  const faces: Record<string, number> = {};
  const etapes: { des: DeRequis[]; r: Fini }[] = [];
  let rang = 0;
  for (let i = 0; i < 10; i++) {
    const r = executerMulticible(systeme, {
      ...o,
      aleatoire: aleatoirePlanifie({ faces, commun }),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    if (!r.requis.length) return { etapes, final: r, faces };
    etapes.push({ des: r.requis, r });
    for (const d of r.requis) faces[d.id] = lancer(d, rang++);
  }
  throw new Error('Trop d’étapes');
}

const issue = (r: Fini, id: string) => {
  const c = r.cibles.find((x) => x.id === id);
  if (c?.ok) return c.resultat;
  return r.enAttente.find((x) => x.id === id)?.partiel ?? null;
};

// ─── D&D classique ───────────────────────────────────────────────────────────

describe('dnd-classic : le toucher, puis les dégâts', () => {
  const systeme = chargerSource('dnd-classic');
  const fiche = fabrique(systeme);
  const heros = fiche({
    valeurs: { niveau: 1, jetsDeVie: 9 },
    possessions: [{ entree: 'epee-longue' }],
  });
  const cible = fiche({ valeurs: { niveau: 1, jetsDeVie: 9 } });
  const autre = fiche({ valeurs: { niveau: 1, jetsDeVie: 9, DEX: 18 } });
  const defense = Number(cible.valeur('Defense'));
  const epee = (cibles: CibleAction[], jet?: 'commun' | 'par-cible') => ({
    action: 'attaque',
    acteur: heros,
    parametres: { score: 'Contact', arme: 'epee-longue' },
    cibles,
    ...(jet ? { jet } : {}),
  });

  it('épée contre deux cibles, jet par cible : deux d20, puis les dégâts de la seule touchée', () => {
    const { etapes, final } = parEtapes(
      systeme,
      epee([
        { id: 'a', fiche: cible },
        { id: 'b', fiche: autre },
      ]),
      (d) => {
        if (d.phase !== 'jet') return 5;
        return d.cible === 'a' ? 19 : 1;
      },
    );
    expect(etapes.map((e) => e.des.map((d) => [d.phase, d.cible ?? null]))).toEqual([
      [
        ['jet', 'a'],
        ['jet', 'b'],
      ],
      [['apres', 'a']],
    ]);
    // Après l'étape 1 : l'attaquant voit TOUCHÉ pour l'une, RATÉ pour l'autre, sans dégâts
    const apres1 = etapes[1]!.r;
    expect(apres1.cibles.map((c) => c.id)).toEqual(['b']);
    const touche = issue(apres1, 'a')!;
    expect(vueActeur(systeme, touche)).toMatchObject({ reussi: true, valeurs: [] });
    expect(vueActeur(systeme, issue(apres1, 'b')!)).toMatchObject({ reussi: false });
    // Fin : dégâts de l'épée pour la cible touchée, rien pour l'autre
    expect(issue(final, 'a')!.variables.degats).toBeGreaterThan(0);
    expect(issue(final, 'b')!.modifications).toEqual([]);
  });

  it('raté partout : pas d’étape de dégâts', () => {
    const { etapes, final } = parEtapes(
      systeme,
      epee([
        { id: 'a', fiche: cible },
        { id: 'b', fiche: autre },
      ]),
      () => 1,
    );
    expect(etapes).toHaveLength(1);
    expect(final.cibles.map((c) => c.ok && c.resultat.reussi)).toEqual([false, false]);
  });

  it('critique : les dés de l’arme sont doublés à l’étape des dégâts', () => {
    const normal = parEtapes(systeme, epee([{ id: 'a', fiche: cible }]), (d) =>
      d.phase === 'jet' ? Math.min(19, defense + 5) : 3,
    );
    const critique = parEtapes(systeme, epee([{ id: 'a', fiche: cible }]), (d) =>
      d.phase === 'jet' ? 20 : 3,
    );
    const nombre = (x: typeof normal) => x.etapes[1]!.des.length;
    expect(nombre(critique)).toBe(2 * nombre(normal));
  });

  it('jet commun : un d20 pour toutes les cibles, puis des dés de dégâts communs', () => {
    const { etapes } = parEtapes(
      systeme,
      epee(
        [
          { id: 'a', fiche: cible },
          { id: 'b', fiche: cible },
        ],
        'commun',
      ),
      (d) => (d.phase === 'jet' ? 19 : 4),
    );
    expect(etapes[0]!.des).toEqual([{ id: 'jet:d20:0', phase: 'jet', faces: 20 }]);
    expect(etapes[1]!.des.every((d) => d.phase === 'apres' && d.cible === undefined)).toBe(true);
  });

  it('mêmes faces, même résultat que le serveur qui tire tout', () => {
    const cibles = [
      { id: 'a', fiche: cible },
      { id: 'b', fiche: autre },
    ];
    const { final, faces } = parEtapes(systeme, epee(cibles), (d) => {
      if (d.phase !== 'jet') return 6;
      return d.cible === 'a' ? 18 : 2;
    });
    const ordre = [
      '0:jet:d20:0',
      ...Object.keys(faces).filter((k) => k.startsWith('0:apres')),
      '1:jet:d20:0',
    ];
    const serveur = executerMulticible(systeme, {
      ...epee(cibles),
      aleatoire: aleatoireImpose(ordre.map((k) => faces[k]!)),
    });
    expect(final).toEqual(serveur);
  });
});

describe('dnd-classic : le type d’attaque au jet, l’arme après, si l’attaque touche', () => {
  const systeme = chargerSource('dnd-classic');
  const fiche = fabrique(systeme);
  const heros = fiche({
    valeurs: { niveau: 1, jetsDeVie: 9 },
    possessions: [
      { entree: 'epee-longue' },
      // Lame à part, critique dès 19
      { entree: 'epee-longue', exemplaire: 'fine', champs: { critique: 19 } },
    ],
  });
  const cible = fiche({ valeurs: { niveau: 1, jetsDeVie: 9 } });
  const defense = Number(cible.valeur('Defense'));
  const jouer = (faces: Record<string, number>, arme?: string) =>
    executerMulticible(systeme, {
      action: 'attaque',
      acteur: heros,
      cibles: [{ id: 'a', fiche: cible }],
      parametres: { score: 'Contact', ...(arme ? { arme } : {}) },
      aleatoire: aleatoirePlanifie({ faces, commun: false }),
    }) as Fini;

  it('touché : l’arme est demandée à l’étape des dégâts, puis ses dés', () => {
    const d20 = { '0:jet:d20:0': Math.min(19, defense) };
    const etape2 = jouer(d20);
    expect([etape2.requis, etape2.parametres]).toEqual([
      [],
      ['arme', 'capacite', 'nbDes', 'faces', 'bonus'],
    ]);
    expect(issue(etape2, 'a')).toMatchObject({ reussi: true });
    const des = jouer(d20, 'epee-longue');
    expect(des.parametres).toEqual([]);
    expect(des.requis.map((d) => [d.phase, d.faces])).toEqual([['apres', 8]]);
    const fin = jouer({ ...d20, '0:apres:d8:0': 6 }, 'epee-longue');
    expect(issue(fin, 'a')).toMatchObject({ parametres: { arme: 'epee-longue' } });
    expect(issue(fin, 'a')!.variables.degats).toBeGreaterThanOrEqual(6);
  });

  it('raté : ni arme ni dégâts', () => {
    const r = jouer({ '0:jet:d20:0': 2 });
    expect([r.parametres, r.requis, r.enAttente]).toEqual([[], [], []]);
  });

  it('critique : le seuil de l’arme choisie (19) le confirme après le jet', () => {
    const d19 = { '0:jet:d20:0': 19 };
    expect(issue(jouer(d19), 'a')!.jet).toMatchObject({ critique: false });
    const fine = jouer(d19, 'epee-longue#fine');
    expect(fine.requis).toHaveLength(2); // dés de l'arme doublés
    expect(jouer(d19, 'epee-longue').requis).toHaveLength(1);
  });
});

// ─── Nooblies ────────────────────────────────────────────────────────────────

describe('nooblies : le toucher, puis les dégâts', () => {
  const systeme = chargerSource('nooblies');
  const fiche = fabrique(systeme);
  const base = { FOR: 14, DEX: 11, CON: 16, SAG: 9, INT: 12, CHA: 13, jetDeVie: 7 };
  const nain = fiche({ valeurs: base, possessions: [{ entree: 'nain' }, { entree: 'guerrier' }] });

  it('deux étapes : le d20, puis les dés de dégâts choisis', () => {
    const { etapes, final } = parEtapes(
      systeme,
      {
        action: 'attaque',
        acteur: nain,
        parametres: { score: 'Contact', nbDes: 2, faces: 6, bonus: 1 },
        cibles: [{ id: 'n', fiche: nain }],
      },
      (d) => (d.phase === 'jet' ? 20 : 4),
    );
    expect(etapes.map((e) => e.des.map((d) => `${d.phase}:${d.faces}`))).toEqual([
      ['jet:20'],
      ['apres:6', 'apres:6'],
    ]);
    expect(issue(final, 'n')!.variables.degats).toBe(9);
  });
});

// ─── Star Wars ───────────────────────────────────────────────────────────────

describe('star-wars-eote : la réserve dit tout, la blessure critique est une étape', () => {
  const systeme = chargerSource('star-wars-eote');
  const fiche = fabrique(systeme);
  const tireur = fiche({
    possessions: [
      { entree: 'bothan' },
      { entree: 'fusil-blaster' },
      { entree: 'distance-lourde', rang: 2 },
    ],
  });
  const lourd = fiche({ possessions: [{ entree: 'wookiee' }, { entree: 'armure-legere' }] });
  const tir = {
    action: 'attaque',
    acteur: tireur,
    parametres: { arme: 'fusil-blaster', portee: 'courte' },
    cibles: [{ id: 'w', fiche: lourd }],
  };

  it('sans critique : une seule étape (la réserve), les dégâts viennent des symboles', () => {
    const { etapes, final } = parEtapes(systeme, tir, (d) => (d.de === 'aptitude' ? 2 : 1));
    expect(etapes).toHaveLength(1);
    expect(etapes[0]!.des.every((d) => d.phase === 'jet' && d.de)).toBe(true);
    expect(final.enAttente).toEqual([]);
  });

  it('critique : la réserve, puis le d100 de la table', () => {
    // Aptitude : 2 Succès ; Maîtrise : Triomphe ; dés contraires vierges ; puis le d100
    const face: Record<string, number> = { aptitude: 4, maitrise: 12, fortune: 4 };
    const { etapes, final } = parEtapes(systeme, tir, (d) =>
      d.phase === 'tables' ? 45 : (face[d.de ?? ''] ?? 1),
    );
    expect(etapes.map((e) => e.des.map((d) => d.phase))).toEqual([
      etapes[0]!.des.map(() => 'jet'),
      ['tables'],
    ]);
    expect(etapes[1]!.des[0]).toMatchObject({ faces: 100 });
    // Avant la table : dégâts connus, l'attaquant les voit déjà
    const avant = etapes[1]!.r.enAttente[0]!;
    expect(avant.phase).toBe('tables');
    expect(vueActeur(systeme, avant.partiel!).valeurs.map((v) => v.cle)).toEqual(['degatsBruts']);
    expect(issue(final, 'w')!.tables).toHaveLength(1);
  });
});
