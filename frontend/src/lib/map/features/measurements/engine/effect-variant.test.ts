import { describe, expect, it } from 'vitest';
import { effectVariant } from './skins';

describe('effectVariant', () => {
  it('variante 512 px des effets de la bibliothèque', () => {
    expect(effectVariant('https://assets.yner.fr/Effect/Cone/cone1.webm')).toBe(
      'https://assets.yner.fr/Effect/Cone/512/cone1.webm',
    );
  });

  it('rien hors bibliothèque ou hors effets', () => {
    expect(effectVariant('https://assets.yner.fr/Map/Camp/Animated/x.webm')).toBeNull();
    expect(effectVariant('http://localhost:8333/vtt-dev/x/Effect/cone.webm')).toBeNull();
  });
});
