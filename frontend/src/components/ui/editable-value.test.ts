import { describe, expect, it } from 'vitest';
import { parseTyped, typedValue } from './editable-value';

describe('saisie directe d’une valeur', () => {
  it('virgule ou point, unité et % ignorés', () => {
    expect(parseTyped('1,5')).toBe(1.5);
    expect(parseTyped('2.25 m')).toBe(2.25);
    expect(parseTyped('40 %')).toBe(40);
    expect(parseTyped('abc')).toBeNull();
  });

  it('ramenée dans l’unité de la donnée et bornée', () => {
    expect(typedValue('40', { min: 0, max: 1, scale: 100 })).toBe(0.4);
    expect(typedValue('1', { min: 0.5, max: 60 })).toBe(1);
    expect(typedValue('90', { min: 0.5, max: 60 })).toBe(60);
    expect(typedValue('0', { min: 0.5, max: 60 })).toBe(0.5);
    expect(typedValue('', { min: 0, max: 1 })).toBeNull();
  });
});
