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
  'components/auth',
  'app/connexion',
  'app/mot-de-passe-oublie',
  'app/reinitialisation',
  'app/verification-email',
  'app/discord',
  'components/shell',
  'components/search',
  'components/commun',
  'components/compte/onglets-compte.tsx',
  'components/campagnes',
  'components/systemes',
  'app/(app)/accueil',
  'app/(app)/campagnes',
  'app/(focus)/join',
  'app/(focus)/campagnes',
  'app/(app)/(compte)',
  'components/compte',
  'app/(app)/paiement',
  'components/table',
  'components/shortcuts',
  'lib/shortcuts',
  'lib/map/shortcuts.ts',
  'components/des',
  'components/dice',
  'app/(app)/des',
  'lib/map',
  'components/map',
  'components/chat',
  'components/historique',
  'components/handouts',
  'components/encounters',
  'components/onboarding',
  'components/personnages',
  'components/portraits',
  'components/uploads',
  'lib/uploads',
  'components/ui',
  'components/perf',
  'components/notes',
  'components/resources',
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
