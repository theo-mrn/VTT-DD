/**
 * D&D classique : le système se charge, et des personnages de référence donnent
 * les valeurs de l'ancienne app (legacy/src/modules/builtin/dnd-classic et les
 * règles codées en dur de l'interface : création, voies, montée de niveau).
 */
import { describe, expect, it } from 'vitest';
import {
  aleatoireImpose,
  appliquerModifications,
  calculer,
  chemins,
  EtatEntite,
  executerAction,
  initiative,
  type EtatEntiteSaisi,
  type Fiche,
  type Valeur,
} from '@vtt/rules';
import { chargerSource } from './test-utils.js';

const systeme = chargerSource('dnd-classic');

const mod = (v: number) => Math.floor((v - 10) / 2);

function fiche(saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>): Fiche {
  const etat = EtatEntite.parse({
    type: 'personnage',
    systeme: { id: 'dnd-classic', version: '1.0.0' },
    ...saisi,
  });
  const f = calculer(systeme, etat);
  expect(f.erreurs).toEqual([]);
  return f;
}

const val = (f: Fiche, cle: string) => f.valeur(cle);
const modif = (f: Fiche, cle: string) => f.valeurs.get(cle)?.modificateur;

// ─── Personnages de référence ───────────────────────────────────────────────

/** Nain guerrier niveau 1, en cotte de mailles avec un petit bouclier. */
const thorin = () =>
  fiche({
    valeurs: { FOR: 14, DEX: 12, CON: 16, SAG: 10, INT: 8, CHA: 13, niveau: 1, jetsDeVie: 7 },
    possessions: [
      { entree: 'nain' },
      { entree: 'guerrier' },
      { entree: 'guerrier-resistance', rang: 2 },
      { entree: 'cotte-de-mailles' },
      { entree: 'petit-bouclier' },
      { entree: 'epee-longue' },
    ],
  });

/** Elfe magicienne niveau 4, blessée. */
const elaria = (possessions: EtatEntiteSaisi['possessions'] = [], valeurs = {}) =>
  fiche({
    valeurs: {
      FOR: 9,
      DEX: 14,
      CON: 10,
      SAG: 18,
      INT: 15,
      CHA: 8,
      niveau: 4,
      jetsDeVie: 14,
      PV: 9,
      ...valeurs,
    },
    possessions: [{ entree: 'elfe' }, { entree: 'magicien' }, ...(possessions ?? [])],
  });

/** Minotaure barbare niveau 1. */
const grok = (possessions: EtatEntiteSaisi['possessions'] = []) =>
  fiche({
    valeurs: { FOR: 15, DEX: 11, CON: 13, SAG: 12, INT: 10, CHA: 11, niveau: 1, jetsDeVie: 12 },
    possessions: [{ entree: 'minotaure' }, { entree: 'barbare' }, ...(possessions ?? [])],
  });

// ─── Chargement et catalogue ────────────────────────────────────────────────

describe('dnd-classic : chargement', () => {
  it('se charge sans erreur, avec races, profils, voies et équipement', () => {
    const parSorte = (s: string) => [...systeme.entrees.values()].filter((e) => e.sorte === s);
    expect(systeme.source.id).toBe('dnd-classic');
    expect(parSorte('race')).toHaveLength(10);
    expect(parSorte('profil')).toHaveLength(16);
    expect(parSorte('voie')).toHaveLength(80 + 13 + 34);
    expect(parSorte('arme')).toHaveLength(19);
    expect(parSorte('armure')).toHaveLength(18);
    expect(systeme.source.textes.map((t) => t.titre)).toContain('Glossaire des règles');
  });

  it('chaque profil a son dé de vie et 5 voies, chaque race sa voie raciale', () => {
    const desDeVie: Record<string, number> = {
      barbare: 12,
      barde: 8,
      chevalier: 10,
      druide: 8,
      ensorceleur: 4,
      forgesort: 6,
      guerrier: 10,
      invocateur: 6,
      magicien: 6,
      moine: 8,
      necromancien: 6,
      pretre: 8,
      psionique: 6,
      rodeur: 10,
      samourai: 8,
      voleur: 6,
    };
    for (const [id, de] of Object.entries(desDeVie)) {
      const p = systeme.entrees.get(id)!;
      expect(p.champs.deVie, id).toBe(de);
      const voies = p.champs.voies as string[];
      expect(voies, id).toHaveLength(5);
      for (const v of voies) expect(systeme.entrees.get(v)?.etiquettes).toContain(id);
    }
    for (const r of [...systeme.entrees.values()].filter((e) => e.sorte === 'race')) {
      expect(systeme.entrees.get(String(r.champs.voie))?.sorte, r.id).toBe('voie');
    }
  });

  it('modificateurs raciaux identiques à race.json', () => {
    const raciaux: Record<string, Record<string, number>> = {
      ame_forgee: { CON: 2, CHA: -2 },
      elfe: { FOR: -2, CHA: 2 },
      elfe_noir: { FOR: -2, DEX: 2 },
      elfe_sylvain: { FOR: -2, DEX: 2 },
      humain: {},
      nain: { DEX: -2, CON: 2 },
      minotaure: { FOR: 4, INT: -4, CHA: -2 },
      halfelin: { FOR: -2, DEX: 2 },
      orque: { FOR: 2, INT: -2, CHA: -2 },
      drakonide: { FOR: 2, SAG: -2 },
    };
    for (const [race, mods] of Object.entries(raciaux)) {
      const f = fiche({ possessions: [{ entree: race }] });
      for (const c of ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA']) {
        expect(val(f, c), `${race} ${c}`).toBe(10 + (mods[c] ?? 0));
      }
    }
  });
});

