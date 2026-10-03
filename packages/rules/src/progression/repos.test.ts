import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { EtatEntite, type EtatEntiteSaisi } from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import { recuperer } from './index.js';

function systeme(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

const d20 = systeme(miniD20);
const sym = systeme(miniSymboles);

const etat = (s: SystemeCharge, e: Partial<EtatEntiteSaisi>) =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: s.source.id, version: s.source.version },
    ...e,
  });

describe('repos', () => {
  it('les PV reviennent au maximum', () => {
    const e = etat(d20, { valeurs: { PV: 3, CON: 14 } });
    const apres = recuperer(calculer(d20, e));
    // 8 + mod(CON) 2
    expect(apres.valeurs).toEqual({ PV: 10, CON: 14 });
    expect(e.valeurs.PV).toBe(3);
  });

  it('les blessures reviennent au minimum', () => {
    const e = etat(sym, { valeurs: { Blessures: 7 } });
    expect(recuperer(calculer(sym, e)).valeurs.Blessures).toBe(0);
  });

  it('seulement les ressources demandées', () => {
    const s = systeme({
      ...miniD20,
      entites: [
        {
          ...miniD20.entites[0]!,
          attributs: [
            ...miniD20.entites[0]!.attributs,
            { cle: 'Ki', nom: 'Ki', nature: 'ressource', max: '3' },
          ],
        },
      ],
    });
    const e = etat(s, { valeurs: { PV: 1, Ki: 0 } });
    expect(recuperer(calculer(s, e), ['Ki']).valeurs).toEqual({ PV: 1, Ki: 3 });
    expect(() => recuperer(calculer(s, e), ['FOR'])).toThrow(
      'FOR n’est pas une ressource de Personnage',
    );
  });
});
