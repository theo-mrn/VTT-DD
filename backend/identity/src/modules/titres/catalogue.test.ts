import { describe, expect, it } from 'vitest';
import { catalogue, DEFINITIONS_TITRES, descriptionDe, slugDe } from './catalogue.js';

describe('catalogue des titres', () => {
  it('calcule les slugs comme l’ancienne app, avec des tirets', () => {
    expect(slugDe('Béni des Dieux')).toBe('beni-des-dieux');
    expect(slugDe('Maudit des dés')).toBe('maudit-des-des');
    expect(slugDe("Maître d'Armes")).toBe('maitre-d-armes');
    expect(slugDe("L'Érudit")).toBe('l-erudit');
    expect(slugDe('rat_de_taverne')).toBe('rat-de-taverne');
    expect(slugDe('  Demi-Dieu  ')).toBe('demi-dieu');
  });

  it('produit des slugs uniques, valides pour la contrainte SQL, dans l’ordre du code', () => {
    const lignes = catalogue();
    expect(lignes).toHaveLength(DEFINITIONS_TITRES.length);
    expect(new Set(lignes.map((l) => l.slug)).size).toBe(lignes.length);
    for (const l of lignes) expect(l.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(lignes.map((l) => l.sortOrder)).toEqual(lignes.map((_, i) => i));
  });

  it('reprend les titres par défaut, les rangs de temps et les titres des dés', () => {
    const lignes = catalogue();
    const parSlug = new Map(lignes.map((l) => [l.slug, l]));
    expect(lignes.filter((l) => l.defaultUnlocked).map((l) => l.slug)).toEqual([
      'vagabond',
      'rat-de-taverne',
      'aventurier',
    ]);
    expect(parSlug.get('divinite')!.condition).toEqual({ type: 'time', minutes: 1000 });
    expect(parSlug.get('maudit-des-des')!.condition).toMatchObject({ type: 'event' });
    expect(parSlug.get('beni-des-dieux')!.description).toBe(
      'Faire une réussite critique (20 naturel)',
    );
    expect(parSlug.get('mecene')!.condition).toEqual({ type: 'premium' });
    expect(parSlug.get('maitre-du-jeu')!.condition).toBeNull();

    // Les rangs de temps sont croissants
    const rangs = lignes
      .filter((l) => l.condition?.type === 'time' && l.slug !== 'novice-aventurier')
      .map((l) => (l.condition as { minutes: number }).minutes);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  it('refuse deux libellés donnant le même slug', () => {
    expect(() =>
      catalogue([
        { label: 'Héros', defaultUnlocked: false },
        { label: 'heros', defaultUnlocked: false },
      ]),
    ).toThrow(/double/);
  });

  it('décrit chaque type de condition', () => {
    expect(descriptionDe({ type: 'time', minutes: 30 })).toBe('Jouer 30 minutes');
    expect(descriptionDe({ type: 'premium' })).toBe('Réservé aux membres premium');
    expect(descriptionDe(null)).toBeNull();
  });
});
