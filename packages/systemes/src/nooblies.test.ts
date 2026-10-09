/**
 * Nooblies Chroniques : héritier de D&D classique (docs/regles.md, `herite`), qui n'en change
 * que le tirage des caractéristiques. Les règles elles-mêmes sont testées avec D&D classique.
 */
import { describe, expect, it } from 'vitest';
import { aleatoireGraine, EtatEntite, tirerEtape, type SystemeCharge } from '@vtt/rules';
import { lirePresentation, lireSysteme } from './sources.js';
import { chargerSource } from './test-utils.js';

const systeme: SystemeCharge = chargerSource('nooblies');

describe('Nooblies Chroniques', () => {
  it('reprend tout D&D classique, sauf sa création', () => {
    const n = lireSysteme('nooblies');
    const d = lireSysteme('dnd-classic');
    const sans = (s: Record<string, unknown>) =>
      JSON.stringify({ ...s, id: 0, version: 0, nom: 0, description: 0, creation: 0 });
    expect(sans(n)).toBe(sans(d));
    // Voies de capacités, achetées comme dans D&D classique
    expect([...systeme.entrees.values()].some((e) => e.sorte === 'voie')).toBe(true);
    expect(systeme.achats.has('rang-voie')).toBe(true);
  });

  it('a la présentation de D&D classique, à son nom', () => {
    const p = lirePresentation('nooblies') as Record<string, unknown>;
    expect(p.systeme).toBe('nooblies');
    expect({ ...p, systeme: 0 }).toEqual({
      ...(lirePresentation('dnd-classic') as Record<string, unknown>),
      systeme: 0,
    });
  });

  it('tire 1d15 + 5, relancé jusqu’à 3 valeurs paires et +6 de modificateurs', () => {
    for (const graine of ['a', 'b', 'c']) {
      const etat = EtatEntite.parse({
        type: 'personnage',
        systeme: { id: systeme.source.id, version: systeme.source.version },
        creation: true,
      });
      const r = tirerEtape(systeme, etat, 'caracteristiques', aleatoireGraine(graine));
      if (!r.ok) throw new Error(r.erreur);
      const v = r.retenu.valeurs;
      expect(v).toHaveLength(6);
      expect(v.every((x) => x >= 6 && x <= 20)).toBe(true);
      expect(v.filter((x) => x % 2 === 0)).toHaveLength(3);
      expect(v.reduce((s, x) => s + Math.floor((x - 10) / 2), 0)).toBe(6);
    }
  });
});
