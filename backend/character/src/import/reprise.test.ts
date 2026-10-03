/**
 * Reprise des personnages déjà importés (sans base) : un personnage D&D importé par le
 * premier import (objets hors catalogue écartés, pièces créditées dans `bourse`) est
 * repris avec la migration actuelle, deux fois de suite.
 */
import { calculer, EtatEntite, type SystemeCharge } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { chargerSource } from '../../../../packages/systemes/src/test-utils.js';
import type { DocFirestore, ObjetInventaireLegacy } from './legacy.js';
import { reprendreEtat } from './reprise.js';
import { transformerPersonnage } from './transformer.js';

const systeme: SystemeCharge = chargerSource('dnd-classic');

let n = 0;
const objet = (message: string, extra: ObjetInventaireLegacy = {}) => {
  n++;
  return {
    path: `Inventaire/salle/perso/obj${n}`,
    id: `obj${n}`,
    data: { message, category: 'autre', quantity: 1, ...extra },
  } satisfies DocFirestore<ObjetInventaireLegacy>;
};

const epee = objet('Épée longue', { category: 'armes-contact' });
const potion = objet('Petite potion de vie', { category: 'potions', quantity: 2 });
const or = objet("pièce d'OR", { category: 'bourse', quantity: 1 });
const cuivre = objet('pièce de cuivre', { category: 'bourse', quantity: 5 });
const rapiere = objet('Rapière (DM 1d6)', { category: 'armes-contact', diceSelection: '1d6' });
const amulette = objet('Amulette', { category: 'autre' });

const migre = transformerPersonnage(
  {
    path: 'cartes/salle/characters/p1',
    id: 'p1',
    data: { Nomperso: 'Brom', Race: 'nain', Profile: 'Guerrier', niveau: 1, FOR: 12 },
  },
  {
    systemeId: 'dnd-classic',
    systemes: { 'dnd-classic': systeme },
    inventaire: [epee, potion, or, cuivre, rapiere, amulette],
    bonus: [
      {
        path: `Bonus/salle/perso/${amulette.id}`,
        id: amulette.id,
        data: { name: 'Amulette', active: true, category: 'Inventaire', Defense: 1 },
      },
    ],
  },
);

/** État laissé par le premier import : épée seule, bourse créditée, bonus de l'amulette libre. */
const ancien = EtatEntite.parse({
  type: 'personnage',
  systeme: { id: 'dnd-classic', version: '1.0.0' },
  valeurs: { ...migre.etat.valeurs, bourse: 10 + 3 },
  possessions: migre.etat.possessions.filter(
    (p) =>
      !['objet', 'arme'].includes(systeme.entrees.get(p.entree)!.sorte) ||
      p.entree === 'epee-longue',
  ),
  bonus: [
    {
      id: 'amulette',
      nom: 'Amulette',
      source: 'Inventaire',
      actif: true,
      effets: [
        {
          sur: 'attribut',
          attribut: 'Defense',
          operation: 'ajouter',
          valeur: '1',
          description: 'Amulette',
        },
      ],
    },
  ],
  journal: [
    ...migre.etat.journal,
    { achat: 'acheter-arme', objet: 'dague', cout: 3, monnaie: 'pa', creation: false },
  ],
});

describe('reprise des personnages déjà importés', () => {
  const r = reprendreEtat(systeme, ancien, migre.objets, new Set());
  const f = calculer(systeme, r.etat);
  const quantites = (id: string) =>
    r.etat.possessions.filter((p) => p.entree === id).map((p) => p.quantite ?? 1);

  it('ajoute les objets écartés, sans recréer ceux du premier import', () => {
    expect(r.bilan).toMatchObject({ ajoutes: 5, dejaImportes: 1, dejaRepris: 0 });
    expect(quantites('epee-longue')).toEqual([1]);
    expect(quantites('petite-potion-de-vie')).toEqual([2]);
    expect(quantites('piece-de-cuivre')).toEqual([5]);
    const libres = r.etat.possessions.filter((p) => p.entree === 'objet-libre');
    expect(libres.map((p) => p.champs.nom)).toEqual(['Amulette']);
    const arme = r.etat.possessions.find((p) => p.entree === 'arme-libre');
    expect(arme?.champs).toMatchObject({ nom: 'Rapière (DM 1d6)', attaque: 'Contact', faces: 6 });
  });

  it('le bonus libre de l’objet lui revient, sans compter deux fois', () => {
    expect(r.bilan.bonusRattaches).toBe(1);
    expect(r.etat.bonus).toEqual([]);
    expect(f.valeur('Defense')).toBe(calculer(systeme, ancien).valeur('Defense'));
  });

  it('bourse : les pièces legacy reprises, l’écart (gains, dépenses) converti en pièces', () => {
    // 13 pa − 3 dépensés − 10 pa de pièces legacy (1 po + 5 pc arrondis) = 0
    expect(r.bilan.bourse).toEqual({ valeur: 10, pieces: {} });
    expect(quantites('piece-d-or')).toEqual([1]);
    expect(r.etat.valeurs).not.toHaveProperty('bourse');
    expect(r.bilan.valeursRetirees).toEqual(['bourse']);
    // Ligne d'achat en pa : monnaie et achat retirés des règles
    expect(r.bilan.lignesRetirees).toBe(1);
    expect(r.etat.journal.every((l) => l.monnaie === 'pointsCapacite')).toBe(true);
    expect(f.erreurs).toEqual([]);
  });

  it('idempotente : rejouée avec ses traces, elle ne change plus rien', () => {
    const encore = reprendreEtat(systeme, r.etat, migre.objets, new Set(r.nouvellesTraces));
    expect(encore.etat).toEqual(r.etat);
    expect(encore.bilan).toMatchObject({ ajoutes: 0, dejaRepris: 6, dejaImportes: 0 });
    expect(encore.nouvellesTraces).toEqual([]);
  });

  it('bourse sans pièces legacy : convertie en pièces d’or et d’argent', () => {
    const seul = reprendreEtat(
      systeme,
      { ...ancien, valeurs: { bourse: 23 }, journal: [] },
      [],
      new Set(),
    );
    expect(seul.bilan.bourse).toEqual({
      valeur: 23,
      pieces: { 'piece-d-or': 2, 'piece-d-argent': 3 },
    });
    expect(
      seul.etat.possessions
        .filter((p) => p.entree.startsWith('piece'))
        .map((p) => [p.entree, p.quantite]),
    ).toEqual([
      ['piece-d-or', 2],
      ['piece-d-argent', 3],
    ]);
  });
});
