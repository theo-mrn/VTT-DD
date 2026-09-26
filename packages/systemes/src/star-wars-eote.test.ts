/**
 * Star Wars — Aux confins de l'Empire : chargement du système et personnages
 * de référence. Les valeurs attendues sont calculées à la main depuis les
 * règles legacy (coûts de progression, seuils, pools de dés).
 */
import { describe, expect, it } from 'vitest';
import {
  acheter,
  aleatoireImpose,
  appliquerModifications,
  appliquerTirage,
  calculer,
  EtatEntite,
  examinerAchat,
  executerAction,
  initiative,
  nombreChoix,
  solde,
  tirerTable,
  type EtatEntiteSaisi,
  type Fiche,
  type ResultatAction,
  type SystemeCharge,
} from '@vtt/rules';
import { chargerSource } from './test-utils.js';

const systeme: SystemeCharge = chargerSource('star-wars-eote');
const VERSION = { id: 'star-wars-eote', version: '1.0.0' };

function etat(saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>, type = 'personnage'): EtatEntite {
  return EtatEntite.parse({ type, systeme: VERSION, ...saisi });
}
const fiche = (e: EtatEntite): Fiche => calculer(systeme, e);
const parSorte = (s: string) => [...systeme.entrees.values()].filter((e) => e.sorte === s);
const rang = (f: Fiche, id: string) => f.possessions.get(id)?.rang ?? 0;

/** Exécute une action et renvoie son résultat, en échouant si elle est refusée. */
function agir(demande: Omit<Parameters<typeof executerAction>[1], 'aleatoire'>, des: number[]) {
  const r = executerAction(systeme, { ...demande, aleatoire: aleatoireImpose(des) });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  expect(r.resultat.erreurs).toEqual([]);
  return r.resultat;
}
const pool = (r: ResultatAction) => (r.jet.type === 'symboles' ? r.jet.pool : []);

/** Achète une suite d'objets à la suite, en échouant au premier refus. */
function acheterTout(depart: EtatEntite, achats: [string, string][]): EtatEntite {
  return achats.reduce((e, [achat, objet]) => {
    const r = acheter(systeme, e, { achat, objet });
    if (!r.ok) throw new Error(`${achat} ${objet} : ${r.erreur}`);
    return r.etat;
  }, depart);
}

/**
 * Bothan chasseur de primes (Assassin), à la création : 4 rangs de carrière
 * (Athlétisme, Perception, Distance lourde, Vigilance), 2 de spécialisation
 * (Discrétion, Magouilles), puis 90 des 100 XP de départ dépensés.
 */
function bothanChasseur(): EtatEntite {
  const depart = etat({
    creation: true,
    possessions: [
      { entree: 'bothan' },
      {
        entree: 'chasseur-de-primes',
        choix: { 'rangs-de-depart': ['athletisme', 'perception', 'distance-lourde', 'vigilance'] },
      },
      { entree: 'assassin', choix: { 'rangs-de-depart': ['discretion', 'magouilles'] } },
      { entree: 'prime', champs: { valeur: 10 } },
      { entree: 'dette', champs: { valeur: 5 } },
      { entree: 'fusil-blaster' },
      { entree: 'armure-legere' },
      { entree: 'combinaison-de-combat' },
    ],
  });
  return acheterTout(depart, [
    ['caracteristique', 'agilite'], // 2 → 3 : 30 XP
    ['caracteristique', 'vigueur'], // 1 → 2 : 20 XP
    ['rang-competence', 'distance-lourde'], // 1 → 2, carrière : 10 XP
    ['rang-competence', 'charme'], // 0 → 1, hors carrière : 10 XP
    ['talent', 'arbre-assassin/l1c1'], // Cran : 5 XP
    ['talent', 'arbre-assassin/l2c1'], // Visée précise : 10 XP
    ['talent', 'arbre-assassin/l1c3'], // Traqueur : 5 XP
  ]);
}

/** Wookiee mercenaire (Marauder) en jeu : cible des attaques. */
function wookiee(extra: EtatEntiteSaisi['possessions'] = []): EtatEntite {
  return etat({
    possessions: [
      { entree: 'wookiee' },
      { entree: 'mercenaire' },
      { entree: 'maraudeur' },
      { entree: 'vigilance', rang: 1 },
      { entree: 'armure-legere' },
      ...extra,
    ],
  });
}

describe('Star Wars — Aux confins de l’Empire : chargement', () => {
  it('se charge sans erreur avec tout le contenu du bundle', () => {
    expect(systeme.source.version).toBe('1.0.0');
    expect(parSorte('espece')).toHaveLength(100);
    expect(parSorte('competence')).toHaveLength(33);
    expect(parSorte('carriere')).toHaveLength(6);
    expect(parSorte('specialisation')).toHaveLength(18);
    expect(parSorte('talent')).toHaveLength(138);
    expect(parSorte('arme')).toHaveLength(30); // 29 du bundle + mains nues
    expect(parSorte('armure')).toHaveLength(11);
    expect(parSorte('objet')).toHaveLength(18); // 17 du bundle + stimpack
    expect(parSorte('accessoire')).toHaveLength(11);
    expect(parSorte('devise')).toHaveLength(6);
    expect(parSorte('modele')).toHaveLength(34);
    expect(parSorte('obligation')).toHaveLength(12);
    expect(parSorte('blessureCritique')).toHaveLength(12);
    expect(parSorte('portee')).toHaveLength(5);
    expect(parSorte('circonstance')).toHaveLength(15);
    expect(parSorte('etat')).toHaveLength(9);
    expect(systeme.arbres.size).toBe(18);
    expect(systeme.source.textes).toHaveLength(27);
    expect(systeme.source.des?.sortes.map((d) => d.id)).toEqual([
      'fortune',
      'infortune',
      'aptitude',
      'difficulte',
      'maitrise',
      'defi',
      'force',
    ]);
    expect([...systeme.actions.keys()]).toEqual([
      'test',
      'test-cible',
      'attaque',
      'initiative',
      'soins',
      'stimpack',
      'recuperation',
      'talent',
      'defense-active',
      'protecteur',
      'second-souffle',
      'presence-intense',
    ]);
    expect(systeme.source.initiative).toEqual({
      action: 'initiative',
      tri: ['succesNets', 'avantagesNets'],
    });
    expect([...systeme.tables.keys()].sort()).toEqual([
      'blessures-critiques',
      'dommages-critiques-vehicule',
    ]);
  });

  it('chaque spécialisation ouvre un arbre complet de 20 nœuds au coût de 5 XP par ligne', () => {
    for (const spec of parSorte('specialisation')) {
      const arbre = [...systeme.arbres.values()].find((a) => a.ouvertPar === spec.id);
      expect(arbre, spec.id).toBeDefined();
      expect(arbre!.noeuds).toHaveLength(20);
      expect(arbre!.noeuds.filter((n) => n.depart).map((n) => n.y)).toEqual([0, 0, 0, 0]);
      for (const n of arbre!.noeuds) expect(n.cout).toBe('5 * (y + 1)');
    }
  });

  it('chaque carrière marque ses 8 compétences et ses 3 spécialisations', () => {
    for (const c of parSorte('carriere')) {
      const marque = c.effets.find((e) => e.sur === 'marque');
      const entrees = marque?.sur === 'marque' ? marque.entrees : [];
      const sortes = entrees.map((id) => systeme.entrees.get(id)?.sorte);
      expect(
        sortes.filter((s) => s === 'competence'),
        c.id,
      ).toHaveLength(8);
      expect(
        sortes.filter((s) => s === 'specialisation'),
        c.id,
      ).toHaveLength(3);
    }
  });
});

