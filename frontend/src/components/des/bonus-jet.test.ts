/**
 * Bonus du lanceur de dés sur le vrai système D&D (public/systemes) : actifs, capacités à
 * invoquer, inactifs à activer, usages limités.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculer, charger, EtatEntite, Presentation, type EtatEntiteSaisi } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { avecBonusChoisis, bonusAUsage, bonusDeJet, type BonusJet } from './bonus-jet';

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
  it('capacité éteinte : listée inactive, à activer, avec ses usages', () => {
    const barbare = fiche([{ entree: 'barbare-rage', rang: 3 }]);
    const bonus = bonusDeJet(barbare, '1d20 + Contact', presentation);
    const rage = bonus.find((b) => b.source === 'Rage du berserk');
    expect(rage).toMatchObject({ etat: 'inactif', activable: true });
    const cri = bonus.find((b) => b.source === 'Cri de guerre');
    expect(cri?.usages).toMatchObject({ max: 1, restants: 1, par: 'combat' });
    // Allumée : elle passe dans les actifs
    const enRage = fiche([
      { entree: 'barbare-rage', rang: 3 },
      { entree: 'barbare-rage-rage-du-berserk', actif: true },
    ]);
    expect(
      bonusDeJet(enRage, '1d20', presentation).find((b) => b.source === 'Rage du berserk'),
    ).toMatchObject({ etat: 'actif', activable: false });
  });

  it('capacité à invoquer : son bonus chiffré s’ajoute au jet', () => {
    const pagne = fiche([{ entree: 'barbare-pagne', rang: 2 }]);
    const bonus = bonusDeJet(pagne, '1d20 + FOR', presentation);
    const vigueur = bonus.find((b) => b.cle === 'invocation:barbare-pagne-vigueur');
    expect(vigueur).toMatchObject({ etat: 'invocation', terme: 4, libelle: '+4' });
    expect(avecBonusChoisis('1d20 + FOR', bonus, new Set([vigueur!.cle]))).toBe('1d20 + FOR + 4');
    // Sans la présentation : pas d'invocation
    expect(bonusDeJet(pagne, '1d20', null).some((b) => b.etat === 'invocation')).toBe(false);
  });

  it('retenus à usage limité : une utilisation par source, jamais pour une capacité à activer', () => {
    const base = bonusDeJet(
      fiche([{ entree: 'barbare-pagne', rang: 2 }]),
      '1d20',
      presentation,
    )[0]!;
    const usages = { max: 1, utilises: 0, restants: 1, par: 'combat' as const };
    const b = (cle: string, entree: string, activable = false): BonusJet => ({
      ...base,
      cle,
      terme: 2,
      entree,
      usages,
      activable,
    });
    const bonus = [
      b('a/0', 'tir'),
      b('a/1', 'tir'),
      b('c/0', 'rage', true),
      { ...b('d/0', 'x'), usages: null },
    ];
    const retenus = bonusAUsage(bonus, new Set(bonus.map((x) => x.cle)));
    expect(retenus.map((x) => x.cle)).toEqual(['a/0']);
    expect(bonusAUsage(bonus, new Set())).toEqual([]);
  });
});
