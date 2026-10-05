import { describe, expect, it } from 'vitest';
import { pourWebgl, vignette } from './assets';

describe('adresse pour WebGL', () => {
  it('donne une entrée de cache à part aux images du CDN, vignettes comprises', () => {
    expect(pourWebgl('https://assets.yner.fr/bestaire/aboleth.png')).toBe(
      'https://assets.yner.fr/bestaire/aboleth.png?cors=1',
    );
    expect(pourWebgl(vignette('https://assets.yner.fr/bestaire/aboleth.png', 256))).toBe(
      'https://assets.yner.fr/cdn-cgi/image/width=256,format=auto/bestaire/aboleth.png?cors=1',
    );
    expect(pourWebgl('https://assets.yner.fr/a.png?v=2')).toBe(
      'https://assets.yner.fr/a.png?v=2&cors=1',
    );
  });

  it('laisse les autres adresses telles quelles', () => {
    expect(pourWebgl('/images/fond.webp')).toBe('/images/fond.webp');
    expect(pourWebgl('https://exemple.fr/a.png')).toBe('https://exemple.fr/a.png');
  });
});
