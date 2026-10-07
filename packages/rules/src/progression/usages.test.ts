import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { charger } from '../chargement/index.js';
import { EtatEntite, type EtatEntiteSaisi, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { periodesCloses, PERIODES_REPOS, remettreUsages, usagesDe, utiliser } from './index.js';

const saisi: SystemeSaisi = {
  ...miniD20,
  sortes: [...miniD20.sortes!, { id: 'pouvoir', nom: 'Pouvoir', pour: ['personnage'] }],
  catalogue: [
    ...miniD20.catalogue!,
    { id: 'second-souffle', sorte: 'pouvoir', nom: 'Second souffle', usages: { par: 'combat' } },
    { id: 'riposte', sorte: 'pouvoir', nom: 'Riposte', usages: { par: 'tour' } },
    {
      id: 'inspiration',
      sorte: 'pouvoir',
      nom: 'Inspiration',
      usages: { max: '1 + mod(@FOR)', par: 'jour' },
    },
    { id: 'sans-limite', sorte: 'pouvoir', nom: 'Sans limite' },
  ],
};
const r = charger(saisi);
if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
const s = r.systeme;

const fiche = (e: Partial<EtatEntiteSaisi> = {}) =>
  calculer(
    s,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: s.source.id, version: '1.0.0' },
      valeurs: { niveau: 1, FOR: 14 },
      ...e,
    }),
  );

/** Consomme, en échouant au premier refus. */
function utilise(etat: EtatEntite, entree: string, rendre = false): EtatEntite {
  const u = utiliser(calculer(s, etat), entree, rendre);
  if (!u.ok) throw new Error(u.erreur);
  return u.etat;
}

describe('usages limités', () => {
  it('max lu sur le porteur, 1 par défaut ; rien pour une entrée sans usages', () => {
    const f = fiche();
    expect(usagesDe(f, 'second-souffle')).toEqual({
      max: 1,
      utilises: 0,
      restants: 1,
      par: 'combat',
    });
    expect(usagesDe(f, 'inspiration')?.max).toBe(1 + 2);
    expect(usagesDe(f, 'sans-limite')).toBeUndefined();
  });

  it('consommer jusqu’à épuisement, puis refus ; rendre corrige', () => {
    const une = utilise(fiche().etat, 'second-souffle');
    expect(une.usages).toEqual({ 'second-souffle': 1 });
    const refus = utiliser(calculer(s, une), 'second-souffle');
    expect(refus).toEqual({
      ok: false,
      erreur: 'Second souffle : plus d’utilisation (1 par combat)',
    });
    expect(utilise(une, 'second-souffle', true).usages).toEqual({});
    expect(utiliser(fiche(), 'sans-limite').ok).toBe(false);
  });

  it('rendues à la fin de leur période : round, combat, repos', () => {
    let etat = fiche().etat;
    for (const id of ['second-souffle', 'riposte', 'inspiration']) etat = utilise(etat, id);
    const finRound = remettreUsages(s, etat, periodesCloses([{ type: 'fin-round' }]));
    expect(finRound?.usages).toEqual({ 'second-souffle': 1, inspiration: 1 });
    const finCombat = remettreUsages(s, etat, periodesCloses([{ type: 'fin-combat' }]));
    expect(finCombat?.usages).toEqual({ inspiration: 1 });
    expect(remettreUsages(s, etat, PERIODES_REPOS)?.usages).toEqual({});
    // Rien de clos, ou rien de consommé : rien à enregistrer
    expect(remettreUsages(s, etat, periodesCloses([{ type: 'debut-tour' }]))).toBeUndefined();
    expect(remettreUsages(s, fiche().etat, PERIODES_REPOS)).toBeUndefined();
  });

  it('une entrée disparue du catalogue est oubliée', () => {
    const etat = { ...fiche().etat, usages: { disparue: 2 } };
    expect(remettreUsages(s, etat, [])?.usages).toEqual({});
  });

  it('un état enregistré avant les usages limités (sans `usages`) ne casse rien', () => {
    const ancien = { ...fiche().etat, usages: undefined } as unknown as EtatEntite;
    expect(remettreUsages(s, ancien, PERIODES_REPOS)).toBeUndefined();
    expect(usagesDe(calculer(s, ancien), 'second-souffle')?.utilises).toBe(0);
    const u = utiliser(calculer(s, ancien), 'second-souffle');
    expect(u.ok && u.etat.usages).toEqual({ 'second-souffle': 1 });
  });
});
