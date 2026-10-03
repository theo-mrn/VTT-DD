import { describe, expect, it } from 'vitest';
import { charger } from '../chargement/index.js';
import { miniSymboles } from '../test/mini-systemes.js';
import { checkBestiary } from './bestiaire.js';

const r = charger(miniSymboles);
if (!r.ok) throw new Error();
const systeme = r.systeme;

const creature = {
  id: 'garde',
  nom: 'Garde',
  entite: 'personnage',
  categorie: 'Humanoïde',
  valeurs: { vigueur: 2, Encaissement: 3 },
  actions: [{ nom: 'Matraque', description: 'Frappe.', toucher: 2 }],
};

describe('bestiaire', () => {
  it('accepte des créatures dont les valeurs sont des attributs du type d’entité', () => {
    const b = checkBestiary(
      { format: 1, systeme: 'mini-symboles', creatures: [creature] },
      systeme,
    );
    expect(b.ok).toBe(true);
    expect(b.ok && b.bestiary.creatures[0]?.actions[0]?.toucher).toBe(2);
  });

  it('refuse un autre système, un doublon, un type ou un attribut inconnu', () => {
    const b = checkBestiary(
      {
        format: 1,
        systeme: 'autre',
        creatures: [
          creature,
          { ...creature, valeurs: { FOR: 12 } },
          { ...creature, id: 'navette', entite: 'vehicule' },
        ],
      },
      systeme,
    );
    expect(!b.ok && b.erreurs.map((e) => `${e.chemin} : ${e.message}`)).toEqual([
      'systeme : Bestiaire de autre, système mini-symboles',
      'creatures/1 : Créature en double : garde',
      'creatures/1/valeurs : Attribut inconnu de personnage : FOR',
      'creatures/2 : Type d’entité inconnu : vehicule',
    ]);
  });

  it('refuse une forme invalide', () => {
    expect(checkBestiary({ format: 1, systeme: 'mini-symboles' }, systeme).ok).toBe(false);
  });
});
