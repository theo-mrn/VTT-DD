/**
 * Combat des trois systèmes (docs/combat.md § 13, § 14) : mode d'initiative, hors de combat,
 * menu d'attaque de la présentation, jet commun des zones, défense active (Esquive), vue de
 * l'attaquant. Tout en données : ces tests ne lisent que les systèmes.
 */
import { describe, expect, it } from 'vitest';
import {
  aleatoireImpose,
  appliquerModifications,
  calculer,
  EtatEntite,
  estHorsCombat,
  executerMulticible,
  parametresReaction,
  vueActeur,
  type EtatEntiteSaisi,
  type Fiche,
  type ResultatMulticible,
  type SystemeCharge,
} from '@vtt/rules';
import { chargerSource, presentationSource } from './test-utils.js';

const SYSTEMES = ['dnd-classic', 'nooblies', 'star-wars-eote'] as const;

function fabrique(systeme: SystemeCharge) {
  const version = { id: systeme.source.id, version: systeme.source.version };
  return (saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>, type = 'personnage'): Fiche =>
    calculer(systeme, EtatEntite.parse({ type, systeme: version, creation: false, ...saisi }));
}

function reussie(r: ResultatMulticible) {
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  for (const c of r.cibles) if (!c.ok) throw new Error(JSON.stringify(c.erreurs));
  return r;
}

describe.each(SYSTEMES)('%s : combat en données', (id) => {
  const systeme = chargerSource(id);
  const presentation = presentationSource(id);

  it('chaque type d’entité déclare sa règle « hors de combat »', () => {
    for (const e of systeme.source.entites) expect(e.horsCombat, e.id).toBeDefined();
  });

  it('le menu d’attaque range toutes les actions à cible', () => {
    const rangees = new Set(presentation.combat?.groupes.flatMap((g) => g.actions) ?? []);
    const aCible = systeme.source.actions.filter((a) => a.cible).map((a) => a.id);
    expect(aCible.filter((a) => !rangees.has(a))).toEqual([]);
  });

  it('chaque état proposé a son icône', () => {
    const etats = presentation.combat?.etats;
    if (!etats) return;
    const entrees = [...systeme.entrees.values()].filter((e) => etats.sortes.includes(e.sorte));
    expect(entrees.filter((e) => !etats.icones[e.id]).map((e) => e.id)).toEqual([]);
  });
});

describe('initiative : mode déclaré par le système', () => {
  it('individuel pour D&D et Nooblies, créneaux pour Star Wars', () => {
    expect(SYSTEMES.map((id) => chargerSource(id).source.initiative?.mode)).toEqual([
      'individuel',
      'individuel',
      'creneaux',
    ]);
  });
});

describe('D&D : zone à jet commun et hors de combat', () => {
  const systeme = chargerSource('dnd-classic');
  const fiche = fabrique(systeme);
  const lanceur = fiche({ valeurs: { FOR: 10, DEX: 10, CON: 10, INT: 14, SAG: 10, CHA: 10 } });
  const guerrier = fiche({ valeurs: { FOR: 14, DEX: 10, CON: 14, INT: 8, SAG: 10, CHA: 10 } });
  const gobelin = fiche({
    valeurs: { FOR: 8, DEX: 12, CON: 10, INT: 8, SAG: 8, CHA: 8, jetsDeVie: 6 },
  });

  it('dégâts automatiques d’une zone : les mêmes dés pour toutes les cibles', () => {
    expect(systeme.actions.get('degats-libres')?.multicible?.jet).toBe('commun');
    const r = reussie(
      executerMulticible(systeme, {
        action: 'degats-libres',
        acteur: lanceur,
        parametres: { nbDes: 2, faces: 6, bonus: 0 },
        cibles: [
          { id: 'guerrier', fiche: guerrier },
          { id: 'gobelin', fiche: gobelin },
        ],
        aleatoire: aleatoireImpose([5, 4]),
      }),
    );
    const totaux = r.cibles.map((c) => (c.ok ? c.resultat.variables.degats : null));
    expect(totaux).toEqual([9, 9]);
    // Vue de l'attaquant : les dégâts lancés, pas ce que la cible encaisse
    const c = r.cibles[1]!;
    if (!c.ok) throw new Error('refus');
    const vue = vueActeur(systeme, c.resultat);
    expect(vue.valeurs).toEqual([{ cle: 'degats', nom: 'Dégâts', valeur: 9 }]);
    expect(JSON.stringify(vue)).not.toMatch(/"subis"|"brut"|"PV"/);
  });

  it('soins de groupe : un jet par cible', () => {
    expect(systeme.actions.get('soins-de-groupe')?.multicible?.jet).toBe('par-cible');
  });

  it('à 0 PV, le personnage est hors de combat', () => {
    expect(estHorsCombat(gobelin)).toBe(false);
    const pv = Number(gobelin.valeur('PV'));
    const etat = appliquerModifications(gobelin, [
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: pv },
    ]);
    expect(estHorsCombat(calculer(systeme, etat))).toBe(true);
  });
});