describe('Bothan chasseur de primes (Assassin)', () => {
  const e = bothanChasseur();
  const f = fiche(e);

  it('caractéristiques d’espèce + achats, sans erreur de calcul', () => {
    expect(f.erreurs).toEqual([]);
    expect(f.valeur('vigueur')).toBe(2);
    expect(f.valeur('agilite')).toBe(3);
    expect(f.valeur('intellect')).toBe(2);
    expect(f.valeur('ruse')).toBe(3);
    expect(f.valeur('volonte')).toBe(2);
    expect(f.valeur('presence')).toBe(2);
    // Seule la part achetée est enregistrée
    expect(e.valeurs).toMatchObject({ vigueur: 1, agilite: 1 });
  });

  it('seuils, encaissement, défense et encombrement', () => {
    expect(f.valeur('seuilBlessure')).toBe(12); // 10 + Vigueur 2
    expect(f.valeur('seuilStress')).toBe(13); // 10 + Volonté 2 + Cran
    expect(f.valeurs.get('blessures')).toMatchObject({ valeur: 0, min: 0, max: 12 });
    expect(f.valeurs.get('stress')).toMatchObject({ valeur: 0, min: 0, max: 13 });
    // Vigueur 2 + armure légère 1 (la combinaison, de même famille, ne se cumule pas)
    expect(f.valeur('encaissementArmure')).toBe(1);
    expect(f.valeur('encaissement')).toBe(3);
    expect(f.valeur('defenseDistance')).toBe(1);
    expect(f.valeur('defenseMelee')).toBe(1);
    // Fusil 3 ; armures portées 3 + 2, moins 3 chacune (jamais en dessous de 0)
    expect(f.valeur('encombrement')).toBe(3);
    expect(f.valeur('seuilEncombrement')).toBe(7);
    expect(f.valeur('excedentEncombrement')).toBe(0);
    expect(f.valeur('surcharge')).toBe(false);
    expect(f.valeur('neutralise')).toBe(false);
  });

  it('profil : catégorie, crédits de départ, Obligation avec détail', () => {
    expect(f.valeur('categorie')).toBe('pj');
    expect(f.valeur('credits')).toBe(500);
    expect(f.valeur('inorganique')).toBe(false);
  });

  it('rangs gratuits (espèce, carrière, spécialisation), rangs achetés et talents', () => {
    expect(rang(f, 'sens-de-la-rue')).toBe(1); // espèce
    expect(rang(f, 'attitude-convaincante')).toBe(1); // talent d'espèce
    expect(rang(f, 'athletisme')).toBe(1);
    expect(rang(f, 'perception')).toBe(1);
    expect(rang(f, 'distance-lourde')).toBe(2);
    expect(rang(f, 'vigilance')).toBe(1);
    expect(rang(f, 'discretion')).toBe(1);
    expect(rang(f, 'magouilles')).toBe(1);
    expect(rang(f, 'charme')).toBe(1);
    expect(rang(f, 'cran')).toBe(1);
    expect(rang(f, 'visee-precise')).toBe(1);
    expect(rang(f, 'traqueur')).toBe(1);
  });

  it('marques de carrière : carrière et spécialisation', () => {
    for (const id of ['athletisme', 'vigilance', 'distance-lourde', 'assassin', 'survivaliste'])
      expect(f.marques.get(id)?.has('carriere'), id).toBe(true);
    // Bonus de carrière de la spécialisation Assassin
    for (const id of ['melee', 'discretion', 'magouilles'])
      expect(f.marques.get(id)?.has('carriere'), id).toBe(true);
    for (const id of ['charme', 'medecine', 'pilote'])
      expect(f.marques.get(id), id).toBeUndefined();
  });

  it('XP : 100 de départ, 90 dépensées ; Obligation totale 15', () => {
    expect(f.valeur('xpDepart')).toBe(100);
    expect(e.journal.map((l) => l.cout)).toEqual([30, 20, 10, 10, 5, 10, 5]);
    expect(solde(f, 'xp')).toBe(10);
    expect(f.valeur('obligation')).toBe(15);
  });

  it('coûts de progression : compétences, caractéristiques, spécialisations, nœuds', () => {
    const cout = (fi: Fiche, achat: string, objet: string) => {
      const r = examinerAchat(fi, achat, objet);
      if (!r.ok) throw new Error(r.erreur);
      return r.objet;
    };
    // Compétence : 5 × rang visé, +5 hors carrière
    expect(cout(f, 'rang-competence', 'perception').cout).toBe(10); // carrière 1 → 2
    expect(cout(f, 'rang-competence', 'charme').cout).toBe(15); // hors carrière 1 → 2
    expect(cout(f, 'rang-competence', 'medecine').cout).toBe(10); // hors carrière 0 → 1
    // Rang 2 au plus à la création, 5 ensuite
    const bloque = cout(f, 'rang-competence', 'distance-lourde');
    expect(bloque.possible).toBe(false);
    expect(bloque.blocages.map((b) => b.code)).toContain('plafond');
    const enJeu = fiche({ ...e, creation: false });
    expect(cout(enJeu, 'rang-competence', 'distance-lourde').cout).toBe(15);
    // Caractéristique : un seul achat, 10 × la nouvelle valeur (espèce comprise), jusqu'à 5
    expect(cout(f, 'caracteristique', 'ruse').cout).toBe(40);
    expect(cout(f, 'caracteristique', 'vigueur').cout).toBe(30);
    expect(cout(f, 'caracteristique', 'presence').cout).toBe(30);
    // Spécialisation : 10 × (nombre + 1), +10 hors carrière
    expect(cout(enJeu, 'specialisation', 'survivaliste').cout).toBe(20);
    expect(cout(enJeu, 'specialisation', 'pilote').cout).toBe(30);
    // Nœud : 5 × (ligne + 1), relié à un nœud acquis
    expect(cout(f, 'talent', 'arbre-assassin/l3c1').cout).toBe(15);
    expect(cout(f, 'talent', 'arbre-assassin/l2c3').cout).toBe(10);
    expect(cout(f, 'talent', 'arbre-assassin/l3c4').blocages.map((b) => b.code)).toContain(
      'non-relie',
    );
    // Arbre d'une spécialisation non possédée
    expect(cout(f, 'talent', 'arbre-pilote/l1c1').possible).toBe(false);
  });

  it('une caractéristique ne dépasse pas 5 à la création', () => {
    const riche = { ...e, valeurs: { ...e.valeurs, xpGagne: 200 } };
    const r = acheterTout(riche, [
      ['caracteristique', 'ruse'], // 3 → 4 : 40 XP
      ['caracteristique', 'ruse'], // 4 → 5 : 50 XP
    ]);
    const f5 = fiche(r);
    expect(f5.valeur('ruse')).toBe(5);
    expect(solde(f5, 'xp')).toBe(120); // 300 − 90 − 40 − 50
    const r6 = examinerAchat(f5, 'caracteristique', 'ruse');
    expect(r6.ok && r6.objet.blocages.map((b) => b.code)).toEqual(['condition']);
  });

  it('le coût d’une caractéristique suit sa valeur calculée (Dévouement compris)', () => {
    const avec = fiche(
      EtatEntite.parse({
        ...e,
        possessions: [
          ...e.possessions,
          { entree: 'devouement', rang: 1, choix: { caracteristiques: ['presence'] } },
        ],
      }),
    );
    expect(avec.valeur('presence')).toBe(3);
    const r = examinerAchat(avec, 'caracteristique', 'presence');
    expect(r.ok && r.objet.cout).toBe(40);
  });
});

describe('Espèces : effets et choix', () => {
  it('Humain : XP 110 et deux rangs gratuits hors carrière', () => {
    const f = fiche(
      etat({
        possessions: [
          { entree: 'humain', choix: { polyvalence: ['charme', 'medecine'] } },
          { entree: 'contrebandier' },
        ],
      }),
    );
    expect(f.valeur('xpDepart')).toBe(110);
    expect(rang(f, 'charme')).toBe(1);
    expect(rang(f, 'medecine')).toBe(1);
    expect(f.valeur('seuilBlessure')).toBe(12);
  });

  it('Twi’lek : Charme ou Tromperie au choix', () => {
    const f = fiche(
      etat({
        possessions: [{ entree: 'twilek', choix: { 'charme-ou-tromperie': ['tromperie'] } }],
      }),
    );
    expect(rang(f, 'tromperie')).toBe(1);
    expect(rang(f, 'charme')).toBe(0);
    expect(f.valeur('presence')).toBe(3);
  });

  it('Gand avec poumons : +10 XP de départ ; Droïde : talent Endurant (+1 encaissement)', () => {
    const gand = fiche(
      etat({ possessions: [{ entree: 'gand', choix: { 'sous-espece': ['gand-avec-poumons'] } }] }),
    );
    expect(gand.valeur('xpDepart')).toBe(110);
    expect(rang(gand, 'discipline')).toBe(1);
    const droide = fiche(etat({ possessions: [{ entree: 'droide' }] }));
    expect(droide.valeur('xpDepart')).toBe(175);
    expect(rang(droide, 'endurant')).toBe(1);
    expect(droide.valeur('encaissement')).toBe(2); // Vigueur 1 + Endurant 1
  });

  it('Droïde : 6 rangs gratuits de carrière et 3 de spécialisation ; inorganique', () => {
    const choixCarriere = systeme.entrees.get('chasseur-de-primes')!.choix[0]!;
    const choixSpe = systeme.entrees.get('assassin')!.choix[0]!;
    const droide = fiche(etat({ possessions: [{ entree: 'droide' }] }));
    const humain = fiche(etat({ possessions: [{ entree: 'humain' }] }));
    expect(nombreChoix(droide, 'chasseur-de-primes', choixCarriere)).toBe(6);
    expect(nombreChoix(droide, 'assassin', choixSpe)).toBe(3);
    expect(nombreChoix(humain, 'chasseur-de-primes', choixCarriere)).toBe(4);
    expect(nombreChoix(humain, 'assassin', choixSpe)).toBe(2);
    expect(droide.valeur('inorganique')).toBe(true);
  });

  it('étiquettes de vision pour l’interface', () => {
    expect(systeme.entrees.get('chiss')!.etiquettes).toEqual(['vision-infrarouge']);
    for (const id of ['advozse', 'ongree', 'gotal', 'lannik', 'balosar'])
      expect(systeme.entrees.get(id)!.etiquettes, id).toEqual(['vision-augmentee']);
  });

  it('talents Endurci et Résistant', () => {
    const f = fiche(
      wookiee([
        { entree: 'endurci', rang: 2 },
        { entree: 'resistant', rang: 1 },
      ]),
    );
    expect(f.valeur('vigueur')).toBe(3);
    expect(f.valeur('seuilBlessure')).toBe(17); // 10 + 3 + 2 × 2
    expect(f.valeur('resistanceCritique')).toBe(10);
  });
});

