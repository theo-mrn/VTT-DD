import { describe, expect, it } from 'vitest';
import { createCatalog, libraryOf, starwarsKey } from './index.js';

describe('catalogue', () => {
  const catalog = createCatalog({ publishedBase: 'https://cdn.test/audio/catalog' });

  it('89 entrées par défaut, 20 Star Wars, ids uniques, URL absolues sans espaces', () => {
    expect(catalog.entries('default')).toHaveLength(89);
    expect(catalog.entries('starwars')).toHaveLength(20);
    const all = [...catalog.entries('default'), ...catalog.entries('starwars')];
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) expect(e.url).toMatch(/^https:\/\/[^ ]+$/);
  });

  it('sortes : musiques, ambiances, effets', () => {
    expect(catalog.get('default.chill.chill-1')?.kind).toBe('music');
    expect(catalog.get('default.nature.pluie')?.kind).toBe('ambience');
    expect(catalog.get('default.combat.epees')?.kind).toBe('sfx');
  });

  it('retrouve une entrée par son URL legacy (espaces, encodage)', () => {
    const e = catalog.byUrl('https://assets.yner.fr/Audio/Foret de_nuit.mp3');
    expect(e?.name).toBe('Forêt de Nuit');
    expect(catalog.byUrl('https://assets.yner.fr/Audio/Foret%20de_nuit.mp3')).toBe(e);
    expect(catalog.byUrl('pas une url')).toBeUndefined();
  });

  it('bibliothèque du système, clés Star Wars publiées', () => {
    expect(libraryOf('star-wars-eote')).toBe('starwars');
    expect(libraryOf('dnd-classic')).toBe('default');
    expect(libraryOf(undefined)).toBe('default');
    expect(starwarsKey('/effects/Star%20Wars/Droid/Droid%20movement%201.wav')).toBe(
      'audio/catalog/starwars/droid/droid-movement-1.m4a',
    );
    expect(catalog.categories('starwars').map((c) => c.id)).toContain('lightsaber');
    expect(createCatalog({ publishedBase: null }).entries('starwars')).toEqual([]);
  });
});
