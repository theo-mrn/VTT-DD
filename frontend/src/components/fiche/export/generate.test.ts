import { describe, expect, it } from 'vitest';
import { pdfFileName } from './generate';

describe('nom du fichier PDF', () => {
  it('sans accents ni caractères spéciaux, tirets retirés aux deux bouts', () => {
    expect(pdfFileName('Brom le Nain')).toBe('Brom-le-Nain.pdf');
    expect(pdfFileName('  Éléa !! ')).toBe('Elea.pdf');
    expect(pdfFileName('---')).toBe('fiche.pdf');
    expect(pdfFileName('-'.repeat(50_000) + 'x')).toBe('x.pdf');
  });
});
