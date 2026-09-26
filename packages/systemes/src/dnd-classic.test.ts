/**
 * D&D classique : le système se charge, et des personnages de référence donnent
 * les valeurs de l'ancienne app (legacy/src/modules/builtin/dnd-classic et les
 * règles codées en dur de l'interface : création, voies, montée de niveau).
 */
import { describe, expect, it } from 'vitest';
import {
  acheter,
  achatsPossibles,
  aleatoireGraine,
  aleatoireImpose,
  appliquerModifications,
  calculer,
  chemins,
  EtatEntite,
  executerAction,
  initiative,
  tirerEtape,
  type EtatEntiteSaisi,
  type Fiche,
  type Valeur,
} from '@vtt/rules';
import { lireSysteme } from './sources.js';
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

/**
 * Nain guerrier niveau 1, en cotte de mailles avec un petit bouclier ; Voie de
 * la résistance au rang 2 (Robustesse +3 PV, Armure naturelle +2 DEF).
 */
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
    expect([...parSorte('capacite'), ...parSorte('capacite_active')]).toHaveLength(
      (80 + 13 + 34) * 5 + 13,
    );
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
    // 10 + DEX 0 + cotte 5 + bouclier 1 + Armure naturelle 2
    expect(val(f, 'Defense')).toBe(10 + 0 + 5 + 1 + 2);
    expect(val(f, 'Contact')).toBe(3);
    expect(val(f, 'Distance')).toBe(1);
    expect(val(f, 'Magie')).toBe(2);
    expect(val(f, 'INIT')).toBe(10);
    expect([val(f, 'Critique'), val(f, 'RD')]).toEqual([20, 0]);
    expect(val(f, 'deVie')).toBe(10);
    // 1 + mod. CON + dé de vie + Robustesse
    expect(val(f, 'PV_Max')).toBe(1 + 4 + 7 + 3);
    expect(val(f, 'PV')).toBe(15);
    expect(f.possessions.get('guerrier-resistance')?.rang).toBe(2);
    expect(
      [...f.possessions.values()].filter((p) => p.sorte.id === 'capacite').map((p) => p.entree.id),
    ).toEqual([
      'nain-vision-dans-le-noir',
      'guerrier-resistance-robustesse',
      'guerrier-resistance-armure-naturelle',
    ]);

    // Explications : le bonus racial, l'équipement et les capacités sont tracés
    const dex = f.valeurs.get('DEX')!.detail;
    expect(dex).toContainEqual(expect.objectContaining({ source: 'nain', valeur: -2 }));
    const def = f.valeurs.get('Defense')!.detail.map((l) => l.source);
    expect(def).toEqual(
      expect.arrayContaining([
        'cotte-de-mailles',
        'petit-bouclier',
        'guerrier-resistance-armure-naturelle',
      ]),
    );
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
    // Capacités raciales accordées par la race (voie raciale non possédée)
    expect(f.possessions.has('minotaure-coup-de-corne')).toBe(true);
    expect(f.possessions.has('race-minotaure-charge')).toBe(false);
  });
});

// ─── Voies et capacités ─────────────────────────────────────────────────────

