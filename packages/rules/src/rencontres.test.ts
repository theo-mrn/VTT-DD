/** Règles du générateur de rencontres (`Systeme.rencontres`) : références vérifiées au chargement. */
import { describe, expect, it } from 'vitest';
import { charger } from './chargement/index.js';

const systeme = (rencontres: Record<string, unknown>) => ({
  format: 1,
  id: 'mini-rencontres',
  version: '1.0.0',
  nom: 'Mini rencontres',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      attributs: [
        { cle: 'niveau', nom: 'Niveau', type: 'nombre', nature: 'base', defaut: 1 },
        { cle: 'PV', nom: 'Points de vie', type: 'nombre', nature: 'base', defaut: 10 },
      ],
    },
  ],
  rencontres: {
    niveau: 'niveau',
    puissance: 'niveau',
    cout: [{ puissance: 0, valeur: 10 }],
    difficultes: [{ id: 'facile', nom: 'Facile', parNiveau: [25] }],
    scenarios: [{ id: 'restreint', nom: 'Restreint', min: 1, max: 2, puissanceMax: 1 }],
    ...rencontres,
  },
});

describe('rencontres', () => {
  it('se charge, avec ses défauts (unité, multiplicateurs)', () => {
    const r = charger(systeme({ filtres: ['PV'] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.systeme.source.rencontres).toMatchObject({
      unite: 'XP',
      multiplicateurs: [{ nombre: 1, facteur: 1 }],
      filtres: ['PV'],
    });
  });

  it('attribut inconnu, scénario incohérent, doublon : refusés', () => {
    const r = charger(
      systeme({
        niveau: 'rang',
        filtres: ['Defense'],
        difficultes: [
          { id: 'facile', nom: 'Facile', parNiveau: [25] },
          { id: 'facile', nom: 'Encore', parNiveau: [30] },
        ],
        scenarios: [
          { id: 'x', nom: 'X', min: 3, max: 2, puissanceMax: 1 },
          { id: 'y', nom: 'Y', min: 1, max: 1, puissanceMax: 1, chef: true },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const messages = r.erreurs.map((e) => `${e.chemin} ${e.message}`).join('\n');
    expect(messages).toContain('rencontres/niveau Attribut inconnu : rang');
    expect(messages).toContain('rencontres/filtres/0 Attribut inconnu : Defense');
    expect(messages).toContain('Difficulté en double : facile');
    expect(messages).toContain('min 3 > max 2');
    expect(messages).toContain('2 créatures au moins');
  });
});
