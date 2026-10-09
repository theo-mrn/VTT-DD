/** Bases déduites de valeurs calculées lues sur une fiche (import, docs/import-fiche.md). */
import { describe, expect, it } from 'vitest';
import { calculer } from './calcul/index.js';
import { charger, type SystemeCharge } from './chargement/index.js';
import { deduireBases } from './progression/index.js';
import { EtatEntite, type SystemeSaisi } from './schema/index.js';

const source: SystemeSaisi = {
  format: 1,
  id: 'mini-pv',
  version: '1.0.0',
  nom: 'Mini PV',
  modificateur: 'floor((valeur - 10) / 2)',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      attributs: [
        { cle: 'CON', nom: 'Constitution', nature: 'base', defaut: 10, modificateur: true },
        { cle: 'jet', nom: 'Jet de dé de vie', nature: 'base', defaut: 0, min: 0 },
        { cle: 'PV_Max', nom: 'PV max', nature: 'derivee', formule: '1 + mod(@CON) + @jet' },
      ],
    },
  ],
};

function systeme(): SystemeCharge {
  const r = charger(source);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}
const etat = (valeurs: Record<string, number>) =>
  EtatEntite.parse({ type: 'personnage', systeme: { id: 'mini-pv', version: '1.0.0' }, valeurs });

describe('bases déduites', () => {
  it('retrouve le jet de dé de vie à partir du PV max lu', () => {
    const s = systeme();
    const e = deduireBases(s, etat({ CON: 14 }), { PV_Max: 12 }, new Set(['CON']));
    expect(e.valeurs.jet).toBe(9);
    expect(calculer(s, e).valeur('PV_Max')).toBe(12);
  });

  it('ne touche ni aux bases données par la fiche, ni hors des bornes', () => {
    const s = systeme();
    const fixe = deduireBases(
      s,
      etat({ CON: 14, jet: 3 }),
      { PV_Max: 12 },
      new Set(['CON', 'jet']),
    );
    expect(fixe.valeurs.jet).toBe(3);
    const negatif = deduireBases(s, etat({ CON: 14 }), { PV_Max: 1 }, new Set(['CON']));
    expect(negatif.valeurs.jet).toBeUndefined();
  });
});
