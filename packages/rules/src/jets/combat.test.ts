/**
 * Briques du combat (docs/combat.md § 14) : jet commun à plusieurs cibles, réactions de la
 * cible, coûts de l'acteur comptés une fois, ajustements libres, issue imposée, vue de
 * l'acteur, hors de combat, dés planifiés. Tout est déterministe : mêmes dés, même résultat.
 */
import { describe, expect, it } from 'vitest';
import { calculer, type Fiche } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { aleatoireGraine, aleatoireImpose, type Generateur } from '../formules/index.js';
import {
  EtatEntite,
  verifierPresentation,
  type EtatEntiteSaisi,
  type SystemeSaisi,
} from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import {
  aleatoirePlanifie,
  appliquerTirage,
  DesRequis,
  estHorsCombat,
  executerAction,
  executerMulticible,
  ligneDeTable,
  modeDeJet,
  parametresReaction,
  vueActeur,
  type CibleEnAttente,
  type DeRequis,
  type ResultatAction,
  type ResultatMulticible,
} from './index.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

const base = miniD20.entites![0]!;

/** Mini d20 de combat : zone à jet commun, réaction de la cible, coût de l'acteur, table. */
const combatD20: SystemeSaisi = {
  ...miniD20,
  id: 'mini-combat',
  entites: [
    {
      ...base,
      attributs: [
        ...base.attributs,
        { cle: 'stress', nom: 'Stress', nature: 'ressource', max: 10, initiale: 'min' },
      ],
      horsCombat: '@PV <= 0',
    },
  ],
  sortes: [
    ...miniD20.sortes!,
    { id: 'etat', nom: 'État', pour: ['personnage'] },
    { id: 'talent', nom: 'Talent', pour: ['personnage'], rangs: { max: 3 } },
  ],
  catalogue: [
    ...miniD20.catalogue!,
    { id: 'mort-vivant', sorte: 'etat', nom: 'Mort-vivant' },
    { id: 'blesse', sorte: 'etat', nom: 'Blessé' },
    { id: 'esquive', sorte: 'talent', nom: 'Esquive' },
    {
      id: 'bouclier',
      sorte: 'etat',
      nom: 'Bouclier magique',
      effets: [{ sur: 'jet', cote: 'cible', ajout: { bonus: -2 }, description: 'Bouclier' }],
    },
  ],
  actions: [
    ...miniD20.actions!,
    {
      id: 'boule-de-feu',
      nom: 'Boule de feu',
      pour: ['personnage'],
      cible: 'personnage',
      multicible: { jet: 'commun' },
      jet: { type: 'numerique', formule: '1d20', reussite: 'total >= @cible.Defense' },
      apres: [
        {
          cle: 'degats',
          nom: 'Dégâts',
          visibilite: 'acteur',
          formule: '2d6 + si(cible_possede("mort-vivant"), 1d6, 0)',
        },
        { cle: 'subis', formule: 'si(reussi, degats, floor(degats / 2))' },
      ],
      consequences: [
        { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 'subis' },
        { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 1 },
      ],
    },
    {
      id: 'frappe',
      nom: 'Frappe',
      pour: ['personnage'],
      cible: 'personnage',
      parametres: [
        { id: 'puissance', nom: 'Puissance', type: 'nombre', defaut: 0 },
        {
          id: 'esquive',
          nom: 'Esquive de la cible',
          type: 'nombre',
          defaut: 0,
          par: 'cible',
          exige: 'possede("esquive")',
        },
      ],
      variables: [{ cle: 'defenseCible', formule: '@cible.Defense + esquive' }],
      jet: {
        type: 'numerique',
        formule: '1d20 + puissance',
        reussite: 'total >= defenseCible',
        critique: 'naturel == 20',
      },
      apres: [{ cle: 'degats', nom: 'Dégâts', visibilite: 'acteur', formule: '1d8' }],
      consequences: [
        {
          condition: 'reussi',
          entite: 'cible',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 'degats',
        },
        {
          condition: 'esquive > 0',
          entite: 'cible',
          attribut: 'stress',
          operation: 'ajouter',
          valeur: 'esquive',
        },
      ],
      tables: [{ table: 'critiques', condition: 'critique' }],
    },
    // Attaque en deux étapes : pas de dégâts sur un raté, dés doublés sur un critique
    {
      id: 'epee',
      nom: 'Épée',
      pour: ['personnage'],
      cible: 'personnage',
      jet: {
        type: 'numerique',
        formule: '1d20',
        reussite: 'total >= @cible.Defense',
        critique: 'naturel == 20',
      },
      apres: [
        {
          cle: 'degats',
          nom: 'Dégâts',
          visibilite: 'acteur',
          formule: 'si(reussi, multiplier_des(si(critique, 2, 1), 1d8), 0)',
        },
      ],
      consequences: [
        {
          condition: 'reussi',
          entite: 'cible',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 'degats',
        },
      ],
      tables: [{ table: 'critiques', condition: 'critique' }],
    },
    {
      id: 'frappe-explosive',
      nom: 'Frappe explosive',
      pour: ['personnage'],
      cible: 'personnage',
      jet: { type: 'numerique', formule: '1d20', reussite: 'total >= @cible.Defense' },
      apres: [
        { cle: 'degats', nom: 'Dégâts', visibilite: 'acteur', formule: 'si(reussi, 1d6!, 0)' },
      ],
      consequences: [{ entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 'degats' }],
    },
    {
      id: 'soin-fixe',
      nom: 'Soin fixe',
      pour: ['personnage'],
      cible: 'personnage',
      jet: { type: 'numerique', formule: '0' },
      consequences: [{ entite: 'cible', attribut: 'PV', operation: 'ajouter', valeur: 3 }],
    },
  ],
  tables: [
    {
      id: 'critiques',
      nom: 'Critiques',
      jet: '1d10 + modificateur',
      lignes: [
        { min: 1, max: 5, nom: 'Égratignure' },
        { min: 6, max: 10, nom: 'Blessure', entree: 'blesse' },
      ],
    },
  ],
  initiative: { action: 'attaque', tri: ['total'] },
};

