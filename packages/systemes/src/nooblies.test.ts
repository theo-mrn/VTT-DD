/**
 * Nooblies Chroniques : chargement du système et personnages de référence
 * (valeurs dérivées connues, calculées à la main depuis les règles legacy).
 */
import { describe, expect, it } from 'vitest';
import {
  aleatoireGraine,
  aleatoireImpose,
  calculer,
  EtatEntite,
  executerAction,
  tirerEtape,
  type EtatEntiteSaisi,
  type SystemeCharge,
} from '@vtt/rules';
import { chargerSource } from './test-utils.js';

const systeme: SystemeCharge = chargerSource('nooblies');

function fiche(saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>) {
  return calculer(
    systeme,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: 'nooblies', version: '1.0.0' },
      ...saisi,
    }),
  );
}

describe('Nooblies Chroniques', () => {
  it('se charge sans erreur, avec toutes ses races, profils et actions', () => {
    expect(systeme.source.version).toBe('1.0.0');
    const parSorte = (s: string) => [...systeme.entrees.values()].filter((e) => e.sorte === s);
    expect(parSorte('race')).toHaveLength(8);
    expect(parSorte('profil')).toHaveLength(11);
    expect([...systeme.actions.keys()]).toEqual(['attaque', 'coup-de-corne', 'initiative', 'test']);
    expect(systeme.source.initiative?.action).toBe('initiative');
  });

  it('nain guerrier : modificateurs raciaux, combat et PV', () => {
    // Tirage : FOR 14, DEX 11, CON 16, SAG 9, INT 12, CHA 13 (3 paires, mods = 6)
    const f = fiche({
      valeurs: { FOR: 14, DEX: 11, CON: 16, SAG: 9, INT: 12, CHA: 13, jetDeVie: 7 },
      possessions: [{ entree: 'nain' }, { entree: 'guerrier' }],
    });
    expect(f.erreurs).toEqual([]);
    expect(f.valeur('DEX')).toBe(9); // 11 − 2
    expect(f.valeur('CON')).toBe(18); // 16 + 2
    expect(f.valeurs.get('DEX')?.modificateur).toBe(-1);
    expect(f.valeurs.get('CON')?.modificateur).toBe(4);
    expect(f.valeur('Defense')).toBe(17); // 18 − 1
    expect(f.valeur('Contact')).toBe(3); // 1 + 2
    expect(f.valeur('Distance')).toBe(0); // 1 − 1
    expect(f.valeur('Magie')).toBe(2); // 1 + 1
    expect(f.valeur('INIT')).toBe(9);
    expect(f.valeur('facesDeVie')).toBe(10);
    expect(f.valeur('PV_Max')).toBe(12); // 1 + 4 + 7
    expect(f.valeur('PV')).toBe(12); // démarre au maximum
    expect(f.possessions.has('vision-dans-le-noir')).toBe(true);
  });

  it('halfelin voleur : Petite taille (+1 DEF) et PV bornés au maximum', () => {
    // Tirage : FOR 8, DEX 17, CON 10, SAG 15, INT 12, CHA 13 (3 paires, mods = 6)
    const f = fiche({
      valeurs: { FOR: 8, DEX: 17, CON: 10, SAG: 15, INT: 12, CHA: 13, jetDeVie: 4, PV: 20 },
      possessions: [{ entree: 'halfelin' }, { entree: 'voleur' }],
    });
    expect(f.erreurs).toEqual([]);
    expect(f.valeur('FOR')).toBe(6);
    expect(f.valeur('DEX')).toBe(19);
    expect(f.valeur('Defense')).toBe(23); // 18 + 4 + 1 (Petite taille)
    expect(f.valeurs.get('Defense')?.detail.map((l) => l.source)).toEqual([
      'formule',
      'petite-taille',
    ]);
    expect(f.valeur('Contact')).toBe(-1); // 1 − 2
    expect(f.valeur('Distance')).toBe(5);
    expect(f.valeur('Magie')).toBe(2);
    expect(f.valeur('INIT')).toBe(19);
    expect(f.valeur('facesDeVie')).toBe(6);
    expect(f.valeur('PV_Max')).toBe(5); // 1 + 0 + 4
    expect(f.valeur('PV')).toBe(5); // 20 ramené au maximum
  });

  it('le jet de dé de vie ne dépasse pas le dé du profil', () => {
    const f = fiche({ valeurs: { jetDeVie: 9 }, possessions: [{ entree: 'ensorceleur' }] });
    expect(f.valeur('jetDeVie')).toBe(4);
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

  // ─── Actions ──────────────────────────────────────────────────────────────

  const nain = () =>
    fiche({
      valeurs: { FOR: 14, DEX: 11, CON: 16, SAG: 9, INT: 12, CHA: 13, jetDeVie: 7 },
      possessions: [{ entree: 'nain' }, { entree: 'guerrier' }],
    });
  const minotaure = () =>
    fiche({
      valeurs: { FOR: 15, DEX: 12, CON: 13, SAG: 10, INT: 14, CHA: 12, jetDeVie: 9 },
      possessions: [{ entree: 'minotaure' }, { entree: 'barbare' }],
    });
  const agir = (
    action: string,
    acteur: ReturnType<typeof fiche>,
    des: number[],
    extra: { cible?: ReturnType<typeof fiche>; parametres?: Record<string, string | number> } = {},
  ) => executerAction(systeme, { action, acteur, ...extra, aleatoire: aleatoireImpose(des) });

  it('attaque : 1d20 + score choisi contre la Défense', () => {
    const cible = nain(); // Défense 17
    const contact = agir('attaque', minotaure(), [12], { cible, parametres: { score: 'Contact' } });
    expect(contact.ok && [contact.resultat.variables.total, contact.resultat.reussi]).toEqual([
      12 + 5,
      true,
    ]);
    const magie = agir('attaque', minotaure(), [12], { cible, parametres: { score: 'Magie' } });
    expect(magie.ok && [magie.resultat.variables.total, magie.resultat.reussi]).toEqual([
      12 + 1,
      false,
    ]);
    expect(agir('attaque', minotaure(), [12], { cible, parametres: { score: 'PV' } }).ok).toBe(
      false,
    );
  });

  it('test de caractéristique : une action, la caractéristique en paramètre', () => {
    const r = agir('test', nain(), [8], { parametres: { caracteristique: 'CON', difficulte: 12 } });
    expect(r.ok && [r.resultat.variables.total, r.resultat.reussi]).toEqual([8 + 4, true]);
  });

  it('coup de corne : réservé au minotaure, [1d6 + mod. FOR] DM', () => {
    const refus = agir('coup-de-corne', nain(), [15, 3], { cible: minotaure() });
    expect(!refus.ok && refus.erreurs[0]!.message).toContain('condition non remplie');
    const r = agir('coup-de-corne', minotaure(), [15, 3], { cible: nain() });
    if (!r.ok) throw new Error(r.erreurs[0]!.message);
    // FOR 15 + 4 = 19 : Contact 1 + 4 ; 15 + 5 = 20 contre Défense 17
    expect([r.resultat.reussi, r.resultat.variables.degats]).toEqual([true, 3 + 4]);
    expect(r.resultat.modifications).toEqual([
      { entite: 'cible', attribut: 'PV', operation: 'retirer', valeur: 7 },
    ]);
    const rate = agir('coup-de-corne', minotaure(), [2], { cible: nain() });
    expect(rate.ok && [rate.resultat.reussi, rate.resultat.modifications]).toEqual([false, []]);
  });
});
