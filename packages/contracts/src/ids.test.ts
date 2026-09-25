import { describe, expect, it } from 'vitest';
import { isUuidv7, uuidv7, uuidv7Timestamp } from './ids.js';

describe('uuidv7', () => {
  it('respecte le format RFC 9562 (version 7, variante 10xx)', () => {
    for (let i = 0; i < 200; i++) expect(isUuidv7(uuidv7())).toBe(true);
  });

  it("encode l'horodatage en millisecondes", () => {
    const t = Date.UTC(2026, 8, 25, 14, 21, 0);
    expect(uuidv7Timestamp(uuidv7(t))).toBe(t);
  });

  it("se trie dans l'ordre de création d'une milliseconde à l'autre", () => {
    const ids = [0, 1, 2, 1000, 86_400_000].map((d) => uuidv7(1_700_000_000_000 + d));
    expect([...ids].sort()).toEqual(ids);
  });

  it('est unique', () => {
    const t = Date.now();
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7(t)));
    expect(ids.size).toBe(10_000);
  });

  it('refuse un UUIDv4', () => {
    expect(isUuidv7('1b4e28ba-2fa1-41d2-883f-0016d3cca427')).toBe(false);
  });
});
