/**
 * Star Wars — Aux confins de l'Empire : chargement du système et personnages
 * de référence. Les valeurs attendues sont calculées à la main depuis les
 * règles legacy (coûts de progression, seuils, pools de dés).
 */
import { describe, expect, it } from 'vitest';
import {
  acheter,
  aleatoireImpose,
  calculer,
  EtatEntite,
  examinerAchat,
  executerAction,
  initiative,
  solde,
  tirerTable,
  type EtatEntiteSaisi,
  type Fiche,
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
    ['caracteristique-agilite', 'agilite'], // 2 → 3 : 30 XP
    ['caracteristique-vigueur', 'vigueur'], // 1 → 2 : 20 XP
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
    expect(parSorte('arme')).toHaveLength(29);
    expect(parSorte('armure')).toHaveLength(11);
    expect(parSorte('objet')).toHaveLength(17);
    expect(parSorte('accessoire')).toHaveLength(11);
    expect(parSorte('devise')).toHaveLength(6);
    expect(parSorte('modele')).toHaveLength(34);
    expect(parSorte('obligation')).toHaveLength(12);
    expect(parSorte('blessureCritique')).toHaveLength(12);
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
    expect([...systeme.actions.keys()]).toEqual(['test', 'attaque', 'initiative']);
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
    expect(f.valeur('encaissement')).toBe(3);
    expect(f.valeur('defenseDistance')).toBe(1);
    expect(f.valeur('defenseMelee')).toBe(1);
    expect(f.valeur('encombrement')).toBe(8); // fusil 3 + armure 3 + combinaison 2
    expect(f.valeur('seuilEncombrement')).toBe(7);
    expect(f.valeur('surcharge')).toBe(true);
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
    // Caractéristique : 10 × la nouvelle valeur (espèce comprise), jusqu'à 5
    expect(cout(f, 'caracteristique-ruse', 'ruse').cout).toBe(40);
    expect(cout(f, 'caracteristique-vigueur', 'vigueur').cout).toBe(30);
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
      ['caracteristique-ruse', 'ruse'], // 3 → 4 : 40 XP
      ['caracteristique-ruse', 'ruse'], // 4 → 5 : 50 XP
    ]);
    const f5 = fiche(r);
    expect(f5.valeur('ruse')).toBe(5);
    expect(solde(f5, 'xp')).toBe(120); // 300 − 90 − 40 − 50
    const r6 = examinerAchat(f5, 'caracteristique-ruse', 'ruse');
    expect(r6.ok && r6.objet.blocages.map((b) => b.code)).toEqual(['condition']);
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
      parametres: { arme: 'fusil-blaster', competence: 'distance-lourde', difficulte: 2 },
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
      critiqueDeclenche: true, // Triomphe
    });
    expect(res.modifications).toEqual([
      { entite: 'cible', attribut: 'blessures', operation: 'ajouter', valeur: 10 },
    ]);
    expect(res.tables).toHaveLength(1);
    expect(res.tables[0]).toMatchObject({ table: 'blessures-critiques', valeur: 45 });
    expect(res.tables[0]!.ligne?.entree).toBe('blessure-ouverte');
  });

  it('l’attaque exige une compétence de combat (étiquette « combat »)', () => {
    const r = executerAction(systeme, {
      action: 'attaque',
      acteur: chasseur,
      cible,
      parametres: { arme: 'fusil-blaster', competence: 'athletisme' },
      aleatoire: aleatoireImpose([]),
    });
    expect(r.ok).toBe(false);
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
      parametres: { arme: 'canon-a-impulsion-etourdissante', competence: 'distance-lourde' },
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
  });

  it('blessures critiques : +10 par critique déjà subie', () => {
    const blesse = fiche(wookiee([{ entree: 'coupure' }, { entree: 'fracture' }]));
    expect(blesse.valeur('critiquesSubis')).toBe(2);
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

  it('défense à quatre arcs (Av/Bâ/Tr/Ar)', () => {
    const f = fiche(etat({ possessions: [{ entree: 'corvette-cr90' }] }, 'vehicule'));
    expect(
      ['defenseAvant', 'defenseBabord', 'defenseTribord', 'defenseArriere'].map((k) => f.valeur(k)),
    ).toEqual([2, 1, 1, 2]);
  });
});