describe('Combat', () => {
  const chasseur = fiche({ ...bothanChasseur(), creation: false });
  const cible = fiche(wookiee());

  it('attaque au fusil blaster : pool, dégâts moins encaissement, blessure critique', () => {
    expect(cible.valeur('encaissement')).toBe(4); // Vigueur 3 + armure légère 1
    const r = executerAction(systeme, {
      action: 'attaque',
      acteur: chasseur,
      cible,
      parametres: { arme: 'fusil-blaster', portee: 'moyenne' },
      // Fortune (Précis 1), Infortune (Défense 1), 1 Aptitude, 2 Difficulté, 2 Maîtrise, puis d100
      aleatoire: aleatoireImpose([4, 1, 4, 2, 1, 4, 12, 45]),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    const res = r.resultat;
    expect(res.erreurs).toEqual([]);
    expect(res.jet.type === 'symboles' && res.jet.pool).toEqual([
      { de: 'fortune', nombre: 1 },
      { de: 'infortune', nombre: 1 },
      { de: 'aptitude', nombre: 1 },
      { de: 'difficulte', nombre: 2 },
      { de: 'maitrise', nombre: 2 },
    ]);
    expect(res.reussi).toBe(true);
    expect(res.variables).toMatchObject({
      succesNets: 5, // 5 Succès + 1 Triomphe − 1 Échec
      avantagesNets: 1,
      triomphes: 1,
      degatsBruts: 14, // 9 + 5
      degatsSubis: 10, // 14 − Encaissement 4
      activationsCritique: 1, // Triomphe ; 1 Avantage < indice 3
      critiqueDeclenche: true,
    });
    expect(res.modifications).toEqual([
      { entite: 'cible', attribut: 'blessures', operation: 'ajouter', valeur: 10 },
    ]);
    expect(res.tables).toHaveLength(1);
    expect(res.tables[0]).toMatchObject({ table: 'blessures-critiques', valeur: 45 });
    expect(res.tables[0]!.ligne?.entree).toBe('blessure-ouverte');
  });

  it('critiques multiples : +10 par activation au-delà de la première (et Coups mortels)', () => {
    const base = bothanChasseur();
    const tueur = fiche(
      EtatEntite.parse({
        ...base,
        creation: false,
        possessions: [...base.possessions, { entree: 'coups-mortels', rang: 1 }],
      }),
    );
    expect(tueur.valeur('bonusCritique')).toBe(10);
    // Fortune (2 Avantages), Infortune vide, Aptitude (2 Avantages), 2 Difficulté vides,
    // Maîtrise (2 Succès) et Maîtrise (Triomphe), puis d100 = 45
    const r = agir(
      {
        action: 'attaque',
        acteur: tueur,
        cible,
        parametres: { arme: 'fusil-blaster', portee: 'moyenne' },
      },
      [5, 1, 8, 1, 1, 4, 12, 45],
    );
    expect(r.variables).toMatchObject({
      succesNets: 3,
      avantagesNets: 4,
      degatsSubis: 8, // 9 + 3 − 4
      activationsCritique: 2, // Triomphe + 4 Avantages / indice 3
    });
    // 45 + 10 (seconde activation) + 10 (Coups mortels) = 65
    expect(r.tables[0]).toMatchObject({ modificateur: 20, valeur: 65 });
    expect(r.tables[0]!.ligne?.entree).toBe('blessure-profonde');
  });

  it('la portée fixe la difficulté ; hors de portée ou arme non possédée, l’attaque est refusée', () => {
    const longue = agir(
      {
        action: 'attaque',
        acteur: chasseur,
        cible,
        parametres: { arme: 'fusil-blaster', portee: 'longue' },
      },
      [4, 1, 4, 1, 1, 1, 4, 12, 45],
    );
    expect(pool(longue)).toContainEqual({ de: 'difficulte', nombre: 3 });
    expect(longue.reussi).toBe(true);
    const refus = (parametres: Record<string, string>) => {
      const r = executerAction(systeme, {
        action: 'attaque',
        acteur: chasseur,
        cible,
        parametres,
        aleatoire: aleatoireImpose([]),
      });
      return !r.ok && r.erreurs.map((e) => e.message);
    };
    // Le fusil blaster porte à Longue, pas à Extrême
    expect(refus({ arme: 'fusil-blaster', portee: 'extreme' })).toEqual([
      "Cible hors de portée de l'arme",
    ]);
    // Arme du catalogue que le chasseur ne possède pas
    expect(refus({ arme: 'pistolet-blaster', portee: 'courte' })).toEqual([
      "Arme non possédée (seules les armes toujours disponibles, comme les mains nues, s'en passent)",
    ]);
    // Paramètre de compétence supprimé : l'arme suffit
    const r = executerAction(systeme, {
      action: 'attaque',
      acteur: chasseur,
      cible,
      parametres: { arme: 'fusil-blaster', portee: 'moyenne', competence: 'athletisme' },
      aleatoire: aleatoireImpose([]),
    });
    expect(r.ok).toBe(false);
  });

  it('mains nues : toujours utilisable, Corps à corps, dégâts = Vigueur', () => {
    // Vigueur 2, Corps à corps 0 : 2 Aptitude ; mêlée : 2 Difficulté ; Défense de mêlée 1
    const r = agir(
      {
        action: 'attaque',
        acteur: chasseur,
        cible,
        parametres: { arme: 'mains-nues', portee: 'engage' },
      },
      [1, 4, 4, 1, 1],
    );
    expect(pool(r)).toEqual([
      { de: 'infortune', nombre: 1 },
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 2 },
    ]);
    expect(r.variables).toMatchObject({ armeDisponible: true, succesNets: 4, degatsBruts: 6 });
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'blessures', operation: 'ajouter', valeur: 2 },
    ]);
    // Au contact seulement
    const loin = executerAction(systeme, {
      action: 'attaque',
      acteur: chasseur,
      cible,
      parametres: { arme: 'mains-nues', portee: 'courte' },
      aleatoire: aleatoireImpose([]),
    });
    expect(loin.ok).toBe(false);
  });

  it('Rage wookiee, Force sauvage et Précision mortelle en mêlée', () => {
    const wook = fiche(
      EtatEntite.parse({
        ...wookiee([
          { entree: 'vibromachette' },
          { entree: 'melee', rang: 2 },
          { entree: 'force-sauvage', rang: 1 },
          { entree: 'precision-mortelle', rang: 1, choix: { competences: ['melee'] } },
        ]),
        valeurs: { blessures: 3 },
      }),
    );
    expect(wook.valeur('bonusDegatsMelee')).toBe(2); // Rage 1 (blessé) + Force sauvage 1
    expect(
      nombreChoix(wook, 'precision-mortelle', systeme.entrees.get('precision-mortelle')!.choix[0]!),
    ).toBe(1);
    // Vigueur 3, Mêlée 2 : 1 Aptitude, 2 Maîtrises ; Défense de mêlée du Bothan 1
    const r = agir(
      {
        action: 'attaque',
        acteur: wook,
        cible: chasseur,
        parametres: { arme: 'vibromachette', portee: 'engage' },
      },
      [1, 2, 1, 1, 4, 1],
    );
    expect(r.variables).toMatchObject({
      succesNets: 3,
      degatsTalents: 4, // 2 + Précision mortelle (Mêlée 2)
      degatsBruts: 13, // Vigueur 3 + 3, + 3 Succès, + 4
      degatsSubis: 12, // − Encaissement 3, moins Perforant 2
    });
    // Blessure critique : la Rage passe à +2
    const grave = fiche(
      EtatEntite.parse({
        ...wookiee([{ entree: 'fracture', rang: 1 }]),
        valeurs: { blessures: 3 },
      }),
    );
    expect(grave.valeur('bonusDegatsMelee')).toBe(2);
    expect(fiche(wookiee()).valeur('bonusDegatsMelee')).toBe(0);
  });

  it('Bout portant et Barrage selon la bande de portée', () => {
    const base = bothanChasseur();
    const tireur = fiche(
      EtatEntite.parse({
        ...base,
        creation: false,
        possessions: [
          ...base.possessions,
          { entree: 'bout-portant', rang: 1 },
          { entree: 'barrage', rang: 2 },
        ],
      }),
    );
    const des = [1, 1, 1, 1, 1, 1, 1, 1, 1];
    const court = agir(
      {
        action: 'attaque',
        acteur: tireur,
        cible,
        parametres: { arme: 'fusil-blaster', portee: 'courte' },
      },
      des,
    );
    const loin = agir(
      {
        action: 'attaque',
        acteur: tireur,
        cible,
        parametres: { arme: 'fusil-blaster', portee: 'longue' },
      },
      des,
    );
    const moyen = agir(
      {
        action: 'attaque',
        acteur: tireur,
        cible,
        parametres: { arme: 'fusil-blaster', portee: 'moyenne' },
      },
      des,
    );
    expect([court, moyen, loin].map((r) => r.variables.degatsTalents)).toEqual([1, 0, 2]);
  });

  it('couvert et cible à terre', () => {
    const abritee = fiche(wookiee([{ entree: 'couvert-partiel' }, { entree: 'a-terre' }]));
    expect(abritee.valeur('couvert')).toBe(1);
    expect(abritee.valeur('defenseDistance')).toBe(2); // armure 1 + à terre
    const tir = agir(
      {
        action: 'attaque',
        acteur: chasseur,
        cible: abritee,
        parametres: { arme: 'fusil-blaster', portee: 'moyenne' },
      },
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
    );
    expect(pool(tir)).toEqual([
      { de: 'fortune', nombre: 1 },
      { de: 'infortune', nombre: 2 },
      { de: 'aptitude', nombre: 1 },
      { de: 'difficulte', nombre: 3 },
      { de: 'maitrise', nombre: 2 },
    ]);
    // Au contact, la cible à terre donne un dé de Fortune et le couvert ne compte pas
    const coup = agir(
      {
        action: 'attaque',
        acteur: chasseur,
        cible: abritee,
        parametres: { arme: 'mains-nues', portee: 'engage' },
      },
      [1, 1, 1, 1, 1, 1],
    );
    expect(pool(coup)).toEqual([
      { de: 'fortune', nombre: 1 },
      { de: 'infortune', nombre: 1 },
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 2 },
    ]);
  });

  it('une arme étourdissante inflige du stress et jamais de critique', () => {
    const base = bothanChasseur();
    const tireur = fiche(
      EtatEntite.parse({
        ...base,
        creation: false,
        possessions: [...base.possessions, { entree: 'canon-a-impulsion-etourdissante' }],
      }),
    );
    const r = executerAction(systeme, {
      action: 'attaque',
      acteur: tireur,
      cible,
      parametres: { arme: 'canon-a-impulsion-etourdissante', portee: 'moyenne' },
      // Infortune ×2 (Défense 1 + Inexact 1), 1 Aptitude, 2 Difficulté, 2 Maîtrise
      aleatoire: aleatoireImpose([1, 1, 4, 1, 1, 4, 12]),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    // 9 + 5 Succès nets (4 + Triomphe) − 4 = 10, en stress
    expect(r.resultat.variables).toMatchObject({
      succesNets: 5,
      degatsSubis: 10,
      critiqueDeclenche: false,
    });
    expect(r.resultat.modifications).toEqual([
      { entite: 'cible', attribut: 'stress', operation: 'ajouter', valeur: 10 },
    ]);
    expect(r.resultat.tables).toEqual([]);
    // Résolution : 1 stress de moins par rang
    const resolu = fiche(wookiee([{ entree: 'resolution', rang: 2 }]));
    const r2 = agir(
      {
        action: 'attaque',
        acteur: tireur,
        cible: resolu,
        parametres: { arme: 'canon-a-impulsion-etourdissante', portee: 'moyenne' },
      },
      [1, 1, 4, 1, 1, 4, 12],
    );
    expect(r2.variables.stressInflige).toBe(8);
  });

  it('blessures critiques : +10 par critique déjà subie, une même blessure pouvant revenir', () => {
    const blesse = fiche(
      wookiee([
        { entree: 'coupure', rang: 1 },
        { entree: 'fracture', rang: 2 },
      ]),
    );
    expect(blesse.valeur('critiquesSubis')).toBe(3);
    const t = tirerTable(systeme, 'blessures-critiques', 20, aleatoireImpose([85]));
    expect(t.valeur).toBe(105);
    expect(t.ligne?.entree).toBe('blessure-mortelle');
  });

  it('test de compétence : Traqueur ajoute un dé de Fortune en Discrétion', () => {
    const r = executerAction(systeme, {
      action: 'test',
      acteur: chasseur,
      parametres: { competence: 'discretion', difficulte: 2 },
      aleatoire: aleatoireImpose([1, 1, 1, 1, 1, 1]),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    // Agilité 3, Discrétion 1 : 2 Aptitude + 1 Maîtrise ; Traqueur rang 1 : 1 Fortune
    expect(r.resultat.jet.type === 'symboles' && r.resultat.jet.pool).toEqual([
      { de: 'fortune', nombre: 1 },
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 2 },
      { de: 'maitrise', nombre: 1 },
    ]);
    expect(r.resultat.reussi).toBe(false);
  });

  it('initiative : Vigilance, tri par Succès nets puis Avantages nets', () => {
    const r = initiative(
      systeme,
      [
        { id: 'wookiee', fiche: cible, parametres: { competence: 'vigilance' } },
        { id: 'bothan', fiche: chasseur, parametres: { competence: 'vigilance' } },
      ],
      // Wookiee (Ruse 2, Vigilance 1) : 1 Aptitude (Succès), 1 Maîtrise (vide)
      // Bothan (Ruse 3, Vigilance 1) : 2 Aptitude (Succès, Avantage), 1 Maîtrise (vide)
      aleatoireImpose([2, 1, 2, 5, 1]),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    expect(r.ordre.map((o) => [o.id, ...o.cles])).toEqual([
      ['bothan', 1, 1],
      ['wookiee', 1, 0],
    ]);
    // Sang-froid jamais appris : Présence 2, rang 0
    const sf = agir(
      { action: 'initiative', acteur: chasseur, parametres: { competence: 'sang-froid' } },
      [1, 1],
    );
    expect(pool(sf)).toEqual([{ de: 'aptitude', nombre: 2 }]);
  });
});

describe('Tests de compétence et talents', () => {
  const chasseur = fiche({ ...bothanChasseur(), creation: false });

  it('compétence jamais apprise : testée au rang 0', () => {
    const r = agir(
      { action: 'test', acteur: chasseur, parametres: { competence: 'medecine', difficulte: 1 } },
      [1, 1, 1],
    );
    expect(pool(r)).toEqual([
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 1 },
    ]);
  });

  it('Attitude convaincante (espèce) retire des dés d’Infortune en Tromperie seulement', () => {
    const trompe = agir(
      {
        action: 'test',
        acteur: chasseur,
        parametres: { competence: 'tromperie', difficulte: 2, desInfortune: 2 },
      },
      [1, 1, 1, 1, 1, 1],
    );
    expect(pool(trompe)).toContainEqual({ de: 'infortune', nombre: 1 });
    const percoit = agir(
      {
        action: 'test',
        acteur: chasseur,
        parametres: { competence: 'perception', difficulte: 2, desInfortune: 2 },
      },
      [1, 1, 1, 1, 1, 1, 1],
    );
    expect(pool(percoit)).toContainEqual({ de: 'infortune', nombre: 2 });
  });

  it('Chercheur : toutes les Connaissances ; Débrouillard : Connaissance (Pègre)', () => {
    const erudit = fiche(
      wookiee([
        { entree: 'chercheur', rang: 1 },
        { entree: 'debrouillard', rang: 1 },
      ]),
    );
    const infortune = (competence: string) =>
      pool(
        agir(
          {
            action: 'test',
            acteur: erudit,
            parametres: { competence, difficulte: 0, desInfortune: 3 },
          },
          [1, 1, 1, 1, 1],
        ),
      ).find((d) => d.de === 'infortune')?.nombre;
    expect(infortune('connaissance-xenologie')).toBe(2);
    expect(infortune('connaissance-pegre')).toBe(1);
    expect(infortune('sens-de-la-rue')).toBe(2);
    expect(infortune('survie')).toBe(3);
  });

  it('circonstance facultative : Pisteur expert, Casseur de codes, Assurance, vision du Chiss', () => {
    const pisteur = fiche(
      wookiee([
        { entree: 'pisteur-expert', rang: 2 },
        { entree: 'casseur-de-codes', rang: 1 },
        { entree: 'assurance', rang: 1 },
      ]),
    );
    const situation = (acteur: Fiche, parametres: Record<string, string | number>) =>
      pool(agir({ action: 'test', acteur, parametres }, Array(12).fill(1)));
    // Pister : 2 dés d'Infortune retirés sur 3 ; sans la circonstance, rien
    expect(
      situation(pisteur, { competence: 'survie', circonstance: 'pistage', desInfortune: 3 }),
    ).toContainEqual({ de: 'infortune', nombre: 1 });
    expect(
      situation(pisteur, { competence: 'survie', circonstance: 'terrain', desInfortune: 3 }),
    ).toContainEqual({ de: 'infortune', nombre: 3 });
    // Déchiffrer : difficulté réduite de 1
    expect(
      situation(pisteur, { competence: 'informatique', circonstance: 'dechiffrement' }),
    ).toContainEqual({ de: 'difficulte', nombre: 1 });
    // Peur : seulement en Discipline
    expect(
      situation(pisteur, { competence: 'discipline', circonstance: 'peur', difficulte: 3 }),
    ).toContainEqual({ de: 'difficulte', nombre: 2 });
    expect(
      situation(pisteur, { competence: 'coercition', circonstance: 'peur', difficulte: 3 }),
    ).toContainEqual({ de: 'difficulte', nombre: 3 });
    const chiss = fiche(etat({ possessions: [{ entree: 'chiss' }] }));
    expect(
      situation(chiss, { competence: 'perception', circonstance: 'obscurite', desInfortune: 1 }),
    ).not.toContainEqual(expect.objectContaining({ de: 'infortune' }));
  });

  it('excédent d’encombrement : Infortune aux tests d’Agilité et de Vigueur seulement', () => {
    const base = bothanChasseur();
    const charge = fiche(
      EtatEntite.parse({
        ...base,
        creation: false,
        possessions: [
          ...base.possessions,
          { entree: 'fusil-blaster-lourd' },
          { entree: 'vibromachette' },
          { entree: 'lance-grenades', actif: false }, // laissé au vaisseau
        ],
      }),
    );
    expect(charge.valeur('encombrement')).toBe(12); // 3 + 5 + 4
    expect(charge.valeur('excedentEncombrement')).toBe(5);
    expect(charge.valeur('surcharge')).toBe(true);
    const test = (competence: string) =>
      pool(
        agir(
          { action: 'test', acteur: charge, parametres: { competence, difficulte: 0 } },
          Array(10).fill(1),
        ),
      ).find((d) => d.de === 'infortune')?.nombre;
    expect(test('coordination')).toBe(5);
    expect(test('perception')).toBeUndefined();
  });

  it('Dévouement : +1 par rang à une caractéristique choisie, 6 au plus', () => {
    const w = (rang: number, valeurs = {}, choix = ['volonte', 'vigueur'].slice(0, rang)) =>
      fiche(
        EtatEntite.parse({
          ...wookiee([{ entree: 'devouement', rang, choix: { caracteristiques: choix } }]),
          valeurs,
        }),
      );
    expect([w(1).valeur('volonte'), w(1).valeur('vigueur')]).toEqual([2, 3]);
    expect([w(2).valeur('volonte'), w(2).valeur('vigueur')]).toEqual([2, 4]);
    expect(w(2, { vigueur: 3 }).valeur('vigueur')).toBe(6); // 3 + 3 + 1, plafonné
    // Un seul choix : un attribut par rang, le même pouvant revenir ; pas plus que les rangs
    expect(w(2, {}, ['vigueur', 'vigueur']).valeur('vigueur')).toBe(5);
    expect(w(1, {}, ['volonte', 'vigueur']).erreurs.map((e) => e.message)).toEqual([
      'Dévouement : +1 à une caractéristique par rang : 1 choix au plus',
    ]);
  });

  it('Maître des armures (armure portée) et Maître des armures amélioré (Encaissement 2+)', () => {
    const maitre = (armure: string, actif = true) =>
      fiche(
        etat({
          possessions: [
            { entree: 'wookiee' },
            { entree: armure, actif },
            { entree: 'maitre-des-armures', rang: 1 },
            { entree: 'maitre-des-armures-ameliore', rang: 1 },
          ],
        }),
      );
    expect(maitre('armure-legere').valeur('encaissement')).toBe(5); // 3 + 1 + 1
    expect(maitre('armure-legere').valeur('defenseDistance')).toBe(1);
    expect(maitre('armure-legere', false).valeur('encaissement')).toBe(3);
    expect(maitre('armure-lourde-de-combat').valeur('defenseMelee')).toBe(3); // 2 + 1
  });

  it('état Désorienté : 1 dé d’Infortune tant qu’il est actif', () => {
    const r = (actif: boolean) =>
      pool(
        agir(
          {
            action: 'test',
            acteur: fiche(wookiee([{ entree: 'desoriente', actif }])),
            parametres: { competence: 'athletisme', difficulte: 0 },
          },
          Array(6).fill(1),
        ),
      ).find((d) => d.de === 'infortune')?.nombre;
    expect(r(true)).toBe(1);
    expect(r(false)).toBeUndefined();
  });

  it('Obligation déclenchée : seuil de stress −1, −2 pour le personnage concerné', () => {
    expect(fiche(wookiee()).valeur('seuilStress')).toBe(11);
    expect(fiche(wookiee([{ entree: 'obligation-declenchee' }])).valeur('seuilStress')).toBe(10);
    expect(
      fiche(
        wookiee([
          { entree: 'obligation-declenchee' },
          { entree: 'obligation-personnelle-declenchee' },
        ]),
      ).valeur('seuilStress'),
    ).toBe(9);
  });

  it('Test de talent : Tête dure (Discipline, Intimidant − 1 par rang)', () => {
    const tetu = fiche(wookiee([{ entree: 'tete-dure', rang: 2 }]));
    const r = agir(
      { action: 'talent', acteur: tetu, parametres: { talent: 'tete-dure' } },
      [1, 1, 1],
    );
    expect(pool(r)).toEqual([
      { de: 'aptitude', nombre: 1 }, // Volonté 1, Discipline 0
      { de: 'difficulte', nombre: 2 },
    ]);
    // Un talent sans test n'est pas proposé
    const cran = executerAction(systeme, {
      action: 'talent',
      acteur: fiche(wookiee([{ entree: 'cran', rang: 1 }])),
      parametres: { talent: 'cran' },
      aleatoire: aleatoireImpose([]),
    });
    expect(cran.ok).toBe(false);
  });

  it('Polyvalent : deux compétences de carrière par rang', () => {
    const f = fiche(wookiee([{ entree: 'polyvalent', rang: 2 }]));
    expect(nombreChoix(f, 'polyvalent', systeme.entrees.get('polyvalent')!.choix[0]!)).toBe(4);
  });
});

describe('Soins et récupération', () => {
  const medecin = fiche(
    etat({
      possessions: [
        { entree: 'bothan' },
        { entree: 'chirurgien', rang: 1 },
        { entree: 'stimpack' },
      ],
    }),
  );
  const blesse = fiche(
    etat({ possessions: [{ entree: 'wookiee' }], valeurs: { blessures: 10, stress: 2 } }),
  );

  it('Médecine : difficulté selon les blessures, Chirurgien, stress soigné par les Avantages', () => {
    expect(blesse.valeur('seuilBlessure')).toBe(13);
    // Intellect 2 : 2 Aptitude (2 Succès ; 1 Succès 1 Avantage) ; 10 > 13 / 2 : Moyen
    const r = agir(
      { action: 'soins', acteur: medecin, cible: blesse, parametres: { competence: 'medecine' } },
      [4, 7, 1, 1],
    );
    expect(pool(r)).toEqual([
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 2 },
    ]);
    expect(r.variables).toMatchObject({ blessuresSoignees: 4, stressSoigne: 1 });
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'blessures', operation: 'retirer', valeur: 4 },
      { entite: 'cible', attribut: 'stress', operation: 'retirer', valeur: 1 },
    ]);
    // Blessures au seuil : pas encore neutralisé, Moyen ; au-delà (non plafonnées) : Difficile
    const auSeuil = fiche(
      etat({ possessions: [{ entree: 'wookiee' }], valeurs: { blessures: 13 } }),
    );
    expect(auSeuil.valeur('neutralise')).toBe(false);
    const ko = fiche(etat({ possessions: [{ entree: 'wookiee' }], valeurs: { blessures: 15 } }));
    expect(ko.valeur('blessures')).toBe(15);
    expect(ko.valeur('neutralise')).toBe(true);
    const r2 = agir(
      { action: 'soins', acteur: medecin, cible: ko, parametres: { competence: 'medecine' } },
      [1, 1, 1, 1, 1],
    );
    expect(pool(r2)).toContainEqual({ de: 'difficulte', nombre: 3 });
  });

  it('un droïde se répare avec Mécanique, pas avec Médecine ni stimpack', () => {
    const droide = fiche(etat({ possessions: [{ entree: 'droide' }], valeurs: { blessures: 3 } }));
    const med = agir(
      { action: 'soins', acteur: medecin, cible: droide, parametres: { competence: 'medecine' } },
      [4, 4, 1],
    );
    expect(med.reussi).toBe(true);
    expect(med.modifications).toEqual([]);
    const meca = agir(
      { action: 'soins', acteur: medecin, cible: droide, parametres: { competence: 'mecanique' } },
      [4, 4, 1],
    );
    expect(meca.variables.blessuresSoignees).toBe(3); // Chirurgien ne s'applique qu'à Médecine
    const stim = agir({ action: 'stimpack', acteur: medecin, cible: droide }, []);
    expect(stim.modifications).toEqual([]);
  });

  it('stimpack : 5 blessures, 1 de moins par stimpack du jour ; il faut en posséder un', () => {
    const deja = fiche(
      etat({
        possessions: [{ entree: 'wookiee' }],
        valeurs: { blessures: 10, stimpacksDuJour: 1 },
      }),
    );
    const r = agir({ action: 'stimpack', acteur: medecin, cible: deja }, []);
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'blessures', operation: 'retirer', valeur: 4 },
      { entite: 'cible', attribut: 'stimpacksDuJour', operation: 'ajouter', valeur: 1 },
    ]);
    const sans = executerAction(systeme, {
      action: 'stimpack',
      acteur: fiche(wookiee()),
      cible: deja,
      aleatoire: aleatoireImpose([]),
    });
    expect(sans.ok).toBe(false);
  });

  it('récupération de stress : Succès nets + Récupération rapide', () => {
    const fatigue = fiche(
      etat({
        possessions: [{ entree: 'wookiee' }, { entree: 'recuperation-rapide', rang: 1 }],
        valeurs: { stress: 6 },
      }),
    );
    // Volonté 1 : 1 Aptitude (2 Succès), sans dé de Difficulté
    const r = agir(
      { action: 'recuperation', acteur: fatigue, parametres: { competence: 'discipline' } },
      [4],
    );
    expect(r.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'retirer', valeur: 3 },
    ]);
  });
});