describe('dnd-classic : capacités des voies', () => {
  const capacites = (f: Fiche) =>
    [...f.possessions.values()].filter((p) => p.sorte.id === 'capacite').map((p) => p.entree.id);

  it('chaque voie accorde ses 5 capacités, une par rang', () => {
    for (const v of [...systeme.entrees.values()].filter((e) => e.sorte === 'voie')) {
      const rangs = v.effets.filter((f) => f.sur === 'rang');
      expect(rangs, v.id).toHaveLength(5);
      rangs.forEach((f, i) => {
        if (f.sur !== 'rang') return;
        const c = systeme.entrees.get(f.entree)!;
        expect(['capacite', 'capacite_active'], f.entree).toContain(c.sorte);
        expect([c.champs.voie, c.champs.rangVoie, f.condition]).toEqual([
          v.id,
          i + 1,
          `rang >= ${i + 1}`,
        ]);
      });
    }
  });

  it('les formules ne citent que des entrées existantes', () => {
    const texte = JSON.stringify(lireSysteme('dnd-classic'));
    const cites = [...texte.matchAll(/(?:possede|rang)\(\\"([^"\\]+)\\"\)/g)].map((m) => m[1]!);
    expect(cites.length).toBeGreaterThan(60);
    for (const id of new Set(cites)) expect(systeme.entrees.has(id), id).toBe(true);
  });

  it('une voie au rang 3 donne ses trois premières capacités', () => {
    const f = grok([{ entree: 'barbare-pagne', rang: 3 }]);
    expect(capacites(f)).toEqual(
      expect.arrayContaining([
        'barbare-pagne-vigueur',
        'barbare-pagne-peau-de-pierre',
        'barbare-pagne-tatouages',
      ]),
    );
    expect(f.possessions.has('barbare-pagne-peau-d-acier')).toBe(false);
    // Peau de pierre : + mod. CON en Défense
    expect(val(f, 'Defense')).toBe(10 + mod(11) + mod(13));
    expect(val(f, 'RD')).toBe(0);

    // Au rang 4 : Peau d'acier (RD 3) ; au rang 0 : aucune capacité
    expect(val(grok([{ entree: 'barbare-pagne', rang: 4 }]), 'RD')).toBe(3);
    expect(capacites(grok([{ entree: 'barbare-pagne', rang: 0 }]))).not.toContain(
      'barbare-pagne-vigueur',
    );
  });

  it('les bonus suivent le rang total de la voie', () => {
    const resistance = (rang: number) => elaria([{ entree: 'guerrier-resistance', rang }]);
    // Robustesse : +3 PV aux rangs 1-2, +6 aux rangs 3-4, +9 au rang 5 (où la
    // Constitution héroïque porte le mod. de CON à +1, soit +4 PV au niveau 4)
    expect([1, 2, 3, 4, 5].map((r) => val(resistance(r), 'PV_Max'))).toEqual(
      [3, 3, 6, 6, 9 + 4].map((b) => 15 + b),
    );
    // Armure naturelle : +2 DEF, +4 au rang 4 ; Constitution héroïque au rang 5
    expect([2, 4].map((r) => val(resistance(r), 'Defense'))).toEqual([12 + 2, 12 + 4]);
    expect(val(resistance(5), 'CON')).toBe(12);
    // Réflexes félins : +1 par rang en Initiative
    expect(val(elaria([{ entree: 'barbare-pourfendeur', rang: 3 }]), 'INIT')).toBe(14 + 3);
  });

  it('Armure de vent : + rang en DEF sans armure, bouclier permis', () => {
    const primitif = { entree: 'barbare-primitif', rang: 3 };
    expect(val(elaria([primitif]), 'Defense')).toBe(12 + 3);
    expect(val(elaria([primitif, { entree: 'petit-bouclier' }]), 'Defense')).toBe(12 + 3 + 1);
    expect(val(elaria([primitif, { entree: 'cuir' }]), 'Defense')).toBe(12 + 2);
    expect(val(elaria([primitif, { entree: 'cuir', actif: false }]), 'Defense')).toBe(12 + 3);
  });

  it('capacités raciales et voie raciale', () => {
    // Halfelin : Petite taille +1 DEF ; nain au rang 5 : RD 3 et +2 CON / +2 SAG
    expect(val(fiche({ possessions: [{ entree: 'halfelin' }] }), 'Defense')).toBe(10 + 1 + 1);
    const nain = fiche({ possessions: [{ entree: 'nain' }, { entree: 'race-nain', rang: 5 }] });
    expect([val(nain, 'RD'), val(nain, 'CON'), val(nain, 'SAG')]).toEqual([3, 14, 12]);
    expect(val(fiche({ possessions: [{ entree: 'race-nain', rang: 2 }] }), 'RD')).toBe(2);
  });

  it('choix d’attributs portés par la voie (Polyvalence au rang 5)', () => {
    const humain = (rang: number) =>
      fiche({
        possessions: [
          { entree: 'humain' },
          {
            entree: 'race-humain',
            rang,
            choix: { 'polyvalence-faible': ['CHA'], 'polyvalence-choix': ['FOR'] },
          },
        ],
      });
    expect([val(humain(5), 'CHA'), val(humain(5), 'FOR')]).toEqual([12, 12]);
    expect([val(humain(4), 'CHA'), val(humain(4), 'FOR')]).toEqual([10, 10]);
  });

  it('Armure naturelle draconique : RD 5 sous la moitié des PV', () => {
    const sang = (PV: number) =>
      elaria([{ entree: 'prestige-ensorceleur-sang-dragon', rang: 4 }], { PV });
    expect([val(sang(8), 'RD'), val(sang(7), 'RD')]).toEqual([0, 5]);
  });
});

// ─── Équipement ─────────────────────────────────────────────────────────────

describe('dnd-classic : achat d’équipement', () => {
  it('au prix de l’entrée, en pièces d’argent', () => {
    const f = thorin();
    const bourse = (n: number) =>
      calculer(systeme, { ...f.etat, valeurs: { ...f.etat.valeurs, bourse: n } });
    const armes = achatsPossibles(bourse(10), ['acheter-arme'])[0]!.objets;
    const prix = (id: string) => armes.find((o) => o.objet === id);
    expect([prix('dague')?.cout, prix('dague')?.possible]).toEqual([3, true]);
    expect([prix('katana')?.cout, prix('katana')?.possible]).toEqual([12, false]);

    const r = acheter(systeme, bourse(10).etat, { achat: 'acheter-armure', objet: 'cuir' });
    if (!r.ok) throw new Error(r.erreur);
    const apres = calculer(systeme, r.etat);
    expect(achatsPossibles(apres, ['acheter-armure'])[0]!.solde).toBe(10 - 4);
    expect(apres.possessions.has('cuir')).toBe(true);
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

  it('tirage relancé jusqu’à 3 valeurs paires et +6 de modificateurs', () => {
    for (const graine of ['a', 'b', 'c']) {
      const etat = EtatEntite.parse({
        type: 'personnage',
        systeme: { id: systeme.source.id, version: systeme.source.version },
        creation: true,
      });
      const r = tirerEtape(systeme, etat, 'caracteristiques', aleatoireGraine(graine));
      if (!r.ok) throw new Error(r.erreur);
      const v = r.retenu.valeurs;
      expect(v).toHaveLength(6);
      expect(v.filter((x) => x % 2 === 0)).toHaveLength(3);
      expect(v.reduce((s, x) => s + Math.floor((x - 10) / 2), 0)).toBe(6);
    }
  });
});

// ─── Actions ────────────────────────────────────────────────────────────────

describe('dnd-classic : actions', () => {
  const executer = (
    action: string,
    acteur: Fiche,
    des: number[],
    cible?: Fiche,
    parametres: Record<string, Valeur> = {},
  ) =>
    executerAction(systeme, {
      action,
      acteur,
      ...(cible ? { cible } : {}),
      parametres,
      aleatoire: aleatoireImpose(des),
    });
  const agir = (...args: Parameters<typeof executer>) => {
    const r = executer(...args);
    if (!r.ok) throw new Error(r.erreurs.map((e) => e.message).join(', '));
    expect(r.resultat.erreurs).toEqual([]);
    return r.resultat;
  };
  const epee = { arme: 'epee-longue' };
  const cuirasse = () => elaria([{ entree: 'cuir' }, { entree: 'cotte-de-mailles' }]); // Défense 17

  it('attaque : 1d20 + score de l’arme contre la Défense, dégâts si elle touche', () => {
    const touche = agir('attaque', thorin(), [14, 6], cuirasse(), epee); // 14 + 3
    expect([touche.reussi, touche.variables.degats]).toEqual([true, 6]);
    expect(touche.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 6 },
    ]);
    // Ratée : aucun dé de dégâts lancé, aucune modification
    const rate = agir('attaque', thorin(), [13], cuirasse(), epee);
    expect([rate.reussi, rate.variables.degats, rate.modifications]).toEqual([false, 0, []]);

    const blesse = calculer(
      systeme,
      appliquerModifications(
        grok(),
        touche.modifications.map((m) => ({ ...m, entite: 'acteur' })),
      ),
    );
    expect(blesse.valeur('PV')).toBe(14 - 6);
  });

  it('20 naturel touche toujours et double les dés, 1 naturel rate toujours', () => {
    const imprenable = elaria([{ entree: 'bonus-inventaire', champs: { Defense: 20 } }]);
    const crit = agir('attaque', thorin(), [20, 6, 3], imprenable, epee);
    expect([crit.reussi, crit.jet.type === 'numerique' && crit.jet.critique]).toEqual([true, true]);
    expect(crit.variables.degats).toBe(9);
    const brute = grok([
      { entree: 'bonus-inventaire', champs: { Contact: 20 } },
      { entree: 'epee-longue' },
    ]);
    const rate = agir('attaque', brute, [1], thorin(), epee);
    expect([rate.reussi, rate.jet.type === 'numerique' && rate.jet.fumble]).toEqual([false, true]);
  });

  it('Science du critique : critique dès 19', () => {
    const imprenable = elaria([{ entree: 'bonus-inventaire', champs: { Defense: 30 } }]);
    const maitre = fiche({
      ...thorin().etat,
      possessions: [...thorin().etat.possessions, { entree: 'guerrier-maitre-d-armes', rang: 2 }],
    });
    expect(val(maitre, 'Critique')).toBe(19);
    const r = agir('attaque', maitre, [19, 6, 3], imprenable, epee);
    expect([r.reussi, r.variables.degats]).toEqual([true, 9]);
    expect(agir('attaque', thorin(), [19], imprenable, epee).reussi).toBe(false);
  });

  it('la RD de la cible réduit les dégâts, au moins 1', () => {
    const roc = fiche({ possessions: [{ entree: 'nain' }, { entree: 'race-nain', rang: 2 }] });
    expect(agir('attaque', thorin(), [14, 6], roc, epee).variables.subis).toBe(4);
    expect(agir('attaque', thorin(), [14, 1], roc, epee).variables.subis).toBe(1);
  });

  it('Arme de prédilection : +1 avec l’arme choisie sur la voie', () => {
    const maitre = (arme: string) =>
      fiche({
        ...thorin().etat,
        possessions: [
          ...thorin().etat.possessions,
          { entree: 'guerrier-maitre-d-armes', rang: 1, choix: { predilection: [arme] } },
        ],
      });
    const r = agir('attaque', maitre('epee-longue'), [13, 5], cuirasse(), epee);
    expect([r.variables.total, r.reussi]).toEqual([13 + 3 + 1, true]);
    expect(r.jet.type === 'numerique' && r.jet.bonus.map((b) => b.source)).toEqual([
      'guerrier-maitre-d-armes-arme-de-predilection',
    ]);
    expect(agir('attaque', maitre('dague'), [13], cuirasse(), epee).reussi).toBe(false);
  });

  it('Précision : score de Distance avec une arme légère au contact', () => {
    const escrimeuse = elaria([{ entree: 'barde-escrime', rang: 1 }, { entree: 'dague' }]);
    const r = agir('attaque', escrimeuse, [10, 2], grok(), { arme: 'dague' });
    expect(r.variables.total).toBe(10 + 2 + (6 - 2)); // Contact 2, Distance 6
  });

  it('attaque libre : avantage et désavantage, 2d20 le meilleur ou le pire', () => {
    const cible = grok(); // Défense 10
    const distance = { score: 'Distance' };
    const avec = agir('attaque-libre', elaria(), [5, 17, 4], cible, {
      ...distance,
      avantage: true,
    });
    expect([avec.variables.total, avec.variables.degats]).toEqual([17 + 6, 4]);
    const contre = agir('attaque-libre', elaria(), [5, 17, 4], cible, {
      ...distance,
      desavantage: true,
    });
    expect(contre.variables.total).toBe(5 + 6);
    const annules = agir('attaque-libre', elaria(), [5, 4], cible, {
      score: 'Magie',
      avantage: true,
      desavantage: true,
    });
    expect(annules.variables.total).toBe(5 + 8);
  });

  it('test de caractéristique : une action, la caractéristique en paramètre', () => {
    const r = agir('test', thorin(), [7], undefined, { caracteristique: 'CON', difficulte: 11 });
    expect([r.variables.total, r.reussi]).toEqual([7 + 4, true]);
    const f = agir('test', thorin(), [7], undefined, { caracteristique: 'INT', difficulte: 11 });
    expect([f.variables.total, f.reussi]).toEqual([7 - 1, false]);
    const refus = executer('test', thorin(), [7], undefined, { caracteristique: 'Defense' });
    expect(refus.ok).toBe(false);
  });

  it('coup de corne : réservé au minotaure, [1d6 + mod. FOR] DM', () => {
    const refus = executer('coup-de-corne', thorin(), [15, 3], grok());
    expect(!refus.ok && refus.erreurs[0]!.message).toContain('condition non remplie');
    const r = agir('coup-de-corne', grok(), [15, 3], thorin()); // 15 + 5 contre 18
    expect([r.reussi, r.variables.degats]).toEqual([true, 3 + 4]);
  });

  it('actions de capacité : Charge et Attaque brutale selon le rang de la voie', () => {
    const barbare = (voie: string, rang: number) =>
      grok([{ entree: voie, rang }, { entree: 'epee-longue' }]);
    expect(executer('charge', barbare('barbare-pourfendeur', 1), [12], thorin(), epee).ok).toBe(
      false,
    );
    const charge = agir('charge', barbare('barbare-pourfendeur', 2), [12, 5, 4], thorin(), epee);
    expect([charge.variables.total, charge.variables.degats]).toEqual([12 + 5 + 2, 5 + 4]);

    const brutale = { ...epee, puissante: true };
    const rang3 = agir(
      'attaque-brutale',
      barbare('barbare-brute', 3),
      [15, 5, 4],
      thorin(),
      brutale,
    );
    expect([rang3.variables.total, rang3.variables.degats]).toEqual([15 + 5 - 2, 5 + 4]);
    const rang5 = agir(
      'attaque-brutale',
      barbare('barbare-brute', 5),
      [18, 5, 4, 2],
      thorin(),
      brutale,
    );
    // Au rang 5, Force héroïque (+2 FOR) porte le Contact à 6
    expect([rang5.variables.total, rang5.variables.degats]).toEqual([18 + 6 - 5, 5 + 4 + 2]);
  });

  it('sorts : Projectile magique automatique, Soins légers', () => {
    const mage = (rang: number) => elaria([{ entree: 'magicien-magie-destructrice', rang }]);
    const r1 = agir('projectile-magique', mage(1), [3], grok());
    expect(r1.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 3 },
    ]);
    expect(executer('projectile-magique', mage(4), [5], grok()).ok).toBe(true);
    expect(() => agir('projectile-magique', mage(1), [5], grok())).toThrow();

    const pretre = fiche({
      valeurs: { niveau: 3 },
      possessions: [{ entree: 'pretre-soins', rang: 1 }],
    });
    const blessee = elaria(); // 9 PV sur 15
    const soin = agir('soins-legers', pretre, [5], blessee);
    expect(soin.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'ajouter', valeur: 5 + 3 },
    ]);
    const soignee = calculer(
      systeme,
      appliquerModifications(
        blessee,
        soin.modifications.map((m) => ({ ...m, entite: 'acteur' })),
      ),
    );
    expect(soignee.valeur('PV')).toBe(15);
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
    expect(apres.valeur('PV_Max')).toBe(15 + 7 + 4);
    expect(apres.valeur('PV')).toBe(15 + 7 + 4);
    expect(apres.valeur('Contact')).toBe(4);
  });
});