const s = systeme(combatD20);

function fiche(o: Partial<EtatEntiteSaisi> = {}): Fiche {
  const etat = EtatEntite.parse({
    type: 'personnage',
    systeme: { id: 'mini-combat', version: '1.0.0' },
    creation: false,
    ...o,
  });
  return calculer(s, etat);
}

const mage = fiche({ valeurs: { FOR: 12 } });
const gobelin = fiche({ valeurs: { DEX: 10 } }); // Défense 10
const zombie = fiche({ valeurs: { DEX: 14 }, possessions: [{ entree: 'mort-vivant', rang: 0 }] }); // 12
const agile = fiche({ valeurs: { DEX: 16 }, possessions: [{ entree: 'esquive', rang: 1 }] }); // 13

function reussie(r: ResultatMulticible) {
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r;
}
function resultat(r: ResultatMulticible, id: string): ResultatAction {
  const c = reussie(r).cibles.find((x) => x.id === id);
  if (!c?.ok) throw new Error(`Cible ${id} non résolue`);
  return c.resultat;
}
const des = (r: ResultatAction) =>
  r.jet.type === 'numerique' ? r.jet.jets.flatMap((j) => j.des.map((d) => d.valeur)) : [];

describe('schéma : briques du combat', () => {
  it('mode d’initiative individuel par défaut, créneaux déclarables', () => {
    expect(s.source.initiative?.mode).toBe('individuel');
    const creneaux = systeme({
      ...combatD20,
      initiative: { action: 'attaque', tri: ['total'], mode: 'creneaux' },
    });
    expect(creneaux.source.initiative?.mode).toBe('creneaux');
  });

  it('refuse le multicible d’une action sans cible et un horsCombat mal typé', () => {
    const r = charger({
      ...combatD20,
      entites: [{ ...combatD20.entites![0]!, horsCombat: '@PV' }],
      actions: [
        {
          id: 'seul',
          nom: 'Seul',
          pour: ['personnage'],
          multicible: { jet: 'commun' },
          jet: { type: 'numerique', formule: '1d20' },
        },
      ],
      initiative: undefined,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const chemins = r.erreurs.map((e) => e.chemin);
    expect(chemins).toContain('actions/seul/multicible');
    expect(chemins).toContain('entites/personnage/horsCombat');
  });

  it('valeurs visibles de l’acteur : `mj` par défaut', () => {
    const a = s.actions.get('boule-de-feu')!;
    expect(a.apres.map((v) => v.visibilite)).toEqual(['acteur', 'mj']);
    expect(modeDeJet(a)).toBe('commun');
    expect(modeDeJet(s.actions.get('frappe')!)).toBe('par-cible');
  });

  it('présentation du combat vérifiée contre le système', () => {
    const ok = verifierPresentation(
      {
        format: 1,
        systeme: 'mini-combat',
        combat: {
          groupes: [{ titre: 'Sorts', actions: ['boule-de-feu'] }],
          etats: { sortes: ['etat'], icones: { 'mort-vivant': 'malediction' } },
        },
      },
      s,
    );
    expect(ok.ok).toBe(true);
    const ko = verifierPresentation(
      {
        format: 1,
        systeme: 'mini-combat',
        combat: {
          groupes: [
            { titre: 'A', actions: ['boule-de-feu', 'inconnue'] },
            { titre: 'B', actions: ['boule-de-feu'] },
          ],
          etats: { sortes: ['etat'], icones: { esquive: 'etat' } },
        },
      },
      s,
    );
    expect(ko.ok).toBe(false);
    if (ko.ok) return;
    expect(ko.erreurs.map((e) => e.message)).toEqual([
      'Action inconnue : inconnue',
      'boule-de-feu est déjà dans un autre groupe',
      'esquive n’est pas un état (sorte talent)',
    ]);
  });
});

describe('executerMulticible', () => {
  it('est déterministe : même graine, même résultat', () => {
    const jouer = () =>
      executerMulticible(s, {
        action: 'boule-de-feu',
        acteur: mage,
        cibles: [
          { id: 'g', fiche: gobelin },
          { id: 'z', fiche: zombie },
        ],
        aleatoire: aleatoireGraine('boule'),
      });
    expect(jouer()).toEqual(jouer());
  });

  it('jet commun : mêmes dés pour toutes les cibles, un dé propre à une seule', () => {
    // d20 = 11 ; 2d6 = 3, 4 ; d6 du mort-vivant = 6
    const r = executerMulticible(s, {
      action: 'boule-de-feu',
      acteur: mage,
      cibles: [
        { id: 'g', fiche: gobelin },
        { id: 'z', fiche: zombie },
      ],
      aleatoire: aleatoireImpose([11, 3, 4, 6]),
    });
    expect(reussie(r).jet).toBe('commun');
    const g = resultat(r, 'g');
    const z = resultat(r, 'z');
    expect(des(g)).toEqual([11]);
    expect(des(z)).toEqual([11]);
    // Touché (11 ≥ 10) : 7 dégâts ; raté (11 < 12) : moitié de 7 + 6
    expect(g.reussi).toBe(true);
    expect(g.variables.degats).toBe(7);
    expect(z.reussi).toBe(false);
    expect(z.variables.degats).toBe(13);
    expect(z.variables.subis).toBe(6);
  });

  it('jet par cible : chaque cible lance ses dés', () => {
    const r = executerMulticible(s, {
      action: 'boule-de-feu',
      acteur: mage,
      cibles: [
        { id: 'g', fiche: gobelin },
        { id: 'z', fiche: zombie },
      ],
      jet: 'par-cible',
      aleatoire: aleatoireImpose([11, 3, 4, 15, 1, 1, 2]),
    });
    expect(des(resultat(r, 'g'))).toEqual([11]);
    expect(des(resultat(r, 'z'))).toEqual([15]);
    expect(resultat(r, 'z').variables.degats).toBe(4);
  });

  it('coûts de l’acteur comptés une fois, modifications de la cible par cible', () => {
    const r = reussie(
      executerMulticible(s, {
        action: 'boule-de-feu',
        acteur: mage,
        cibles: [
          { id: 'g', fiche: gobelin },
          { id: 'z', fiche: zombie },
        ],
        aleatoire: aleatoireGraine(1),
      }),
    );
    expect(r.acteur).toEqual([
      { entite: 'acteur', attribut: 'stress', operation: 'ajouter', valeur: 1 },
    ]);
    for (const c of r.cibles) {
      if (!c.ok) throw new Error('refus');
      expect(c.resultat.modifications.every((m) => m.entite === 'cible')).toBe(true);
    }
  });

  it('réaction de la cible : proposée selon son `exige`, jamais prise à l’acteur', () => {
    expect(parametresReaction(s, 'frappe', agile)).toEqual(['esquive']);
    expect(parametresReaction(s, 'frappe', gobelin)).toEqual([]);
    const r = executerMulticible(s, {
      action: 'frappe',
      acteur: mage,
      // L'esquive envoyée par l'acteur est ignorée ; celle de la réaction compte
      parametres: { puissance: 2, esquive: 5 },
      cibles: [
        { id: 'a', fiche: agile, reaction: { esquive: 2 } },
        { id: 'g', fiche: gobelin },
      ],
      aleatoire: aleatoireImpose([12, 3, 12, 3]),
    });
    const a = resultat(r, 'a');
    const g = resultat(r, 'g');
    expect(a.parametres.esquive).toBe(2);
    expect(a.variables.defenseCible).toBe(15);
    expect(a.reussi).toBe(false);
    expect(a.modifications).toEqual([
      { entite: 'cible', attribut: 'stress', operation: 'ajouter', valeur: 2 },
    ]);
    expect(g.parametres.esquive).toBe(0);
    expect(g.reussi).toBe(true);
  });

  it('une cible refusée n’empêche pas les autres', () => {
    const r = reussie(
      executerMulticible(s, {
        action: 'frappe',
        acteur: mage,
        cibles: [
          // Esquive sans le talent : option refusée pour cette cible seulement
          { id: 'g', fiche: gobelin, reaction: { esquive: 1 } },
          { id: 'a', fiche: agile },
        ],
        aleatoire: aleatoireGraine(3),
      }),
    );
    expect(r.cibles.map((c) => [c.id, c.ok])).toEqual([
      ['g', false],
      ['a', true],
    ]);
  });

  it('plafond de cibles de l’action', () => {
    const plafond = systeme({
      ...combatD20,
      actions: combatD20.actions!.map((a) =>
        a.id === 'boule-de-feu' ? { ...a, multicible: { jet: 'commun', max: 1 } } : a,
      ),
    });
    const r = executerMulticible(plafond, {
      action: 'boule-de-feu',
      acteur: calculer(plafond, mage.etat),
      cibles: [
        { id: 'g', fiche: calculer(plafond, gobelin.etat) },
        { id: 'z', fiche: calculer(plafond, zombie.etat) },
      ],
      aleatoire: aleatoireGraine(1),
    });
    expect(r).toEqual({ ok: false, erreurs: [{ message: 'Boule de feu : 1 cible(s) au plus' }] });
  });
});

describe('ajustements libres et issue imposée', () => {
  it('bonus libre au total, marqué « ajusté »', () => {
    const r = executerAction(s, {
      action: 'frappe',
      acteur: mage,
      cible: gobelin,
      ajustements: { bonus: 3 },
      aleatoire: aleatoireImpose([5, 4]),
    });
    if (!r.ok) throw new Error('refus');
    expect(r.resultat.ajuste).toBe(true);
    if (r.resultat.jet.type !== 'numerique') throw new Error('numérique attendu');
    expect(r.resultat.jet.total).toBe(8);
    expect(r.resultat.jet.bonus).toEqual([
      { source: 'ajustement', nom: 'Ajusté à la main', valeur: 3, cote: 'acteur' },
    ]);
  });

  it('dés à symboles ajoutés et retirés à la main', () => {
    const sym = systeme(miniSymboles);
    const etat = EtatEntite.parse({
      type: 'personnage',
      systeme: { id: 'mini-symboles', version: '1.0.0' },
      creation: false,
      possessions: [{ entree: 'athletisme', rang: 1 }],
    });
    const f = calculer(sym, etat);
    const action = sym.source.actions.find((a) => a.jet.type === 'symboles')!;
    const r = executerAction(sym, {
      action: action.id,
      acteur: f,
      parametres: { competence: 'athletisme', difficulte: 2 },
      ajustements: {
        des: [
          { de: 'difficulte', nombre: -1 },
          { de: 'aptitude', nombre: 1 },
        ],
      },
      aleatoire: aleatoireGraine(4),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    if (r.resultat.jet.type !== 'symboles') throw new Error('symboles attendus');
    const n = (de: string) =>
      r.resultat.jet.type === 'symboles'
        ? (r.resultat.jet.pool.find((p) => p.de === de)?.nombre ?? 0)
        : 0;
    expect(n('difficulte')).toBe(1);
    expect(r.resultat.jet.construction.filter((e) => e.source === 'ajustement')).toHaveLength(2);
    expect(r.resultat.explications).toContain('Ajusté à la main : − 1 Difficulté');
  });

  it('refuse un dé inconnu dans les ajustements', () => {
    const sym = systeme(miniSymboles);
    const action = sym.source.actions.find((a) => a.jet.type === 'symboles')!;
    const f = calculer(
      sym,
      EtatEntite.parse({
        type: 'personnage',
        systeme: { id: 'mini-symboles', version: '1.0.0' },
        possessions: [{ entree: 'athletisme', rang: 1 }],
      }),
    );
    const r = executerAction(sym, {
      action: action.id,
      acteur: f,
      parametres: { competence: 'athletisme' },
      ajustements: { des: [{ de: 'force', nombre: 1 }] },
      aleatoire: aleatoireGraine(1),
    });
    expect(r.ok).toBe(false);
  });

  it('issue imposée : mêmes dés, réussite et critique corrigés', () => {
    const r = executerAction(s, {
      action: 'frappe',
      acteur: mage,
      cible: agile,
      forcer: { reussi: true, critique: true },
      aleatoire: aleatoireImpose([2, 5, 7]),
    });
    if (!r.ok) throw new Error('refus');
    expect(r.resultat.reussi).toBe(true);
    expect(r.resultat.force).toBe(true);
    expect(r.resultat.variables.critique).toBe(true);
    expect(r.resultat.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 5 },
    ]);
    // Critique imposé : la table est tirée (d10 = 7 → Blessure)
    expect(r.resultat.tables[0]?.ligne?.entree).toBe('blesse');
  });
});

describe('vueActeur', () => {
  it('garde les dés, l’issue et les valeurs visibles ; anonymise la défense de la cible', () => {
    const cible = fiche({
      valeurs: { DEX: 10 },
      possessions: [
        { entree: 'bouclier', rang: 0 },
        { entree: 'esquive', rang: 1 },
      ],
    });
    const r = executerAction(s, {
      action: 'frappe',
      acteur: mage,
      cible,
      parametres: { esquive: 1 },
      aleatoire: aleatoireImpose([14, 6]),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    const v = vueActeur(s, r.resultat);
    expect(v.reussi).toBe(true);
    if (v.jet.type !== 'numerique') throw new Error('numérique attendu');
    expect(v.jet.jets[0]!.des[0]!.valeur).toBe(14);
    expect(v.jet.bonus).toEqual([
      { source: 'cible', nom: 'Défense de la cible', valeur: -2, cote: 'cible' },
    ]);
    expect(v.valeurs).toEqual([{ cle: 'degats', nom: 'Dégâts', valeur: 6 }]);
    const texte = v.explications.join('\n');
    expect(texte).toContain('Défense de la cible : − 2');
    expect(texte).toContain('Dégâts : 6');
    // Ni la défense de la cible, ni son nom d'effet, ni ses modifications
    expect(texte).not.toContain('Bouclier');
    expect(texte).not.toContain('defenseCible');
    expect(texte).not.toContain('Cible :');
    expect(JSON.stringify(v)).not.toContain('"PV"');
  });
});

describe('estHorsCombat', () => {
  it('formule du type d’entité, absente : pas de détection', () => {
    expect(estHorsCombat(fiche({ valeurs: { PV: 3 } }))).toBe(false);
    expect(estHorsCombat(fiche({ valeurs: { PV: 0 } }))).toBe(true);
    const sans = systeme(miniD20);
    const f = calculer(
      sans,
      EtatEntite.parse({ type: 'personnage', systeme: { id: 'mini-d20', version: '1.0.0' } }),
    );
    expect(estHorsCombat(f)).toBeUndefined();
  });
});

describe('tables appliquées sans relance', () => {
  it('l’entrée d’une ligne tirée ou choisie est donnée telle quelle', () => {
    expect(ligneDeTable(s, 'critiques', 'blesse')?.nom).toBe('Blessure');
    expect(ligneDeTable(s, 'critiques', 'mort-vivant')).toBeUndefined();
    const etat = appliquerTirage(s, gobelin.etat, { ligne: { entree: 'blesse' } });
    expect(etat.possessions.map((p) => p.entree)).toContain('blesse');
  });
});

describe('dés planifiés (dés physiques)', () => {
  const cibles = [
    { id: 'g', fiche: gobelin },
    { id: 'z', fiche: zombie },
  ];
  const jouer = (faces: Record<string, number>, commun = true) =>
    executerMulticible(s, {
      action: 'boule-de-feu',
      acteur: mage,
      cibles,
      jet: commun ? 'commun' : 'par-cible',
      aleatoire: aleatoirePlanifie({ faces, commun }),
    });

  it('demande les dés phase par phase, puis rend le même résultat que le serveur', () => {
    const r1 = reussie(jouer({}));
    expect(r1.cibles).toEqual([]);
    expect(r1.requis).toEqual([{ id: 'jet:d20:0', phase: 'jet', faces: 20 }]);

    const r2 = reussie(jouer({ 'jet:d20:0': 11 }));
    expect(r2.requis).toEqual([
      { id: 'apres:d6:0', phase: 'apres', faces: 6 },
      { id: 'apres:d6:1', phase: 'apres', faces: 6 },
      // Seul le mort-vivant le demande : il est lancé pour lui
      { id: 'apres:d6:2', phase: 'apres', faces: 6, cible: 'z' },
    ]);

    const faces = { 'jet:d20:0': 11, 'apres:d6:0': 3, 'apres:d6:1': 4, 'apres:d6:2': 6 };
    const physique = reussie(jouer(faces));
    expect(physique.requis).toEqual([]);
    const serveur = executerMulticible(s, {
      action: 'boule-de-feu',
      acteur: mage,
      cibles,
      aleatoire: aleatoireImpose([11, 3, 4, 6]),
    });
    expect(physique).toEqual(serveur);
  });

  it('jet par cible : identifiants préfixés par la cible', () => {
    const r = reussie(jouer({}, false));
    expect(r.requis).toEqual([
      { id: '0:jet:d20:0', phase: 'jet', faces: 20, cible: 'g' },
      { id: '1:jet:d20:0', phase: 'jet', faces: 20, cible: 'z' },
    ]);
  });

  it('repli : les dés manquants sont tirés et notés', () => {
    const plan = aleatoirePlanifie({
      faces: { 'jet:d20:0': 11 },
      commun: true,
      repli: aleatoireImpose([3, 4, 6]),
    });
    const r = reussie(
      executerMulticible(s, { action: 'boule-de-feu', acteur: mage, cibles, aleatoire: plan }),
    );
    expect(r.requis).toEqual([]);
    expect(plan.tires).toEqual({ 'apres:d6:0': 3, 'apres:d6:1': 4, 'apres:d6:2': 6 });
  });

  it('une face hors du dé est refusée', () => {
    expect(() => jouer({ 'jet:d20:0': 21 })).toThrow(/hors de 1..20/);
  });

  it('DesRequis porte les dés à lancer', () => {
    const g: Generateur = aleatoirePlanifie({ faces: {}, commun: true }).pour('x', 0);
    g.entier(20);
    expect(() => g.phase?.('apres')).toThrow(DesRequis);
  });
});

describe('étapes de dés : une phase qui demande des dés est une étape', () => {
  /** Joue l'attaque étape par étape : les faces de chaque étape viennent de `lancer`. */
  function parEtapes(
    sys: SystemeCharge,
    demande: Omit<Parameters<typeof executerMulticible>[1], 'aleatoire'>,
    lancer: (d: DeRequis) => number,
  ) {
    const commun = (demande.jet ?? modeDeJet(sys.actions.get(demande.action)!)) === 'commun';
    const faces: Record<string, number> = {};
    const etapes: { des: DeRequis[]; enAttente: CibleEnAttente[]; finies: string[] }[] = [];
    for (let i = 0; i < 10; i++) {
      const r = reussie(
        executerMulticible(sys, { ...demande, aleatoire: aleatoirePlanifie({ faces, commun }) }),
      );
      if (!r.requis.length) return { etapes, final: r, faces };
      etapes.push({
        des: r.requis,
        enAttente: r.enAttente,
        finies: r.cibles.map((c) => c.id),
      });
      for (const d of r.requis) faces[d.id] = lancer(d);
    }
    throw new Error('Trop d’étapes');
  }

  it('jet par cible, deux cibles : le d20 de chacune, puis les dégâts de la seule touchée', () => {
    const d20 = { '0:jet:d20:0': 15, '1:jet:d20:0': 3 };
    const { etapes, final, faces } = parEtapes(
      s,
      {
        action: 'epee',
        acteur: mage,
        cibles: [
          { id: 'g', fiche: gobelin },
          { id: 'z', fiche: zombie },
        ],
      },
      (d) => (d.id in d20 ? d20[d.id as keyof typeof d20] : 5),
    );
    expect(etapes.map((e) => e.des)).toEqual([
      [
        { id: '0:jet:d20:0', phase: 'jet', faces: 20, cible: 'g' },
        { id: '1:jet:d20:0', phase: 'jet', faces: 20, cible: 'z' },
      ],
      // Le zombie est raté : seuls les dés du gobelin touché sont lancés
      [{ id: '0:apres:d8:0', phase: 'apres', faces: 8, cible: 'g' }],
    ]);
    // Étape 1 : aucune issue n'est connue avant le d20
    expect(etapes[0]!.enAttente.map((c) => [c.id, c.phase, c.partiel])).toEqual([
      ['g', 'jet', null],
      ['z', 'jet', null],
    ]);
    // Étape 2 : le raté est fini ; le touché attend ses dégâts, son jet est déjà exact
    expect(etapes[1]!.finies).toEqual(['z']);
    const [g] = etapes[1]!.enAttente;
    expect(g).toMatchObject({ id: 'g', phase: 'apres', partiel: { reussi: true } });
    expect(g!.partiel!.jet).toMatchObject({ type: 'numerique', total: 15 });
    expect(g!.partiel!.variables.degats).toBeUndefined();
    expect(g!.partiel!.modifications).toEqual([]);
    // La vue de l'attaquant sur l'étape 1 : l'issue, sans dégâts
    expect(vueActeur(s, g!.partiel!)).toMatchObject({ reussi: true, valeurs: [] });

    // Même résultat que le serveur qui tire tout d'un coup, dans le même ordre
    expect(final.cibles.map((c) => c.id)).toEqual(['g', 'z']);
    expect(resultat(final, 'g').variables.degats).toBe(5);
    expect(resultat(final, 'z').reussi).toBe(false);
    const serveur = executerMulticible(s, {
      action: 'epee',
      acteur: mage,
      cibles: [
        { id: 'g', fiche: gobelin },
        { id: 'z', fiche: zombie },
      ],
      aleatoire: aleatoireImpose([15, 5, 3]),
    });
    expect(final).toEqual(serveur);
    expect(Object.keys(faces)).toHaveLength(3);
  });

  it('raté partout : une seule étape, pas de dégâts', () => {
    const { etapes, final } = parEtapes(
      s,
      {
        action: 'epee',
        acteur: mage,
        cibles: [
          { id: 'g', fiche: gobelin },
          { id: 'z', fiche: zombie },
        ],
      },
      () => 2,
    );
    expect(etapes).toHaveLength(1);
    expect(final.enAttente).toEqual([]);
    expect(final.cibles.map((c) => c.ok && c.resultat.reussi)).toEqual([false, false]);
  });

  it('jet commun (boule de feu) : un d20, puis les dés communs et ceux propres à une cible', () => {
    const { etapes, final } = parEtapes(
      s,
      {
        action: 'boule-de-feu',
        acteur: mage,
        cibles: [
          { id: 'g', fiche: gobelin },
          { id: 'z', fiche: zombie },
        ],
      },
      () => 4,
    );
    expect(etapes.map((e) => e.des.map((d) => [d.id, d.cible ?? null]))).toEqual([
      [['jet:d20:0', null]],
      [
        ['apres:d6:0', null],
        ['apres:d6:1', null],
        ['apres:d6:2', 'z'],
      ],
    ]);
    // Coûts de l'acteur : une fois, à la fin seulement
    expect(final.acteur).toEqual([
      expect.objectContaining({ entite: 'acteur', attribut: 'stress', valeur: 1 }),
    ]);
  });

  it('critique : dés de dégâts doublés, puis la table (étape « tables ») ; mêmes faces, même résultat', () => {
    const { etapes, final, faces } = parEtapes(
      s,
      { action: 'epee', acteur: mage, cibles: [{ id: 'g', fiche: gobelin }] },
      (d) => (d.phase === 'jet' ? 20 : d.phase === 'apres' ? 6 : 7),
    );
    expect(etapes.map((e) => e.des.map((d) => [d.id, d.phase]))).toEqual([
      [['0:jet:d20:0', 'jet']],
      [
        ['0:apres:d8:0', 'apres'],
        ['0:apres:d8:1', 'apres'],
      ],
      [['0:tables:d10:0', 'tables']],
    ]);
    // Avant la table : le jet, les dégâts et leurs modifications sont exacts
    const [avant] = etapes[2]!.enAttente;
    expect(avant).toMatchObject({ phase: 'tables', partiel: { variables: { degats: 12 } } });
    expect(avant!.partiel!.modifications).toEqual([
      expect.objectContaining({ attribut: 'PV', valeur: 12 }),
    ]);
    expect(avant!.partiel!.tables).toEqual([]);
    expect(resultat(final, 'g').tables.map((t) => t.ligne?.nom)).toEqual(['Blessure']);
    // Rejouer les mêmes faces rend exactement le même résultat
    const rejoue = executerMulticible(s, {
      action: 'epee',
      acteur: mage,
      cibles: [{ id: 'g', fiche: gobelin }],
      aleatoire: aleatoirePlanifie({ faces, commun: false }),
    });
    expect(rejoue).toEqual(final);
  });

  it('explosion : le dé qui explose en demande un autre, à une nouvelle étape de la même phase', () => {
    const { etapes, final } = parEtapes(
      s,
      { action: 'frappe-explosive', acteur: mage, cibles: [{ id: 'g', fiche: gobelin }] },
      (d) => (d.phase === 'jet' ? 18 : d.id === '0:apres:d6:0' ? 6 : 2),
    );
    expect(etapes.map((e) => e.des.map((d) => d.id))).toEqual([
      ['0:jet:d20:0'],
      ['0:apres:d6:0'],
      ['0:apres:d6:1'],
    ]);
    expect(resultat(final, 'g').variables.degats).toBe(8);
  });

  it('repli du serveur : tout le reste est tiré, sans étape', () => {
    const plan = aleatoirePlanifie({
      faces: { '0:jet:d20:0': 20 },
      commun: false,
      repli: aleatoireImpose([6, 6, 7]),
    });
    const r = reussie(
      executerMulticible(s, {
        action: 'epee',
        acteur: mage,
        cibles: [{ id: 'g', fiche: gobelin }],
        aleatoire: plan,
      }),
    );
    expect(r.requis).toEqual([]);
    expect(plan.tires).toEqual({ '0:apres:d8:0': 6, '0:apres:d8:1': 6, '0:tables:d10:0': 7 });
  });

  it('une action sans dé n’a aucune étape', () => {
    const r = reussie(
      executerMulticible(s, {
        action: 'soin-fixe',
        acteur: mage,
        cibles: [{ id: 'g', fiche: gobelin }],
        aleatoire: aleatoirePlanifie({ faces: {}, commun: false }),
      }),
    );
    expect(r.requis).toEqual([]);
    expect(r.cibles).toHaveLength(1);
  });
});