// ─── Parité avec l'ancien module (sans race ni profil) ──────────────────────

describe('dnd-classic : parité avec legacy dnd-classic', () => {
  const base = { FOR: 14, DEX: 12, CON: 16, SAG: 10, INT: 8, CHA: 13, niveau: 1 };

  it('modificateurs = floor((v − 10) / 2)', () => {
    const f = fiche({ valeurs: base });
    for (const [c, v] of Object.entries(base)) {
      if (c !== 'niveau') expect(modif(f, c), c).toBe(mod(v));
    }
  });

  it('Défense, Contact, Distance, Magie, INIT au niveau 1', () => {
    const f = fiche({ valeurs: base });
    expect(val(f, 'Defense')).toBe(10 + mod(12));
    expect(val(f, 'Contact')).toBe(1 + mod(14));
    expect(val(f, 'Distance')).toBe(1 + mod(12));
    expect(val(f, 'Magie')).toBe(1 + mod(13));
    expect(val(f, 'INIT')).toBe(12);
  });

  it('Contact, Distance et Magie ajoutent niveau − 1', () => {
    const f = fiche({ valeurs: { ...base, niveau: 4 } });
    expect(val(f, 'Contact')).toBe(1 + mod(14) + 3);
    expect(val(f, 'Distance')).toBe(1 + mod(12) + 3);
    expect(val(f, 'Magie')).toBe(1 + mod(13) + 3);
  });

  it('Magie prend la meilleure caractéristique mentale', () => {
    const f = fiche({ valeurs: { ...base, SAG: 18, CHA: 8 } });
    expect(val(f, 'Magie')).toBe(1 + mod(18));
  });

  it('PV absents : démarrent au maximum ; PV stockés conservés', () => {
    expect(val(fiche({ valeurs: { ...base, jetsDeVie: 9 } }), 'PV')).toBe(1 + mod(16) + 9);
    expect(val(fiche({ valeurs: { ...base, jetsDeVie: 9, PV: 5 } }), 'PV')).toBe(5);
  });

  it('bonus actif ajouté aux stats dérivées de combat', () => {
    const f = fiche({
      valeurs: base,
      possessions: [{ entree: 'bonus-inventaire', champs: { Contact: 3 } }],
    });
    expect(val(f, 'Contact')).toBe(1 + mod(14) + 3);
  });
});

// ─── Personnages de référence ───────────────────────────────────────────────