/** Messages de refus d'une action (ou `false` si elle est acceptée). */
function refus(demande: Omit<Parameters<typeof executerAction>[1], 'aleatoire'>) {
  const r = executerAction(systeme, { ...demande, aleatoire: aleatoireImpose([]) });
  return !r.ok && r.erreurs.map((e) => e.message);
}
/** Wookiee avec des talents et des valeurs stockées. */
const wook = (extra: EtatEntiteSaisi['possessions'] = [], valeurs = {}) =>
  fiche(EtatEntite.parse({ ...wookiee(extra), valeurs }));
const vide = Array(12).fill(1);

describe('Options de talents : tests de compétence', () => {
  const acteur = wook([
    { entree: 'maitre-pirate', rang: 1 },
    { entree: 'intimidant', rang: 2 },
    { entree: 'concentration-intense', rang: 1 },
    { entree: 'coup-de-genie', rang: 1 },
  ]);
  const test = (parametres: Record<string, string | number | boolean>) =>
    agir({ action: 'test', acteur, parametres }, vide);

  it('Maître pirate : 2 stress pour 1 dé de Difficulté de moins, jamais sous Facile', () => {
    const r = test({ competence: 'informatique', difficulte: 2, maitre: true });
    expect(pool(r)).toContainEqual({ de: 'difficulte', nombre: 1 });
    expect(r.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 2 },
    ]);
    expect(
      refus({
        action: 'test',
        acteur,
        parametres: { competence: 'informatique', difficulte: 1, maitre: true },
      }),
    ).toEqual(['Maître pirate, Maître astronavigateur : la difficulté ne descend pas sous Facile']);
    // Pas de Maître pour la Médecine, et l'option est réservée aux possesseurs
    expect(
      refus({ action: 'test', acteur, parametres: { competence: 'medecine', maitre: true } }),
    ).toEqual(["Aucun talent de Maître ne s'applique à cette compétence"]);
    const r2 = refus({
      action: 'test',
      acteur: wook(),
      parametres: { competence: 'informatique', maitre: true },
    });
    expect(r2 && r2[0]).toMatch(/option non disponible/);
  });

  it('Intimidant : stress pour réduire la difficulté de la Coercition, au plus un par rang', () => {
    const r = test({ competence: 'coercition', difficulte: 3, intimidant: 2 });
    expect(pool(r)).toContainEqual({ de: 'difficulte', nombre: 1 });
    expect(r.variables.stressActeur).toBe(2);
    expect(
      refus({ action: 'test', acteur, parametres: { competence: 'coercition', intimidant: 3 } }),
    ).toEqual(['Intimidant : au plus un point de stress par rang']);
    expect(
      refus({ action: 'test', acteur, parametres: { competence: 'charme', intimidant: 1 } }),
    ).toEqual(['Intimidant ne réduit que la difficulté des tests de Coercition']);
  });

  it('Concentration intense (1 stress, une amélioration) et Coup de génie (Intellect)', () => {
    // Vigueur 3, Athlétisme 0 : 3 Aptitude, dont une améliorée
    const c = test({ competence: 'athletisme', difficulte: 0, concentrationIntense: true });
    expect(pool(c)).toEqual([
      { de: 'aptitude', nombre: 2 },
      { de: 'maitrise', nombre: 1 },
    ]);
    expect(c.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 1 },
    ]);
    // Intellect 2 au lieu de la Vigueur
    const g = test({ competence: 'athletisme', difficulte: 0, coupDeGenie: true });
    expect(pool(g)).toEqual([{ de: 'aptitude', nombre: 2 }]);
    expect(g.modifications).toEqual([]);
  });
});

