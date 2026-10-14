// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { SheetSnapshot } from '../snapshot';
import { pdfFileName } from '../generate';
import { pdfText, SheetDocument } from './sheet-document';
import { SHEET_STYLES } from './themes';

const fiche: SheetSnapshot = {
  name: 'Brom Barbe-de-Fer',
  portraitUrl: null,
  system: 'Chroniques',
  concept: 'Un nain bourru au grand cœur',
  details: [
    { label: 'Race', value: 'Nain' },
    { label: 'Profil', value: 'Guerrier' },
  ],
  sections: [
    {
      kind: 'stats',
      title: 'Caractéristiques',
      items: [
        { label: 'Force', short: 'FOR', value: '16', mod: '+3' },
        { label: 'Dextérité', short: 'DEX', value: '9', mod: '−1' },
      ],
    },
    {
      kind: 'resources',
      title: 'Vitalité',
      items: [{ label: 'Points de vie', value: '12', max: '15' }],
    },
    {
      kind: 'list',
      title: 'Voies',
      groups: [
        {
          items: [
            { name: 'Voie du bouclier', note: 'Rang 2' },
            { name: 'Corde', note: '×2' },
          ],
        },
      ],
    },
    { kind: 'currencies', title: 'Bourse', items: [{ label: 'Or', value: '42' }] },
    { kind: 'text', title: 'Histoire', text: 'Né sous la montagne…\nIl cherche son frère.' },
  ],
};

describe('PDF des fiches', () => {
  it.each(SHEET_STYLES)('se génère dans le style %s', async (style) => {
    const buffer = await renderToBuffer(
      // Le document rendu est bien un <Document> : le typage de renderToBuffer ne le voit pas
      createElement(SheetDocument, {
        sheets: [fiche, { ...fiche, name: 'Aela' }],
        portraits: [null, null],
        style,
        title: 'Test',
        labels: { footer: 'Yner', page: (n: number, total: number) => `${n}/${total}` },
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it('ramène les signes hors des polices standard', () => {
    expect(pdfText('−1 · 3 ½ ✦')).toBe('-1 · 3 ½ ');
  });

  it('donne un nom de fichier sûr', () => {
    expect(pdfFileName('Brom l’Éclaireur !')).toBe('Brom-l-Eclaireur.pdf');
  });
});