describe('Star Wars : Esquive de la cible, vue de l’attaquant', () => {
  const systeme = chargerSource('star-wars-eote');
  const fiche = fabrique(systeme);
  const tireur = fiche({
    possessions: [
      { entree: 'bothan' },
      { entree: 'fusil-blaster' },
      { entree: 'distance-lourde', rang: 2 },
    ],
  });
  const wookiee = (extra: EtatEntiteSaisi['possessions'] = []) =>
    fiche({
      possessions: [{ entree: 'wookiee' }, { entree: 'armure-legere' }, ...(extra ?? [])],
    });
  const agile = wookiee([{ entree: 'esquive', rang: 2 }]);
  const lourd = wookiee();

  it('Esquive : réaction proposée à la seule cible qui a le talent', () => {
    expect(systeme.actions.get('attaque')?.parametres.find((p) => p.id === 'esquive')?.par).toBe(
      'cible',
    );
    expect(parametresReaction(systeme, 'attaque', agile)).toEqual(['esquive']);
    expect(parametresReaction(systeme, 'attaque', lourd)).toEqual([]);
  });

  it('la réaction de la cible améliore sa difficulté et lui coûte du stress', () => {
    const r = reussie(
      executerMulticible(systeme, {
        action: 'attaque',
        acteur: tireur,
        parametres: { arme: 'fusil-blaster', portee: 'moyenne', esquive: 2 },
        cibles: [
          { id: 'agile', fiche: agile, reaction: { esquive: 2 } },
          { id: 'lourd', fiche: lourd },
        ],
        aleatoire: aleatoireImpose(Array(40).fill(1)),
      }),
    );
    const [a, l] = r.cibles;
    if (!a?.ok || !l?.ok) throw new Error('refus');
    const defis = (x: typeof a) =>
      x.resultat.jet.type === 'symboles'
        ? (x.resultat.jet.pool.find((p) => p.de === 'defi')?.nombre ?? 0)
        : 0;
    expect(defis(a)).toBe(2);
    expect(defis(l)).toBe(0);
    expect(a.resultat.modifications).toContainEqual({
      entite: 'cible',
      attribut: 'stress',
      operation: 'ajouter',
      valeur: 2,
    });
    expect(r.acteur).toEqual([]);
  });

  it('vue de l’attaquant : dégâts bruts visibles, rien de la cible', () => {
    const r = reussie(
      executerMulticible(systeme, {
        action: 'attaque',
        acteur: tireur,
        parametres: { arme: 'fusil-blaster', portee: 'courte' },
        cibles: [{ id: 'lourd', fiche: lourd }],
        // Tous les dés sur leur meilleure face connue : touche, critique, d100
        aleatoire: aleatoireImpose([4, 1, 4, 2, 4, 12, 12, 45]),
      }),
    );
    const c = r.cibles[0]!;
    if (!c.ok) throw new Error('refus');
    const vue = vueActeur(systeme, c.resultat);
    expect(vue.valeurs.map((v) => v.cle)).toEqual(['degatsBruts']);
    expect(JSON.stringify(vue)).not.toMatch(
      /encaissementCible|degatsSubis|blessures-critiques|Blessure|defenseCible/,
    );
  });

  it('hors de combat : neutralisé au-delà du seuil de blessure', () => {
    expect(estHorsCombat(lourd)).toBe(false);
    const seuil = Number(lourd.valeur('seuilBlessure'));
    const etat = appliquerModifications(lourd, [
      { entite: 'cible', attribut: 'blessures', operation: 'ajouter', valeur: seuil + 1 },
    ]);
    expect(estHorsCombat(calculer(systeme, etat))).toBe(true);
  });
});