// ─── Capacités codées par les briques génériques ────────────────────────────

describe('dnd-classic : capacités codées', () => {
  type Possessions = EtatEntiteSaisi['possessions'];
  /** Personnage neutre : caractéristiques à 10, niveau 1, 10 PV, Défense 10, attaques à +1. */
  const nu = (possessions: Possessions = [], valeurs: Record<string, number> = {}) =>
    fiche({ valeurs: { niveau: 1, jetsDeVie: 9, ...valeurs }, possessions });
  const executer = (
    action: string,
    acteur: Fiche,
    des: number[],
    cible?: Fiche,
    parametres: Record<string, Valeur> = {},
  ) =>
    executerAction(systeme, {
      action,
      acteur,
      ...(cible ? { cible } : {}),
      parametres,
      aleatoire: aleatoireImpose(des),
    });
  const agir = (...args: Parameters<typeof executer>) => {
    const r = executer(...args);
    if (!r.ok) throw new Error(r.erreurs.map((e) => e.message).join(', '));
    expect(r.resultat.erreurs).toEqual([]);
    return r.resultat;
  };
  const total = (r: ReturnType<typeof agir>) => r.variables.total;
  const arme = (id: string) => ({ arme: id });

  it('héroïques : 2d20 aux tests de la caractéristique, sans cumul avec l’avantage', () => {
    const brute = nu([{ entree: 'barbare-brute', rang: 5 }]); // Force héroïque : FOR 12
    const test = (carac: string, des: number[], p: Record<string, Valeur> = {}) =>
      total(agir('test', brute, des, undefined, { caracteristique: carac, ...p }));
    expect(test('FOR', [5, 17])).toBe(17 + 1);
    expect(test('FOR', [5, 17], { avantage: true })).toBe(17 + 1);
    expect(test('FOR', [5], { desavantage: true })).toBe(5 + 1);
    expect(test('DEX', [5])).toBe(5);
  });

  it('capacité invoquée au test : bonus situationnel, étiquette « test » exigée', () => {
    const pagne = nu([{ entree: 'barbare-pagne', rang: 2 }]);
    const test = (atout?: string) =>
      executer('test', pagne, [10], undefined, {
        caracteristique: 'FOR',
        ...(atout ? { atout } : {}),
      });
    const r = test('barbare-pagne-vigueur'); // +2 par rang
    expect(r.ok && r.resultat.variables.total).toBe(10 + 4);
    expect(total(agir('test', pagne, [10], undefined, { caracteristique: 'FOR' }))).toBe(10);
    expect(test('barbare-pagne-peau-de-pierre').ok).toBe(false); // pas un bonus de test
    expect(test('barbare-primitif-vigilance').ok).toBe(false); // non possédée
    // Ça passe ou ça casse : un d20 de plus
    const casseCou = nu([{ entree: 'prestige-voleur-casse-cou', rang: 3 }]);
    const fatal = agir('test', casseCou, [4, 16], undefined, {
      caracteristique: 'DEX',
      atout: 'prestige-voleur-casse-cou-ca-passe-ou-ca-casse',
    });
    expect(total(fatal)).toBe(16);
  });

  it('Tatouages : +5 aux tests de la caractéristique choisie sur la possession', () => {
    const tatoue = nu([
      { entree: 'barbare-pagne', rang: 3 },
      { entree: 'barbare-pagne-tatouages', champs: { carac: 'CON' } },
    ]);
    const test = (carac: string) =>
      total(agir('test', tatoue, [10], undefined, { caracteristique: carac }));
    expect([test('CON'), test('FOR')]).toEqual([15, 10]);
  });

  it('Rage du berserk : inactive par défaut ; activée, +2 Contact, −4 DEF, +1d6 DM au contact', () => {
    const barbare = (actif?: boolean, autres: Possessions = []) =>
      nu([
        { entree: 'barbare-rage', rang: 3 },
        { entree: 'epee-longue' },
        { entree: 'arc-court' },
        ...(actif === undefined ? [] : [{ entree: 'barbare-rage-rage-du-berserk', actif }]),
        ...(autres ?? []),
      ]);
    expect([val(barbare(), 'Contact'), val(barbare(), 'Defense')]).toEqual([1, 10]);
    const enrage = barbare(true);
    expect([val(enrage, 'Contact'), val(enrage, 'Defense')]).toEqual([3, 6]);
    const coup = agir('attaque', enrage, [10, 5, 4], nu(), arme('epee-longue'));
    expect([total(coup), coup.variables.degats]).toEqual([13, 5 + 4]);
    const tir = agir('attaque', enrage, [10, 3], nu(), arme('arc-court'));
    expect(tir.variables.degats).toBe(3);
    // Rage froide (voie des glaces) : plus de pénalité de DEF
    expect(val(barbare(true, [{ entree: 'prestige-barbare-glaces', rang: 4 }]), 'Defense')).toBe(
      10,
    );
  });

  it('Spécialisation et Haches et marteaux : bonus aux DM selon l’arme', () => {
    const maitre = nu([
      { entree: 'guerrier-maitre-d-armes', rang: 3, choix: { predilection: ['epee-longue'] } },
      { entree: 'epee-longue' },
      { entree: 'dague' },
    ]);
    const favori = agir('attaque', maitre, [10, 5], nu(), arme('epee-longue'));
    expect([total(favori), favori.variables.degats]).toEqual([10 + 1 + 1, 5 + 2]);
    expect(agir('attaque', maitre, [10, 3], nu(), arme('dague')).variables.degats).toBe(3);

    const nain = nu([
      { entree: 'race-nain', rang: 3 },
      { entree: 'hache-a-1-main' },
      { entree: 'epee-longue' },
    ]);
    const hache = agir('attaque', nain, [10, 4], nu(), arme('hache-a-1-main'));
    expect([total(hache), hache.variables.degats]).toEqual([12, 5]);
    const epee = agir('attaque', nain, [10, 4], nu(), arme('epee-longue'));
    expect([total(epee), epee.variables.degats]).toEqual([11, 4]);
    // Résistance naine : +5 aux tests de CON
    expect(total(agir('test', nain, [10], undefined, { caracteristique: 'CON' }))).toBe(15);
  });

  it('critiques : Critique brutal (×3 au contact), Maîtrise des arbalètes (19-20)', () => {
    const orque = nu([
      { entree: 'race-orque', rang: 3 },
      { entree: 'epee-longue' },
      { entree: 'arc-court' },
    ]);
    expect(agir('attaque', orque, [20, 3, 4, 5], nu(), arme('epee-longue')).variables.degats).toBe(
      12,
    );
    expect(agir('attaque', orque, [20, 3, 4], nu(), arme('arc-court')).variables.degats).toBe(7);

    const elfe = nu([
      { entree: 'race-elfe-noir', rang: 3 },
      { entree: 'arbalete-legere' },
      { entree: 'arc-court' },
    ]);
    const imprenable = nu([{ entree: 'bonus-inventaire', champs: { Defense: 30 } }]);
    const carreau = agir('attaque', elfe, [19, 2, 3, 1, 4], imprenable, arme('arbalete-legere'));
    expect([carreau.reussi, carreau.variables.degats]).toEqual([true, 10]);
    expect(agir('attaque', elfe, [19], imprenable, arme('arc-court')).reussi).toBe(false);
  });

  it('bonus contre des types de créatures (Massacrer la piétaille)', () => {
    const chevalier = nu([{ entree: 'chevalier-noblesse', rang: 4 }, { entree: 'epee-longue' }]);
    const pietaille = nu([{ entree: 'pietaille' }]);
    expect(
      agir('attaque', chevalier, [10, 5, 6], pietaille, arme('epee-longue')).variables.degats,
    ).toBe(11);
    expect(agir('attaque', chevalier, [10, 5], nu(), arme('epee-longue')).variables.degats).toBe(5);
  });

  it('défenses de la cible : Dentelles et rapière, Cri de guerre, Flou, Piqûres d’insecte', () => {
    const attaquant = nu([{ entree: 'epee-longue' }, { entree: 'arc-long' }]);
    const barde = nu([{ entree: 'barde-seduction', rang: 2 }]);
    expect(val(barde, 'DefContact')).toBe(2);
    expect(
      val(nu([{ entree: 'barde-seduction', rang: 2 }, { entree: 'cuir' }]), 'DefContact'),
    ).toBe(0);
    expect(agir('attaque', attaquant, [10], barde, arme('epee-longue')).reussi).toBe(false);
    expect(agir('attaque', attaquant, [10, 3], barde, arme('arc-long')).reussi).toBe(true);

    const hurleur = nu([
      { entree: 'barbare-rage', rang: 1 },
      { entree: 'barbare-rage-cri-de-guerre', actif: true },
    ]);
    expect(total(agir('attaque', attaquant, [11, 5], hurleur, arme('epee-longue')))).toBe(12 - 2);
    expect(total(agir('attaque', attaquant, [11, 5], hurleur, arme('arc-long')))).toBe(12);

    const flou = nu([
      { entree: 'magicien-magie-protectrice', rang: 3 },
      { entree: 'magicien-magie-protectrice-flou', actif: true },
    ]);
    expect(val(flou, 'Defense')).toBe(10); // Armure du mage non activée
    expect(agir('attaque', attaquant, [15, 7], flou, arme('epee-longue')).variables.subis).toBe(3);
    const sort = agir('attaque-libre', nu(), [15, 5], flou, { score: 'Magie' });
    expect(sort.variables.subis).toBe(5);

    const heros = (armure: string) =>
      nu([{ entree: 'chevalier-heros', rang: 2 }, { entree: armure }]);
    expect(
      agir('attaque', attaquant, [19, 6], heros('demi-plaque'), arme('arc-long')).variables.subis,
    ).toBe(6 - 2);
    expect(
      agir('attaque', attaquant, [19, 6], heros('cuir'), arme('arc-long')).variables.subis,
    ).toBe(6);
  });

  it('Instinct de survie (humain) : DM mortels divisés par 2', () => {
    const humain = (PV: number) => nu([{ entree: 'humain' }], { PV });
    const attaquant = nu([{ entree: 'epee-longue' }]);
    expect(
      agir('attaque', attaquant, [15, 8], humain(6), arme('epee-longue')).variables.subis,
    ).toBe(4);
    expect(
      agir('attaque', attaquant, [15, 8], humain(10), arme('epee-longue')).variables.subis,
    ).toBe(8);
    expect(
      agir('attaque', attaquant, [15, 8], nu([], { PV: 6 }), arme('epee-longue')).variables.subis,
    ).toBe(8);
  });

  it('Armure lourde : la plaque complète ne double pas les dés au critique', () => {
    const attaquant = nu([{ entree: 'epee-longue' }]);
    const guerrier = nu([{ entree: 'guerrier-bouclier', rang: 4 }, { entree: 'plaque-complete' }]);
    expect(
      agir('attaque', attaquant, [20, 5], guerrier, arme('epee-longue')).variables.degats,
    ).toBe(5);
    const autre = nu([{ entree: 'plaque-complete' }]);
    expect(
      agir('attaque', attaquant, [20, 5, 3], autre, arme('epee-longue')).variables.degats,
    ).toBe(8);
  });

  it('Mains d’énergie : +5 contre une cible en armure', () => {
    const moine = nu([{ entree: 'moine-energie-vitale', rang: 1 }]);
    expect(total(agir('mains-d-energie', moine, [10, 4], nu()))).toBe(10 + 1 + 2);
    expect(total(agir('mains-d-energie', moine, [10, 4], nu([{ entree: 'cuir' }])))).toBe(
      10 + 1 + 5,
    );
  });

  it('états : désavantage de l’aveuglé, avantage contre le paralysé', () => {
    const attaquant = (etat?: string) =>
      nu([{ entree: 'epee-longue' }, ...(etat ? [{ entree: etat }] : [])]);
    expect(total(agir('attaque', attaquant('aveugle'), [15, 3], nu(), arme('epee-longue')))).toBe(
      4,
    );
    const paralyse = nu([{ entree: 'paralyse' }]);
    expect(total(agir('attaque', attaquant(), [3, 15, 6], paralyse, arme('epee-longue')))).toBe(16);
    expect(
      total(agir('attaque', attaquant('aveugle'), [3, 6], paralyse, arme('epee-longue'))),
    ).toBe(4);
    const effraye = nu([{ entree: 'effraye' }]);
    expect(total(agir('test', effraye, [15, 3], undefined, { caracteristique: 'FOR' }))).toBe(3);
  });

  it('options réservées de l’attaque, sorts génériques et vérifications', () => {
    const attaquant = nu([{ entree: 'epee-longue' }]);
    const outrance = executer('attaque', attaquant, [10], nu(), {
      ...arme('epee-longue'),
      outrance: true,
    });
    expect(outrance.ok).toBe(false);

    const necro = nu([{ entree: 'necromancien-sang', rang: 1 }]);
    const saignement = agir('sort', necro, [15, 4], nu(), {
      capacite: 'necromancien-sang-saignements',
    });
    expect([total(saignement), saignement.variables.degats]).toEqual([16, 4]);
    expect(executer('sort', necro, [15], nu(), { capacite: 'necromancien-sang-exsangue' }).ok).toBe(
      false,
    );
    // Suggestion : contre les PV max de la cible (10), pas sa Défense (30)
    const barde = nu([{ entree: 'barde-seduction', rang: 4 }]);
    const cible = nu([{ entree: 'bonus-inventaire', champs: { Defense: 20 } }]);
    const suggestion = agir('sort', barde, [9], cible, { capacite: 'barde-seduction-suggestion' });
    expect([suggestion.reussi, suggestion.modifications]).toEqual([true, []]);

    const pretre = nu([{ entree: 'pretre-priere', rang: 2 }]);
    const vivant = executer('destruction-des-morts-vivants', pretre, [3, 4], nu());
    expect(!vivant.ok && vivant.erreurs[0]!.message).toBe('La cible n’est pas un mort-vivant');
    const zombi = agir(
      'destruction-des-morts-vivants',
      pretre,
      [3, 4],
      nu([{ entree: 'mort-vivant' }]),
    );
    expect(zombi.variables.subis).toBe(7);
  });

  it('options réservées : alliés (Lois de la meute), Kiai, Ouverture mortelle', () => {
    const wolfer = nu([{ entree: 'race-wolfer', rang: 3 }, { entree: 'epee-longue' }]);
    const meute = agir('attaque', wolfer, [10, 5], nu(), { ...arme('epee-longue'), allies: 7 });
    expect(total(meute)).toBe(10 + 1 + 5); // plafonné à +5
    const samourai = nu([{ entree: 'samourai-ki', rang: 3 }, { entree: 'epee-longue' }]);
    const kiai = agir('attaque', samourai, [10], nu(), { ...arme('epee-longue'), degatsMax: true });
    expect(kiai.variables.degats).toBe(8);
    const assassin = nu([{ entree: 'voleur-assassin', rang: 5 }, { entree: 'epee-longue' }]);
    const imprenable = nu([{ entree: 'bonus-inventaire', champs: { Defense: 30 } }]);
    const ouverture = agir('attaque-sournoise', assassin, [2, 1, 1, 1, 1, 1], imprenable, {
      ...arme('epee-longue'),
      ouvertureMortelle: true,
    });
    // Critique automatique : 2d8 de l'arme + 3d6 d'attaque sournoise
    expect([ouverture.reussi, ouverture.variables.degats]).toEqual([true, 5]);
  });

  it('Tour de force et Défier la mort', () => {
    const brute = nu([
      { entree: 'barbare-brute', rang: 2 },
      { entree: 'barbare-rage', rang: 2 },
    ]);
    const force = agir('exploit', brute, [8, 3], undefined, { caracteristique: 'FOR' });
    expect([total(force), force.modifications]).toEqual([
      18,
      [{ entite: 'acteur', attribut: 'PV', operation: 'retirer', valeur: 3 }],
    ]);
    const defi = agir('defier-la-mort', brute, [10], undefined, { difficulte: 20, enrage: true });
    expect([defi.reussi, defi.modifications]).toEqual([
      true,
      [{ entite: 'acteur', attribut: 'PV', operation: 'fixer', valeur: 1 }],
    ]);
  });

  it('armure sainte à activer, qui s’améliore avec la voie', () => {
    const moine = (rang: number) =>
      nu([
        { entree: 'prestige-moine-armure-sainte', rang },
        { entree: 'prestige-moine-armure-sainte-armure-sainte-de-bronze', actif: true },
      ]);
    expect([val(moine(1), 'Defense'), val(moine(1), 'RD')]).toEqual([14, 0]);
    expect([val(moine(5), 'Defense'), val(moine(5), 'RD')]).toEqual([18, 5]);
  });

  it('bilan : plus de la moitié des capacités ont une mécanique', () => {
    const texte = JSON.stringify(lireSysteme('dnd-classic'));
    const caps = [...systeme.entrees.values()].filter((e) => e.sorte.startsWith('capacite'));
    const codees = caps.filter(
      (c) =>
        c.effets.length > 0 ||
        c.choixAttributs.length > 0 ||
        c.etiquettes.some((e) => e === 'test' || e === 'sort') ||
        texte.includes(`(\\"${c.id}\\")`),
    );
    expect(codees.length).toBeGreaterThan(caps.length / 2);
  });
});

