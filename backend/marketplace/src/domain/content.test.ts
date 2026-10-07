import { describe, expect, it } from 'vitest';
import { tsQuery } from '../modules/catalog/queries.js';
import { classifyUrl } from './content.js';

const BASE = 'https://files.test';
const LISTING = '0192a0e0-0000-7000-8000-00000000000a';
const CAMPAIGN = '0192a0e0-0000-7000-8000-00000000000b';

describe('adresses d’un pack', () => {
  it('copie nos envois, garde les chemins du front et nos propres copies', () => {
    expect(classifyUrl(`${BASE}/campaigns/${CAMPAIGN}/fond.webp`, BASE, LISTING)).toEqual({
      kind: 'copy',
      sourceKey: `campaigns/${CAMPAIGN}/fond.webp`,
    });
    expect(classifyUrl(`${BASE}/characters/${CAMPAIGN}/t.png`, BASE, LISTING).kind).toBe('copy');
    expect(classifyUrl('/images/tonneau.webp', BASE, LISTING)).toEqual({ kind: 'keep' });
    expect(classifyUrl(`${BASE}/marketplace/${LISTING}/assets/a.webp`, BASE, LISTING)).toEqual({
      kind: 'owned',
      key: `marketplace/${LISTING}/assets/a.webp`,
    });
  });

  it('refuse le reste : autre site, autre fiche, autre dossier, chemins tordus', () => {
    for (const url of [
      'https://pinterest.test/fond.jpg',
      `${BASE}/marketplace/0192a0e0-0000-7000-8000-00000000000c/assets/a.webp`,
      `${BASE}/avatars/${CAMPAIGN}/moi.webp`,
      `${BASE}/campaigns/${CAMPAIGN}/../secret.webp`,
      `${BASE}/campaigns/${CAMPAIGN}/fond.webp?x=1`,
      `${BASE}/campaigns/${CAMPAIGN}/fond.svg`,
      `${BASE}/campaigns/pas-un-uuid/fond.webp`,
      '//autre.test/fond.webp',
    ])
      expect(classifyUrl(url, BASE, LISTING).kind, url).toBe('refused');
  });
});

describe('requête plein texte', () => {
  it('préfixes sans accents, aucune syntaxe tapée ne passe', () => {
    expect(tsQuery('Cryptes de Sél')).toBe('cryptes:* & de:* & sel:*');
    expect(tsQuery("gob' | !(x)")).toBe('gob:* & x:*');
    expect(tsQuery('  ')).toBeNull();
  });
});