describe('Test contre un personnage : talents défensifs de la cible', () => {
  const chasseur = fiche({ ...bothanChasseur(), creation: false });
  const cible = wook([
    { entree: 'pas-ne-d-hier', rang: 2 },
    { entree: 'anonyme', rang: 1 },
    { entree: 'piratage-defensif', rang: 2 },
    { entree: 'intimidant', rang: 1 },
  ]);
  const contre = (c: Fiche, parametres: Record<string, string | number>) =>
    agir({ action: 'test-cible', acteur: chasseur, cible: c, parametres }, vide);

  it('Pas né d’hier et Anonyme améliorent la difficulté ; Piratage défensif ajoute de l’Infortune', () => {
    expect(pool(contre(cible, { competence: 'tromperie', difficulte: 2 }))).toContainEqual({
      de: 'defi',
      nombre: 2,
    });
    expect(pool(contre(cible, { competence: 'perception', difficulte: 2 }))).toContainEqual({
      de: 'difficulte',
      nombre: 2,
    });
    const identifier = pool(
      contre(cible, { competence: 'perception', circonstance: 'identification', difficulte: 2 }),
    );
    expect(identifier).toContainEqual({ de: 'defi', nombre: 1 });
    expect(identifier).toContainEqual({ de: 'difficulte', nombre: 1 });
    expect(pool(contre(cible, { competence: 'informatique', difficulte: 2 }))).toContainEqual({
      de: 'infortune',
      nombre: 2,
    });
    // Piratage défensif amélioré : la difficulté est améliorée au lieu des dés d'Infortune
    const expert = wook([
      { entree: 'piratage-defensif', rang: 2 },
      { entree: 'piratage-defensif-ameliore', rang: 1 },
    ]);
    const p = pool(contre(expert, { competence: 'informatique', difficulte: 2 }));
    expect(p).toContainEqual({ de: 'defi', nombre: 2 });
    expect(p).not.toContainEqual(expect.objectContaining({ de: 'infortune' }));
    // Le même test sans cible n'est pas concerné
    expect(
      pool(
        agir({ action: 'test', acteur: chasseur, parametres: { competence: 'tromperie' } }, vide),
      ),
    ).toContainEqual({ de: 'difficulte', nombre: 2 });
  });

  it('Intimidant de la cible : stress qu’elle subit pour améliorer la difficulté de la Coercition', () => {
    const r = contre(cible, { competence: 'coercition', difficulte: 2, intimidantCible: 1 });
    expect(pool(r)).toContainEqual({ de: 'defi', nombre: 2 }); // Pas né d'hier 2 + Intimidant 1
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'stress', operation: 'ajouter', valeur: 1 },
    ]);
    expect(
      refus({
        action: 'test-cible',
        acteur: chasseur,
        cible,
        parametres: { competence: 'coercition', intimidantCible: 2 },
      }),
    ).toEqual(["Intimidant de la cible : au plus un point de stress par rang d'Intimidant"]);
  });
});

