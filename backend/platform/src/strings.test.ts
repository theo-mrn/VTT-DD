import { describe, expect, it } from 'vitest';
import { withoutTrailingSlashes } from './strings.js';

describe('withoutTrailingSlashes', () => {
  it('retire toutes les barres de fin, et seulement elles', () => {
    expect(withoutTrailingSlashes('https://cdn.test/')).toBe('https://cdn.test');
    expect(withoutTrailingSlashes('https://cdn.test///')).toBe('https://cdn.test');
    expect(withoutTrailingSlashes('https://cdn.test/a')).toBe('https://cdn.test/a');
    expect(withoutTrailingSlashes('///')).toBe('');
    expect(withoutTrailingSlashes('')).toBe('');
  });
});
