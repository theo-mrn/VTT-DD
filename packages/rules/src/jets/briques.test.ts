import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { aleatoireImpose } from '../formules/index.js';
import { EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import { executerAction } from './index.js';

function systeme(s: SystemeSaisi): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

const d20: SystemeSaisi = {
  ...miniD20,
  actions: [
    ...miniD20.actions!,
    {
      id: 'test-carac',
      nom: 'Test de caractéristique',
      pour: ['personnage'],
      parametres: [{ id: 'carac', nom: 'Caractéristique', type: 'attribut', groupe: 'carac' }],
      jet: { type: 'numerique', formule: '1d20 + modificateur(carac)', fumble: 'naturel == 1' },
      apres: [{ cle: 'maladresse', formule: 'si(fumble, 1, 0)' }],
    },
    {
      id: 'coup-de-corne',
      nom: 'Coup de corne',
      pour: ['personnage'],
      exige: 'possede("elfe")',
      jet: { type: 'numerique', formule: '1d6 + mod(@FOR)' },
    },
  ],
};
const sd20 = systeme(d20);
const ssym = systeme({
  ...miniSymboles,
  actions: miniSymboles.actions!.map((a) => ({
    ...a,
    parametres: a.parametres!.map((p) => (p.type === 'entree' ? { ...p, possedee: false } : p)),
  })),
});

const fiche = (s: SystemeCharge, e: Partial<EtatEntiteSaisi> = {}) =>
  calculer(
    s,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: s.source.id, version: s.source.version },
      ...e,
    }),
  );

describe('briques génériques des actions', () => {
  it('paramètre « attribut » lu par modificateur()', () => {
    const r = executerAction(sd20, {
      action: 'test-carac',
      acteur: fiche(sd20, { valeurs: { DEX: 16 } }),
      parametres: { carac: 'DEX' },
      aleatoire: aleatoireImpose([1]),
    });
    expect(r.ok && r.resultat.jet.type === 'numerique' && r.resultat.jet.total).toBe(4);
    expect(r.ok && r.resultat.variables.maladresse).toBe(1);
  });

  it('refuse un attribut hors de la liste proposée', () => {
    const r = executerAction(sd20, {
      action: 'test-carac',
      acteur: fiche(sd20),
      parametres: { carac: 'Defense' },
      aleatoire: aleatoireImpose([10]),
    });
    expect(!r.ok && r.erreurs[0]!.message).toContain('n’est pas proposé');
  });

  it('action réservée par « exige »', () => {
    const sans = executerAction(sd20, {
      action: 'coup-de-corne',
      acteur: fiche(sd20),
      aleatoire: aleatoireImpose([3]),
    });
    expect(!sans.ok && sans.erreurs[0]!.message).toBe(
      'Coup de corne : condition non remplie (possede("elfe"))',
    );
    const avec = executerAction(sd20, {
      action: 'coup-de-corne',
      acteur: fiche(sd20, { possessions: [{ entree: 'elfe' }] }),
      aleatoire: aleatoireImpose([3]),
    });
    expect(avec.ok).toBe(true);
  });

  it('compétence non possédée testée au rang 0 quand possedee: false', () => {
    const r = executerAction(ssym, {
      action: 'test',
      acteur: fiche(ssym, { valeurs: { vigueur: 3 } }),
      parametres: { competence: 'athletisme', difficulte: 0 },
      aleatoire: aleatoireImpose([1, 1, 1]),
    });
    expect(r.ok && r.resultat.jet.type === 'symboles' && r.resultat.jet.pool).toEqual([
      { de: 'aptitude', nombre: 3 },
    ]);
  });
});