describe('Options de talents : combat', () => {
  const chasseur = fiche({ ...bothanChasseur(), creation: false }); // Visée précise 1
  const tir = (
    acteur: Fiche,
    cible: Fiche,
    parametres: Record<string, string | number | boolean>,
  ) => agir({ action: 'attaque', acteur, cible, parametres }, vide);
  const auBlaster = { arme: 'fusil-blaster', portee: 'moyenne' };

  it('Esquive : la cible subit du stress (au plus ses rangs) pour améliorer la difficulté', () => {
    const esquiveur = wook([{ entree: 'esquive', rang: 2 }]);
    const r = tir(chasseur, esquiveur, { ...auBlaster, esquive: 2 });
    expect(pool(r)).toEqual([
      { de: 'fortune', nombre: 1 },
      { de: 'infortune', nombre: 1 },
      { de: 'aptitude', nombre: 1 },
      { de: 'maitrise', nombre: 2 },
      { de: 'defi', nombre: 2 },
    ]);
    expect(r.reussi).toBe(false);
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'stress', operation: 'ajouter', valeur: 2 },
    ]);
    expect(
      refus({
        action: 'attaque',
        acteur: chasseur,
        cible: esquiveur,
        parametres: { ...auBlaster, esquive: 3 },
      }),
    ).toEqual(["Esquive : la cible subit au plus un point de stress par rang d'Esquive"]);
    expect(
      refus({
        action: 'attaque',
        acteur: chasseur,
        cible: wook(),
        parametres: { ...auBlaster, esquive: 1 },
      }),
    ).toHaveLength(1);
  });

  it('Défense active : Pas de côté contre les tirs, Posture défensive contre la mêlée', () => {
    const agile = wook([
      { entree: 'pas-de-cote', rang: 2 },
      { entree: 'posture-defensive', rang: 1 },
    ]);
    const manoeuvre = (talent: string, stressSubi: number) =>
      agir({ action: 'defense-active', acteur: agile, parametres: { talent, stressSubi } }, []);
    expect(manoeuvre('pas-de-cote', 2).modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 2 },
      { entite: 'acteur', attribut: 'pasDeCote', operation: 'fixer', valeur: 2 },
    ]);
    expect(manoeuvre('pas-de-cote', 0).modifications).toEqual([
      { entite: 'acteur', attribut: 'pasDeCote', operation: 'fixer', valeur: 0 },
    ]);
    expect(
      refus({
        action: 'defense-active',
        acteur: agile,
        parametres: { talent: 'posture-defensive', stressSubi: 2 },
      }),
    ).toEqual(['Au plus un point de stress par rang du talent']);
    // L'état est appliqué, puis lu par les attaques qui le visent
    const enGarde = fiche(
      appliquerModifications(
        agile,
        [
          ...manoeuvre('pas-de-cote', 2).modifications,
          ...manoeuvre('posture-defensive', 1).modifications,
        ],
        'acteur',
      ),
    );
    expect([enGarde.valeur('stress'), enGarde.valeur('pasDeCote')]).toEqual([3, 2]);
    expect(pool(tir(chasseur, enGarde, auBlaster))).toContainEqual({ de: 'defi', nombre: 2 });
    const coup = pool(tir(chasseur, enGarde, { arme: 'mains-nues', portee: 'engage' }));
    expect(coup).toContainEqual({ de: 'defi', nombre: 1 });
    expect(coup).toContainEqual({ de: 'difficulte', nombre: 1 });
  });

  it('Protecteur : garde un allié, dont les attaques reçues sont améliorées', () => {
    const garde = wook([{ entree: 'protecteur', rang: 1 }]);
    const r = agir(
      { action: 'protecteur', acteur: garde, cible: chasseur, parametres: { stressSubi: 1 } },
      [],
    );
    expect(r.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 1 },
      { entite: 'cible', attribut: 'protection', operation: 'fixer', valeur: 1 },
    ]);
    const protege = wook([], { protection: 1 });
    expect(pool(tir(chasseur, protege, auBlaster))).toContainEqual({ de: 'defi', nombre: 1 });
    expect(
      refus({
        action: 'protecteur',
        acteur: garde,
        cible: chasseur,
        parametres: { stressSubi: 2 },
      }),
    ).toEqual(['Protecteur : au plus un point de stress par rang']);
  });

  it('Visée précise, Viser, Visée parfaite, Frappe rapide, Tir de précision, Coup handicapant', () => {
    // Visée précise 1 : la Défense 1 de la cible disparaît pour 1 stress
    const vise = tir(chasseur, wook(), { ...auBlaster, viseePrecise: 1 });
    expect(pool(vise)).not.toContainEqual(expect.objectContaining({ de: 'infortune' }));
    expect(vise.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 1 },
    ]);
    expect(
      refus({
        action: 'attaque',
        acteur: chasseur,
        cible: wook(),
        parametres: { ...auBlaster, viseePrecise: 2 },
      }),
    ).toEqual(['Visée précise : au plus un point de stress par rang']);

    const base = bothanChasseur();
    const tireur = fiche(
      EtatEntite.parse({
        ...base,
        creation: false,
        possessions: [
          ...base.possessions,
          { entree: 'visee-parfaite', rang: 1 },
          { entree: 'frappe-rapide', rang: 1 },
          { entree: 'tir-de-precision', rang: 1 },
          { entree: 'coup-handicapant', rang: 1 },
        ],
      }),
    );
    // Précis 1 + Viser 1 + Visée parfaite 1 + Frappe rapide 1 ; Agilité 3, rang 2, 1 amélioration
    const r = tir(tireur, wook(), {
      ...auBlaster,
      visee: 1,
      viseeParfaite: true,
      frappeRapide: true,
    });
    expect(pool(r)).toEqual([
      { de: 'fortune', nombre: 4 },
      { de: 'infortune', nombre: 1 },
      { de: 'difficulte', nombre: 2 },
      { de: 'maitrise', nombre: 3 },
    ]);
    expect(r.modifications).toEqual([]);
    // Tir de précision : le fusil blaster (Longue) porte à Extrême, difficulté améliorée d'autant
    const loin = pool(
      tir(tireur, wook(), { arme: 'fusil-blaster', portee: 'extreme', tirDePrecision: 1 }),
    );
    expect(loin).toContainEqual({ de: 'difficulte', nombre: 3 });
    expect(loin).toContainEqual({ de: 'defi', nombre: 1 });
    expect(
      refus({
        action: 'attaque',
        acteur: tireur,
        cible: wook(),
        parametres: { arme: 'mains-nues', portee: 'engage', tirDePrecision: 1 },
      }),
    ).toEqual(['Tir de précision : attaques à distance, hors armes de jet']);
    expect(
      refus({
        action: 'attaque',
        acteur: tireur,
        cible: wook(),
        parametres: { ...auBlaster, visee: 3 },
      }),
    ).toEqual(['Viser : deux manœuvres au plus']);
    // Coup handicapant : +1 dé de Difficulté
    expect(pool(tir(tireur, wook(), { ...auBlaster, coupHandicapant: true }))).toContainEqual({
      de: 'difficulte',
      nombre: 3,
    });
  });

  it('Attaque frénétique, Coup étourdissant, Point de pression et point de Destin', () => {
    const cogneur = wook([
      { entree: 'vibromachette' },
      { entree: 'pistolet-blaster' },
      { entree: 'melee', rang: 2 },
      { entree: 'medecine', rang: 1 },
      { entree: 'attaque-frenetique', rang: 2 },
      { entree: 'coup-etourdissant', rang: 1 },
      { entree: 'point-de-pression', rang: 1 },
      { entree: 'lecons-d-anatomie', rang: 1 },
    ]);
    const lame = { arme: 'vibromachette', portee: 'engage' };
    // Vigueur 3, Mêlée 2 : 1 Aptitude et 2 Maîtrises ; 2 améliorations pour 2 stress, la seconde
    // sans dé d'Aptitude restant en ajoute un
    const fr = tir(cogneur, chasseur, { ...lame, attaqueFrenetique: 2 });
    expect(pool(fr)).toEqual([
      { de: 'infortune', nombre: 1 },
      { de: 'aptitude', nombre: 1 },
      { de: 'difficulte', nombre: 2 },
      { de: 'maitrise', nombre: 3 },
    ]);
    expect(fr.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 2 },
    ]);
    expect(
      refus({
        action: 'attaque',
        acteur: cogneur,
        cible: chasseur,
        parametres: { arme: 'pistolet-blaster', portee: 'courte', attaqueFrenetique: 1 },
      }),
    ).toEqual(['Attaque frénétique : tests de Mêlée ou de Corps à corps seulement']);

    // Infortune, Aptitude (2 Succès), 2 Difficulté, 2 Maîtrises (2 Succès chacune) : 6 Succès
    const touche = [1, 4, 1, 1, 4, 4];
    const attaque = (parametres: Record<string, string | boolean>) =>
      agir({ action: 'attaque', acteur: cogneur, cible: chasseur, parametres }, touche);
    // Coup étourdissant : 3 + 3 + 6 = 12, − (Encaissement 3 − Perforant 2) = 11 en stress
    const etourdi = attaque({ ...lame, coupEtourdissant: true });
    expect(etourdi.variables).toMatchObject({ degatsSubis: 11, critiqueDeclenche: false });
    expect(etourdi.modifications).toEqual([
      { entite: 'cible', attribut: 'stress', operation: 'ajouter', valeur: 11 },
    ]);
    // Leçons d'anatomie (point de Destin) : + Intellect 2
    const destin = attaque({ ...lame, degatsDestin: 'lecons-d-anatomie' });
    expect(destin.modifications).toEqual([
      { entite: 'cible', attribut: 'blessures', operation: 'ajouter', valeur: 13 },
    ]);
    expect(
      refus({
        action: 'attaque',
        acteur: cogneur,
        cible: chasseur,
        parametres: { ...lame, degatsDestin: 'point-faible' },
      }),
    ).toHaveLength(1);
    // Point de pression, mains nues : Vigueur 3 + 4 Succès = 7, sans Encaissement, + Médecine 1
    const pression = agir(
      {
        action: 'attaque',
        acteur: cogneur,
        cible: chasseur,
        parametres: { arme: 'mains-nues', portee: 'engage', pointDePression: true },
      },
      [1, 4, 4, 1, 1, 1],
    );
    expect(pression.modifications).toEqual([
      { entite: 'cible', attribut: 'stress', operation: 'ajouter', valeur: 8 },
    ]);
    expect(
      refus({
        action: 'attaque',
        acteur: cogneur,
        cible: chasseur,
        parametres: { arme: 'mains-nues', portee: 'engage', coupEtourdissant: true },
      }),
    ).toEqual(['Coup étourdissant : tests de Mêlée seulement']);
  });

  it('blessure critique appliquée à la cible : entrée, puis un rang de plus', () => {
    const r = agir(
      { action: 'attaque', acteur: chasseur, cible: wook(), parametres: auBlaster },
      [4, 1, 4, 2, 1, 4, 12, 45],
    );
    let e = wook().etat;
    e = appliquerTirage(systeme, e, r.tables[0]!);
    e = appliquerTirage(systeme, e, r.tables[0]!);
    const blesse = fiche(e);
    expect(rang(blesse, 'blessure-ouverte')).toBe(2);
    expect(blesse.valeur('critiquesSubis')).toBe(2);
  });
});

