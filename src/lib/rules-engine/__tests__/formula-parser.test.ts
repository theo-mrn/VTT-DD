import { parseFormulaText, formulaToText } from '../formula-parser';

const KNOWN_KEYS = ['FOR', 'DEX', 'CON'];

describe('parseFormulaText', () => {
  test('mod(FOR)', () => {
    const result = parseFormulaText('mod(FOR)', KNOWN_KEYS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ast).toEqual({ type: 'modifier', key: 'FOR' });
  });

  test('18 + mod(DEX)', () => {
    const result = parseFormulaText('18 + mod(DEX)', KNOWN_KEYS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast).toEqual({ type: 'add', args: [{ type: 'const', value: 18 }, { type: 'modifier', key: 'DEX' }] });
    }
  });

  test('1 + mod(CON) + 1d12', () => {
    const result = parseFormulaText('1 + mod(CON) + 1d12', KNOWN_KEYS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast).toEqual({
        type: 'add',
        args: [
          { type: 'add', args: [{ type: 'const', value: 1 }, { type: 'modifier', key: 'CON' }] },
          { type: 'dice', notation: '1d12' },
        ],
      });
    }
  });

  test('précédence: 2 + 3 * 4', () => {
    const result = parseFormulaText('2 + 3 * 4', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast).toEqual({ type: 'add', args: [{ type: 'const', value: 2 }, { type: 'mul', args: [{ type: 'const', value: 3 }, { type: 'const', value: 4 }] }] });
    }
  });

  test('parenthèses', () => {
    const result = parseFormulaText('(2 + 3) * 4', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast).toEqual({ type: 'mul', args: [{ type: 'add', args: [{ type: 'const', value: 2 }, { type: 'const', value: 3 }] }, { type: 'const', value: 4 }] });
    }
  });

  test('clamp(x, lo, hi)', () => {
    const result = parseFormulaText('clamp(FOR, 0, 20)', KNOWN_KEYS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast).toEqual({ type: 'clamp', arg: { type: 'stat', key: 'FOR' }, lo: { type: 'const', value: 0 }, hi: { type: 'const', value: 20 } });
    }
  });

  test('fonction hors whitelist rejetée', () => {
    const result = parseFormulaText('eval(FOR)', KNOWN_KEYS);
    expect(result.ok).toBe(false);
  });

  test('référence à une stat inconnue rejetée', () => {
    const result = parseFormulaText('mod(INCONNU)', KNOWN_KEYS);
    expect(result.ok).toBe(false);
  });

  test('formule vide rejetée', () => {
    const result = parseFormulaText('', KNOWN_KEYS);
    expect(result.ok).toBe(false);
  });
});

describe('formulaToText round-trip', () => {
  test.each([
    'mod(FOR)',
    '18 + mod(DEX)',
    '1 + mod(CON) + 1d12',
    'clamp(FOR, 0, 20)',
  ])('%s -> AST -> texte -> AST identique', (text) => {
    const first = parseFormulaText(text, KNOWN_KEYS);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const roundTripText = formulaToText(first.ast);
    const second = parseFormulaText(roundTripText, KNOWN_KEYS);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.ast).toEqual(first.ast);
  });
});
