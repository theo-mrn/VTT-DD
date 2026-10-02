import { describe, expect, it } from 'vitest';
import { categoryOf, placeLabels } from './places.js';

describe('où sert un fichier', () => {
  it('libellés uniques, traces d’import ignorées, table inconnue gardée telle quelle', () => {
    expect(placeLabels(['notes', 'note_pins', 'legacy_ids', 'maps'])).toEqual([
      'Note',
      'Fond de scène',
    ]);
    expect(placeLabels(['nouvelle_table'])).toEqual(['nouvelle_table']);
  });

  it('catégorie : son, puis usage réservé, puis tables, puis dossier', () => {
    const k = (key: string, usage: string | null = null, usedBy: string[] = []) =>
      categoryOf({ key, usage, usedBy });
    expect(k('audio/assets/c/a/original.mp3', 'map-background')).toBe('sounds');
    expect(k('campaigns/c/f.png', 'npc-image', ['maps'])).toBe('npcs');
    expect(k('campaigns/c/f.png', null, ['map_drawings', 'object_templates'])).toBe('objects');
    expect(k('characters/p/f.png')).toBe('characters');
    expect(k('campaigns/c/f.png')).toBe('other');
  });
});
