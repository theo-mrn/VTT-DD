/**
 * Tout le front est traduit (docs/i18n.md § 9 et § 12) : aucun texte d'interface écrit en dur
 * dans `components/`, `app/` et `lib/`, hors des exceptions listées ici. Même détecteur que
 * `node scripts/i18n-coverage.mjs` ; une valeur technique qui ressemble à du texte se marque
 * `// i18n-ignore`, un fichier volontairement hors traduction porte `i18n-ignore-file`.
 */
import { describe, expect, it } from 'vitest';
import { scanDir } from '../../scripts/i18n-coverage.mjs';

/** Dossiers ou fichiers traduits, relatifs à `src/`. */
export const TRANSLATED_AREAS = ['components', 'app', 'lib'];

/**
 * Fichiers encore en dur, chacun avec sa raison. La liste ne fait que raccourcir : un fichier
 * traduit en sort.
 */
export const KNOWN_UNTRANSLATED: Readonly<Record<string, string>> = {
  'lib/suggested-sounds.ts': 'module que plus rien n’importe (docs/i18n.md § 12.1)',
};

describe.each(TRANSLATED_AREAS)('zone traduite %s', (area) => {
  it('ne contient aucun texte en dur', () => {
    const found: Record<string, { line: number; text: string }[]> = scanDir(area);
    const lines = Object.entries(found)
      .filter(([file]) => !(file in KNOWN_UNTRANSLATED))
      .flatMap(([file, hits]) => hits.map((h) => `${file}:${h.line}  ${h.text}`));
    expect(lines).toEqual([]);
  });
});

describe('exceptions', () => {
  it.each(Object.keys(KNOWN_UNTRANSLATED))('%s a encore des textes en dur', (file) => {
    // Une exception traduite (ou supprimée) se retire de la liste
    expect(Object.keys(scanDir(file)).length).toBeGreaterThan(0);
  });
});