describe('Options de talents : initiative, Test de talent, récupération', () => {
  it('Réaction rapide : stress pour autant de dés de Fortune à l’Initiative', () => {
    const vif = wook([{ entree: 'reaction-rapide', rang: 2 }]);
    const r = agir(
      {
        action: 'initiative',
        acteur: vif,
        parametres: { competence: 'vigilance', reactionRapide: 2 },
      },
      vide,
    );
    expect(pool(r)).toContainEqual({ de: 'fortune', nombre: 2 });
    expect(r.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 2 },
    ]);
  });

  it('Tête dure améliorée : neutralisé par le stress, la réussite le ramène à 1 sous le seuil', () => {
    const tetu = (stress: number) =>
      wook(
        [
          { entree: 'tete-dure', rang: 2 },
          { entree: 'tete-dure-amelioree', rang: 1 },
        ],
        { stress },
      );
    expect(tetu(13).valeur('stress')).toBe(13); // non plafonné
    expect(tetu(13).valeur('neutralise')).toBe(true);
    // Formidable − 2 rangs de Tête dure : 3 dés ; Volonté 1 : 1 Aptitude (2 Succès)
    const r = agir(
      { action: 'talent', acteur: tetu(13), parametres: { talent: 'tete-dure-amelioree' } },
      [4, 1, 1, 1],
    );
    expect(pool(r)).toContainEqual({ de: 'difficulte', nombre: 3 });
    expect(r.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'fixer', valeur: 10 },
    ]);
    expect(
      refus({ action: 'talent', acteur: tetu(5), parametres: { talent: 'tete-dure-amelioree' } }),
    ).toEqual(['Tête dure améliorée : seulement neutralisé par un stress au-delà du seuil']);
  });

  it('Rhétorique inspirante suprême (1 stress, en manœuvre) ; Autorité lit la compétence du talent', () => {
    const orateur = wook([
      { entree: 'rhetorique-inspirante', rang: 1 },
      { entree: 'rhetorique-inspirante-supreme', rang: 1 },
      { entree: 'autorite', rang: 2 },
    ]);
    const r = agir(
      {
        action: 'talent',
        acteur: orateur,
        parametres: { talent: 'rhetorique-inspirante', enManoeuvre: true },
      },
      vide,
    );
    expect(pool(r)).toEqual([
      { de: 'fortune', nombre: 2 }, // Autorité 2 : test de Commandement
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 2 },
    ]);
    expect(r.modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 1 },
    ]);
  });

  it('Second souffle et Présence intense : stress récupéré, jamais sous 0', () => {
    const f = (stress: number) =>
      wook(
        [
          { entree: 'second-souffle', rang: 2 },
          { entree: 'presence-intense', rang: 1 },
        ],
        { stress },
      );
    expect(agir({ action: 'second-souffle', acteur: f(5) }, []).modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'retirer', valeur: 2 },
    ]);
    expect(agir({ action: 'presence-intense', acteur: f(1) }, []).modifications).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'retirer', valeur: 1 },
    ]);
    expect(refus({ action: 'second-souffle', acteur: wook() })).toHaveLength(1);
  });
});