describe('dnd-classic : personnages de référence', () => {
  it('Thorin, nain guerrier niveau 1', () => {
    const f = thorin();
    expect([val(f, 'DEX'), val(f, 'CON')]).toEqual([10, 18]);
    expect(['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((c) => modif(f, c))).toEqual([
      2, 0, 4, 0, -1, 1,
    ]);
    expect(val(f, 'Defense')).toBe(10 + 0 + 5 + 1);
    expect(val(f, 'Contact')).toBe(3);
    expect(val(f, 'Distance')).toBe(1);
    expect(val(f, 'Magie')).toBe(2);
    expect(val(f, 'INIT')).toBe(10);
    expect(val(f, 'deVie')).toBe(10);
    expect(val(f, 'PV_Max')).toBe(1 + 4 + 7);
    expect(val(f, 'PV')).toBe(12);
    expect(f.possessions.get('guerrier-resistance')?.rang).toBe(2);

    // Explications : le bonus racial et l'équipement sont tracés
    const dex = f.valeurs.get('DEX')!.detail;
    expect(dex).toContainEqual(expect.objectContaining({ source: 'nain', valeur: -2 }));
    const def = f.valeurs.get('Defense')!.detail.map((l) => l.source);
    expect(def).toEqual(expect.arrayContaining(['cotte-de-mailles', 'petit-bouclier']));
  });

  it('Elaria, elfe magicienne niveau 4', () => {
    const f = elaria();
    expect([val(f, 'FOR'), val(f, 'CHA')]).toEqual([7, 10]);
    expect(modif(f, 'FOR')).toBe(-2);
    expect(val(f, 'Contact')).toBe(-2 + 4);
    expect(val(f, 'Distance')).toBe(2 + 4);
    expect(val(f, 'Magie')).toBe(4 + 4);
    expect(val(f, 'INIT')).toBe(14);
    expect(val(f, 'deVie')).toBe(6);
    expect(val(f, 'PV_Max')).toBe(1 + 4 * 0 + 14);
    expect(val(f, 'PV')).toBe(9);
    expect(val(elaria([], { PV: 40 }), 'PV')).toBe(15);
  });

  it('armures : pas de cumul entre armures, bouclier en plus, inactive ignorée', () => {
    const deux = elaria([{ entree: 'cuir' }, { entree: 'cotte-de-mailles' }]);
    expect(val(deux, 'Defense')).toBe(10 + 2 + 5);
    expect(deux.valeurs.get('Defense')!.detail).toContainEqual(
      expect.objectContaining({ source: 'cuir', ignore: true }),
    );
    const rangee = elaria([{ entree: 'cuir' }, { entree: 'cotte-de-mailles', actif: false }]);
    expect(val(rangee, 'Defense')).toBe(10 + 2 + 2);
    const bouclier = elaria([{ entree: 'cuir' }, { entree: 'grand-bouclier' }]);
    expect(val(bouclier, 'Defense')).toBe(10 + 2 + 2 + 2);
  });

  it('bonus libres saisis, actifs ou non', () => {
    const actif = elaria([{ entree: 'bonus-inventaire', champs: { Contact: 3, PV_Max: 2 } }]);
    expect(val(actif, 'Contact')).toBe(5);
    expect(val(actif, 'PV_Max')).toBe(17);
    const inactif = elaria([
      { entree: 'bonus-inventaire', actif: false, champs: { Contact: 3, PV_Max: 2 } },
    ]);
    expect(val(inactif, 'Contact')).toBe(2);
  });

  it('Grok, minotaure barbare niveau 1', () => {
    const f = grok();
    expect([val(f, 'FOR'), val(f, 'INT'), val(f, 'CHA')]).toEqual([19, 6, 9]);
    expect(val(f, 'Contact')).toBe(1 + mod(19));
    expect(val(f, 'Magie')).toBe(1 + mod(12));
    expect(val(f, 'deVie')).toBe(12);
    expect(val(f, 'PV_Max')).toBe(1 + mod(13) + 12);
  });
});

// ─── Progression ────────────────────────────────────────────────────────────

describe('dnd-classic : voies et création', () => {
  it('points de capacité = 2 × niveau', () => {
    const total = systeme.formule(chemins.monnaie('pointsCapacite'));
    expect(thorin().evaluer(total)).toBe(2);
    expect(elaria().evaluer(total)).toBe(8);
  });

  it('coût des rangs de voie : 1, 2, 4, 6, 8 points cumulés', () => {
    const cout = systeme.formule(chemins.achat('rang-voie', 'cout'));
    const f = thorin();
    const couts = [1, 2, 3, 4, 5].map((cible) =>
      Number(
        f.evaluer(cout, {
          variable: (n): Valeur => (n === 'cible' ? cible : n === 'actuel' ? cible - 1 : 0),
        }),
      ),
    );
    const cumul = couts.map((_, i) => couts.slice(0, i + 1).reduce((s, c) => s + c, 0));
    expect(cumul).toEqual([1, 2, 4, 6, 8]);
  });

  it('tirage du dé de vie avec le dé du profil', () => {
    const f = systeme.formule(chemins.etape('personnage', 'de-de-vie', 'formule'));
    expect(thorin().evaluer(f, { aleatoire: aleatoireImpose([10]) })).toBe(10);
    expect(() => grok().evaluer(f, { aleatoire: aleatoireImpose([13]) })).toThrow();
  });

  it('contrainte de tirage : total de 75 (condition nécessaire de la règle legacy)', () => {
    const c = systeme.formule(chemins.etape('personnage', 'caracteristiques', 'contrainte'));
    const f = thorin();
    const essai = (total: number) =>
      f.evaluer(c, { variable: (n): Valeur => (n === 'total' ? total : 0) });
    expect(essai(75)).toBe(true);
    expect(essai(74)).toBe(false);
  });
});

