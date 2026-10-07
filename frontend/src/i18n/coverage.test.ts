/**
 * Zones traduites (docs/i18n.md § 9 et § 11) : aucun texte d'interface écrit en dur. Une zone
 * entièrement traduite s'ajoute ici et le reste. Même détecteur que
 * `node scripts/i18n-coverage.mjs` ; une valeur technique qui ressemble à du texte se marque
 * `// i18n-ignore`.
 */
import { describe, expect, it } from 'vitest';
import { scanDir } from '../../scripts/i18n-coverage.mjs';

/** Dossiers ou fichiers, relatifs à `src/`. */
export const TRANSLATED_AREAS = [
  'components/i18n',
  'components/landing',
  'components/legal',
  'app/page.tsx',
  'app/privacy',
  'app/terms',
  'app/legal',
  'app/credits',
];

describe.each(TRANSLATED_AREAS)('zone traduite %s', (area) => {
  it('ne contient aucun texte en dur', () => {
    const found: Record<string, { line: number; text: string }[]> = scanDir(area);
    const lines = Object.entries(found).flatMap(([file, hits]) =>
      hits.map((h) => `${file}:${h.line}  ${h.text}`),
    );
    expect(lines).toEqual([]);
  });
});