describe('Obligation', () => {
  it('détail libre, étape facultative, Obligation supplémentaire payée en XP', () => {
    const f = fiche(
      etat({
        creation: true,
        possessions: [
          { entree: 'humain' },
          {
            entree: 'dette',
            champs: { valeur: 15, supplement: 5, detail: 'Doit 20 000 crédits à Jabba' },
          },
        ],
      }),
    );
    expect(f.valeur('obligation')).toBe(15);
    expect(solde(f, 'xp')).toBe(115); // 110 + 5
    const etape = systeme.source.creation[0]!.etapes.find((x) => x.id === 'obligation');
    expect(etape).toMatchObject({ min: 0 });
  });
});

describe('Véhicules', () => {
  it('le modèle fixe les statistiques ; coque et tension montent depuis 0', () => {
    const f = fiche(etat({ possessions: [{ entree: 'cargo-leger-yt-1300' }] }, 'vehicule'));
    expect(f.erreurs).toEqual([]);
    expect(f.valeur('silhouette')).toBe(4);
    expect(f.valeur('vitesse')).toBe(3);
    expect(f.valeur('maniabilite')).toBe(-1);
    expect(f.valeur('defenseAvant')).toBe(1);
    expect(f.valeur('defenseArriere')).toBe(1);
    expect(f.valeur('blindage')).toBe(3);
    expect(f.valeurs.get('coque')).toMatchObject({ valeur: 0, max: 22 });
    expect(f.valeurs.get('tension')).toMatchObject({ valeur: 0, max: 15 });
  });

  it('dommages critiques à rangs', () => {
    const f = fiche(
      etat(
        {
          possessions: [
            { entree: 'cargo-leger-yt-1300' },
            { entree: 'dommage-cosmetique', rang: 2 },
          ],
        },
        'vehicule',
      ),
    );
    expect(f.valeur('critiquesSubis')).toBe(2);
  });

  it('défense à quatre arcs (Av/Bâ/Tr/Ar)', () => {
    const f = fiche(etat({ possessions: [{ entree: 'corvette-cr90' }] }, 'vehicule'));
    expect(
      ['defenseAvant', 'defenseBabord', 'defenseTribord', 'defenseArriere'].map((k) => f.valeur(k)),
    ).toEqual([2, 1, 1, 2]);
  });
});
