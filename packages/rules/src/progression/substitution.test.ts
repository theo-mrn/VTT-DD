import { describe, expect, it } from 'vitest';
import { EtatEntite } from '../schema/index.js';
import { substituerEntree } from './substitution.js';

describe('substitution d’une entrée possédée', () => {
  const etat = EtatEntite.parse({
    type: 'personnage',
    systeme: { id: 'dnd', version: '1' },
    possessions: [
      { entree: 'voie-escrime', rang: 3, choix: { style: ['rapiere'] } },
      { entree: 'voie-autre', rang: 1 },
    ],
    journal: [
      { achat: 'rang-voie', objet: 'voie-escrime', cout: 1, monnaie: 'pc', creation: false },
      { achat: 'rang-voie', objet: 'voie-autre', cout: 1, monnaie: 'pc', creation: false },
    ],
    effetsDesactives: ['voie-escrime/2', 'voie-escrime#a/0', 'voie-escrimeur/1', 'voie-autre/0'],
    usages: { 'voie-escrime': 2, 'voie-autre': 1 },
  });

  it('rangs, choix, journal, effets coupés et usages passent à la nouvelle entrée', () => {
    const e = substituerEntree(etat, 'voie-escrime', 'perso-escrime');
    expect(e.possessions.map((p) => [p.entree, p.rang, p.choix])).toEqual([
      ['perso-escrime', 3, { style: ['rapiere'] }],
      ['voie-autre', 1, {}],
    ]);
    expect(e.journal.map((l) => l.objet)).toEqual(['perso-escrime', 'voie-autre']);
    // Seules les clés de l'entrée remplacée (pas celles d'un nom qui commence pareil)
    expect(e.effetsDesactives).toEqual([
      'perso-escrime/2',
      'perso-escrime#a/0',
      'voie-escrimeur/1',
      'voie-autre/0',
    ]);
    expect(e.usages).toEqual({ 'voie-autre': 1, 'perso-escrime': 2 });
    // L'état reçu n'est pas touché
    expect(etat.possessions[0]!.entree).toBe('voie-escrime');
  });

  it('même entrée : rien ne change', () => {
    expect(substituerEntree(etat, 'voie-autre', 'voie-autre')).toBe(etat);
  });
});
