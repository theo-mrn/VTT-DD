import { analyser, calculer, EtatEntite, evaluer, normaliserFormuleJet } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { chargerSource } from './test-utils.js';

const norm = (id: string, f: string) => {
  const r = normaliserFormuleJet(chargerSource(id), 'personnage', f);
  return r.ok ? r.formule : `ERREUR ${r.erreur.message} @${r.erreur.position}`;
};

describe('formules du lanceur en clés nues (systèmes de référence)', () => {
  for (const id of ['dnd-classic', 'nooblies']) {
    it(`${id} : caractéristiques au modificateur, attaques et initiative à la valeur`, () => {
      expect(norm(id, '1d20+CON')).toBe('1d20+mod(@CON)');
      expect(norm(id, '1d20+Contact')).toBe('1d20+@Contact');
      expect(norm(id, '1d6-CON+8')).toBe('1d6-mod(@CON)+8');
      expect(norm(id, '2d6+INIT')).toBe('2d6+@INIT');
      expect(norm(id, '1d20+Defense')).toBe('1d20+@Defense');
      expect(norm(id, '1d20 + mod(@FOR) + @DEX')).toBe('1d20 + mod(@FOR) + @DEX');
    });

    it(`${id} : clé inexistante en erreur lisible`, () => {
      expect(norm(id, '1d20+CONS')).toBe('ERREUR « CONS » n’est pas un attribut du personnage @5');
    });
  }

  it('star-wars-eote : aucun attribut jetable, les clés nues valent leur valeur', () => {
    expect(norm('star-wars-eote', '1d10+vigueur')).toBe('1d10+@vigueur');
    expect(norm('star-wars-eote', '1d10+CON')).toBe(
      'ERREUR « CON » n’est pas un attribut du personnage @5',
    );
  });

  it('dnd-classic : la formule normalisée se calcule sur la fiche', () => {
    const systeme = chargerSource('dnd-classic');
    const fiche = calculer(
      systeme,
      EtatEntite.parse({
        type: 'personnage',
        systeme: { id: systeme.source.id, version: systeme.source.version },
        valeurs: { CON: 14 },
      }),
    );
    const r = normaliserFormuleJet(systeme, 'personnage', '1d6-CON+8');
    expect(r.ok).toBe(true);
    const a = analyser(r.ok ? r.formule : '');
    expect(a.ok).toBe(true);
    const e = evaluer(a.ok ? a.noeud : { t: 'nombre', v: 0, pos: 0 }, {
      ...fiche.contexte({ aleatoire: { entier: () => 1 } }),
    });
    // 1 (dé) - 2 (modificateur de CON 14) + 8
    expect(e.valeur).toBe(7);
  });
});