// ─── Actions ────────────────────────────────────────────────────────────────

describe('dnd-classic : actions', () => {
  const agir = (
    action: string,
    acteur: Fiche,
    des: number[],
    cible?: Fiche,
    parametres: Record<string, Valeur> = {},
  ) => {
    const r = executerAction(systeme, {
      action,
      acteur,
      ...(cible ? { cible } : {}),
      parametres,
      aleatoire: aleatoireImpose(des),
    });
    if (!r.ok) throw new Error(r.erreurs.map((e) => e.message).join(', '));
    expect(r.resultat.erreurs).toEqual([]);
    return r.resultat;
  };

  it('attaque au contact : 1d20 + Contact contre la Défense', () => {
    const cible = elaria([{ entree: 'cuir' }, { entree: 'cotte-de-mailles' }]); // Défense 17
    expect(agir('attaque-contact', thorin(), [14], cible).reussi).toBe(true); // 14 + 3
    expect(agir('attaque-contact', thorin(), [13], cible).reussi).toBe(false); // 13 + 3
  });

  it('20 naturel touche toujours (critique), 1 naturel rate toujours', () => {
    const imprenable = elaria([{ entree: 'bonus-inventaire', champs: { Defense: 20 } }]);
    const crit = agir('attaque-contact', thorin(), [20], imprenable);
    expect([crit.reussi, crit.jet.type === 'numerique' && crit.jet.critique]).toEqual([true, true]);
    const brute = grok([{ entree: 'bonus-inventaire', champs: { Contact: 20 } }]);
    const rate = agir('attaque-contact', brute, [1], thorin());
    expect([rate.reussi, rate.jet.type === 'numerique' && rate.jet.fumble]).toEqual([false, true]);
  });

  it('avantage et désavantage : 2d20, le meilleur ou le pire', () => {
    const cible = grok();
    const avec = agir('attaque-distance', elaria(), [5, 17], cible, { avantage: true });
    expect(avec.variables.total).toBe(17 + 6);
    const contre = agir('attaque-distance', elaria(), [5, 17], cible, { desavantage: true });
    expect(contre.variables.total).toBe(5 + 6);
    const annules = agir('attaque-magique', elaria(), [5], cible, {
      avantage: true,
      desavantage: true,
    });
    expect(annules.variables.total).toBe(5 + 8);
  });

  it('dégâts d’arme retirés des PV de la cible, doublés au critique', () => {
    const r = agir('degats', thorin(), [6], grok(), { arme: 'epee-longue' });
    expect(r.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 6 },
    ]);
    const crit = agir('degats', thorin(), [6, 3], grok(), {
      arme: 'epee-longue',
      coupCritique: true,
    });
    expect(crit.variables.degats).toBe(9);

    const blesse = calculer(
      systeme,
      appliquerModifications(
        grok(),
        r.modifications.map((m) => ({ ...m, entite: 'acteur' })),
      ),
    );
    expect(blesse.valeur('PV')).toBe(14 - 6);
  });

  it('test de caractéristique : 1d20 + modificateur contre la difficulté', () => {
    const r = agir('test-con', thorin(), [7], undefined, { difficulte: 11 });
    expect([r.variables.total, r.reussi]).toEqual([7 + 4, true]);
  });

  it('initiative : 1d20 + INIT (valeur de DEX), ordre décroissant', () => {
    const r = initiative(
      systeme,
      [
        { id: 'elaria', fiche: elaria() },
        { id: 'thorin', fiche: thorin() },
      ],
      aleatoireImpose([8, 15]),
    );
    if (!r.ok) throw new Error(r.erreurs[0]?.message);
    expect(r.ordre.map((x) => [x.id, x.cles[0]])).toEqual([
      ['thorin', 15 + 10],
      ['elaria', 8 + 14],
    ]);
  });

  it('passage de niveau : +1 niveau, dé de vie + mod. CON aux PV max, PV au maximum', () => {
    const avant = thorin();
    const r = agir('monter-niveau', avant, [7]);
    const apres = calculer(systeme, appliquerModifications(avant, r.modifications));
    expect(apres.valeur('niveau')).toBe(2);
    expect(apres.valeur('PV_Max')).toBe(12 + 7 + 4);
    expect(apres.valeur('PV')).toBe(12 + 7 + 4);
    expect(apres.valeur('Contact')).toBe(4);
  });
});
