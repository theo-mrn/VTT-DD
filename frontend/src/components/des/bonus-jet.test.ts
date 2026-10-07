/**
 * Bonus du lanceur de dés sur le vrai système D&D (public/systemes) : actifs, capacités à
 * invoquer, inactifs à activer, usages limités.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculer, charger, EtatEntite, Presentation, type EtatEntiteSaisi } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import {
  avecBonusRetenus,
  bonusAUsage,
  bonusDeJet,
  bonusRetenus,
  lignesParSource,
  type BonusJet,
} from './bonus-jet';

const PUBLIC = fileURLToPath(new URL('../../../public/systemes/', import.meta.url));
const r = charger(JSON.parse(readFileSync(`${PUBLIC}dnd-classic.json`, 'utf8')));
if (!r.ok) throw new Error(r.erreurs[0]?.message);
const systeme = r.systeme;
const presentation = Presentation.parse(
  JSON.parse(readFileSync(`${PUBLIC}dnd-classic.presentation.json`, 'utf8')),
);

const fiche = (possessions: EtatEntiteSaisi['possessions']) =>
  calculer(
    systeme,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: 'dnd-classic', version: '1.0.0' },
      valeurs: { niveau: 1, jetsDeVie: 9 },
      possessions,
    }),
  );

describe('bonus du lanceur', () => {
  const ligne = (bonus: BonusJet[], source: string) =>
    lignesParSource(bonus, new Set()).find((l) => l.source === source);

  it('une ligne par compétence, son interrupteur est son état sur la fiche', () => {
    const drakonide = fiche([{ entree: 'drakonide' }, { entree: 'race-drakonide', rang: 3 }]);
    const bonus = bonusDeJet(drakonide, '1d20', presentation);
    const race = ligne(bonus, 'Drakonide');
    expect(race?.bonus.map((b) => b.libelle)).toEqual(['FOR +2', 'SAG −2']);
    expect(race).toMatchObject({ groupe: 'valeur', actif: true, mode: 'fiche' });
    expect(race?.bascule).toEqual({ type: 'effet', cles: race?.bonus.map((b) => b.cle) });
    expect(ligne(bonus, 'Ecailles robustes')).toMatchObject({ groupe: 'valeur', actif: true });
    // Un bonus de valeur ne s'ajoute jamais au jet : il est déjà dans la stat
    expect(bonusRetenus(bonus, new Set())).toEqual([]);
  });

  it('capacité à activer éteinte : l’interrupteur active la capacité elle-même', () => {
    const barbare = fiche([{ entree: 'barbare-rage', rang: 3 }]);
    const rage = ligne(bonusDeJet(barbare, '1d20 + Contact', presentation), 'Rage du berserk');
    expect(rage).toMatchObject({
      actif: false,
      bascule: { type: 'source', entree: 'barbare-rage-rage-du-berserk' },
    });
    const cri = ligne(bonusDeJet(barbare, '1d20', presentation), 'Cri de guerre');
    expect(cri?.usages).toMatchObject({ max: 1, restants: 1, par: 'combat' });
  });

  it('capacité à invoquer : allumée pour le jet, son bonus s’ajoute', () => {
    const pagne = fiche([{ entree: 'barbare-pagne', rang: 2 }]);
    const bonus = bonusDeJet(pagne, '1d20 + FOR', presentation);
    const vigueur = bonus.find((b) => b.cle === 'invocation:barbare-pagne-vigueur')!;
    expect(vigueur).toMatchObject({ groupe: 'invocation', mode: 'jet', terme: 4 });
    const retenus = bonusRetenus(bonus, new Set([vigueur.cle]));
    expect(avecBonusRetenus('1d20 + FOR', retenus)).toBe('1d20 + FOR + 4');
    expect(bonusDeJet(pagne, '1d20', null).some((b) => b.groupe === 'invocation')).toBe(false);
  });

  it('un bonus de jet actif s’ajoute de lui-même quand il vise une stat de la formule', () => {
    const base = bonusDeJet(
      fiche([{ entree: 'barbare-pagne', rang: 2 }]),
      '1d20',
      presentation,
    )[0]!;
    const b = (o: Partial<BonusJet>): BonusJet => ({ ...base, terme: 2, ...o });
    const bonus = [
      b({ cle: 'a/0', jet: true, actif: true, concerne: true, mode: 'fiche' }),
      b({ cle: 'b/0', jet: true, actif: true, concerne: false, mode: 'fiche' }),
      b({ cle: 'c/0', jet: true, actif: false, concerne: true, mode: 'fiche' }),
      b({ cle: 'd/0', jet: false, actif: true, concerne: true, mode: 'fiche' }),
    ];
    expect(bonusRetenus(bonus, new Set()).map((x) => x.cle)).toEqual(['a/0']);
  });

  it('usage limité, allumé pour le jet : une utilisation par source', () => {
    const base = bonusDeJet(
      fiche([{ entree: 'barbare-pagne', rang: 2 }]),
      '1d20',
      presentation,
    )[0]!;
    const usages = { max: 1, utilises: 0, restants: 1, par: 'combat' as const };
    const b = (cle: string, entree: string): BonusJet => ({
      ...base,
      cle,
      terme: 2,
      entree,
      usages,
      mode: 'jet',
    });
    const retenus = [b('a/0', 'tir'), b('a/1', 'tir'), { ...b('d/0', 'x'), usages: null }];
    expect(bonusAUsage(retenus).map((x) => x.cle)).toEqual(['a/0']);
  });
});