describe('dnd-classic : toutes les actions', () => {
  it('s’exécutent sans erreur de formule pour un personnage qui possède toutes les voies', () => {
    const tout = [...systeme.entrees.values()];
    const voies = tout.filter((e) => e.sorte === 'voie').map((e) => ({ entree: e.id, rang: 5 }));
    const actives = tout
      .filter((e) => e.sorte === 'capacite_active')
      .map((e) => ({ entree: e.id, actif: true }));
    const acteur = calculer(
      systeme,
      EtatEntite.parse({
        type: 'personnage',
        systeme: { id: 'dnd-classic', version: '1.0.0' },
        valeurs: { niveau: 5, jetsDeVie: 30 },
        possessions: [...voies, ...actives, { entree: 'epee-longue' }, { entree: 'aveugle' }],
      }),
    );
    const cible = calculer(
      systeme,
      EtatEntite.parse({
        type: 'personnage',
        systeme: { id: 'dnd-classic', version: '1.0.0' },
        valeurs: { PV: 0 },
        possessions: [
          ...voies.slice(0, 40),
          { entree: 'mort-vivant' },
          { entree: 'plaque-complete' },
        ],
      }),
    );
    let reussies = 0;
    for (const action of systeme.actions.values()) {
      const parametres: Record<string, Valeur> = {};
      for (const p of action.parametres) {
        if (p.type === 'entree' && !p.facultatif)
          parametres[p.id] = p.sorte === 'arme' ? 'epee-longue' : 'necromancien-sang-saignements';
        if (p.type === 'attribut') parametres[p.id] = p.attributs?.[0] ?? 'FOR';
      }
      const r = executerAction(systeme, {
        action: action.id,
        acteur,
        ...(action.cible ? { cible } : {}),
        parametres,
        aleatoire: aleatoireGraine(action.id),
      });
      if (!r.ok) throw new Error(`${action.id} : ${r.erreurs.map((e) => e.message).join(', ')}`);
      expect(r.resultat.erreurs, action.id).toEqual([]);
      reussies++;
    }
    expect(reussies).toBe(systeme.actions.size);
  });
});
