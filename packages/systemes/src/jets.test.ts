import { attributsJetables, calculer, declarationsJetables, EtatEntite } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { chargerSource, presentationSource } from './test-utils.js';

/** Clé, titre du groupe et terme ajouté à la formule, pour chaque attribut jetable. */
function lanceur(id: string, entite: string) {
  return declarationsJetables(chargerSource(id), entite, {
    presentation: presentationSource(id),
  }).map((d) => [d.cle, d.groupe.titre, d.terme]);
}

// Charge et calcule les systèmes de référence complets : lent sur un runner de CI partagé
describe('attributs proposés au lanceur de dés', { timeout: 60_000 }, () => {
  for (const id of ['dnd-classic', 'nooblies']) {
    it(`${id} : caractéristiques au modificateur, attaques et initiative à la valeur`, () => {
      expect(lanceur(id, 'personnage')).toEqual([
        ['FOR', 'Caractéristiques', 'mod(@FOR)'],
        ['DEX', 'Caractéristiques', 'mod(@DEX)'],
        ['CON', 'Caractéristiques', 'mod(@CON)'],
        ['SAG', 'Caractéristiques', 'mod(@SAG)'],
        ['INT', 'Caractéristiques', 'mod(@INT)'],
        ['CHA', 'Caractéristiques', 'mod(@CHA)'],
        ['Contact', 'Attaques et initiative', '@Contact'],
        ['Distance', 'Attaques et initiative', '@Distance'],
        ['Magie', 'Attaques et initiative', '@Magie'],
        ['INIT', 'Attaques et initiative', '@INIT'],
      ]);
    });
  }

  it('dnd-classic : apports calculés sur une fiche', () => {
    const s = chargerSource('dnd-classic');
    const f = calculer(
      s,
      EtatEntite.parse({
        type: 'personnage',
        systeme: { id: s.source.id, version: s.source.version },
        valeurs: { FOR: 14, DEX: 13, niveau: 2 },
      }),
    );
    const apports = Object.fromEntries(attributsJetables(f).map((a) => [a.cle, a.apport]));
    expect(apports).toMatchObject({ FOR: 2, DEX: 1, Contact: 4, Distance: 3, INIT: 13 });
    expect(apports).not.toHaveProperty('Defense');
    expect(apports).not.toHaveProperty('PV_Max');
  });

  it('star-wars-eote : aucun attribut, les jets passent par les compétences', () => {
    const s = chargerSource('star-wars-eote');
    for (const entite of s.entites.keys()) expect(lanceur('star-wars-eote', entite)).toEqual([]);
  });
});
