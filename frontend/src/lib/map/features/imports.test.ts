/**
 * Règle d'import des fonctions de la carte (docs/carte.md § 6, Arborescence) : le cœur d'une
 * fonction (`features/<id>/engine/`) se teste sans React. Il n'importe jamais d'interface
 * (`features/<id>/ui/`, `@/components/…`) ni de manifeste (`features/<id>/index.ts`, qui
 * branche l'interface). Les tests, bancs d'essai et kits de test y échappent.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FEATURES = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(FEATURES, '../../..');
/** Import ou export statique (`type` : sans effet à l'exécution), import dynamique, `vi.mock`. */
const STATIC = /\b(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?(['"])([^'"\n]+)\2/g;
const DYNAMIC = /\b(?:import|vi\.mock)\(\s*(['"])([^'"\n]+)\1/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const isTestFile = (p: string) => /\.(test|bench)\.tsx?$|test-kit\.tsx?$/.test(p);

/** Chemin (relatif à `src`, sans extension) visé par un import, ou null (paquet). */
function target(spec: string, from: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('.')) return relative(SRC, resolve(dirname(from), spec));
  return null;
}

/** Imports interdits dans un fichier de `engine/`. */
function violations(text: string, file: string): string[] {
  const specs = [
    ...[...text.matchAll(STATIC)].filter((m) => !m[1]).map((m) => m[3]!),
    ...[...text.matchAll(DYNAMIC)].map((m) => m[2]!),
  ];
  return specs.flatMap((spec) => {
    const t = target(spec, file);
    if (!t) return [];
    const ui = /^lib\/map\/features\/[^/]+\/ui(\/|$)/.test(t) || t.startsWith('components/');
    const manifest = /^lib\/map\/features\/[^/]+(\/index)?$/.test(t);
    return ui || manifest ? [`${relative(SRC, file)} → ${spec}`] : [];
  });
}

describe('règle d’import des fonctions de la carte', () => {
  const engineFiles = walk(FEATURES).filter(
    (p) => /\/engine\/[^/]+\.tsx?$/.test(p) && !isTestFile(p),
  );

  it('trouve le cœur des fonctions', () => {
    expect(engineFiles.length).toBeGreaterThan(100);
  });

  it('engine/ n’importe ni interface ni manifeste', () => {
    expect(engineFiles.flatMap((f) => violations(readFileSync(f, 'utf8'), f))).toEqual([]);
  });

  it('la règle voit une infraction, pas un import de type', () => {
    const fake = join(FEATURES, 'grid/engine/fake.ts');
    const text = [
      "import { GridControls } from '../ui/grid-menu';",
      "import { gridFeature } from '..';",
      "import { Button } from '@/components/ui/button';",
      "const later = () => import('../ui/scale-menu');",
      'import type {',
      '  Props,',
      "} from '../ui/grid-menu';",
      "import { snapGrid } from './snap';",
      "import { MapEngine } from '@/lib/map/engine/map-engine';",
    ].join('\n');
    expect(violations(text, fake).map((v) => v.split(' → ')[1])).toEqual([
      '../ui/grid-menu',
      '..',
      '@/components/ui/button',
      '../ui/scale-menu',
    ]);
  });
});
