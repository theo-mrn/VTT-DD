import { transpileBundleScripts } from '../transpile';
import { executeBundleEntry } from '../linker';
import type { BundleContributions, BundleScriptAPI } from '../types';
import type { ScriptDoc } from '@/modules/game-content/types';
import type { GameSystemDefinition } from '@/modules/game-system/types';

// Le vrai pipeline : sources tsx → sucrase (transpile.ts) → évaluation par le linker avec un stub
// React — teste la chaîne complète telle qu'elle tourne à l'import puis au chargement de salle.

const stubReact = {
  createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
} as never;

async function compile(files: Record<string, string>): Promise<ScriptDoc[]> {
  return transpileBundleScripts(new Map(Object.entries(files)));
}

function run(docs: ScriptDoc[]): BundleContributions[] {
  const registered: BundleContributions[] = [];
  executeBundleEntry(docs, {
    React: stubReact,
    api: { showToast: () => {} } as unknown as BundleScriptAPI,
    ui: {} as never,
    icons: { Sparkles: () => null } as never,
    gameSystem: { systemId: 'test-system', stats: [] } as unknown as GameSystemDefinition,
    register: (c) => registered.push(c),
  });
  return registered;
}

describe('transpileBundleScripts + executeBundleEntry', () => {
  test("l'entrée enregistre ses contributions via ctx.register, helper importé sans extension", async () => {
    const docs = await compile({
      'scripts/main.tsx': `
        import { makeLabel } from './helper';
        export default (ctx) => {
          ctx.register({ sidebarActions: [{ id: 'hello', label: makeLabel('Salut'), onClick: () => ctx.api.showToast(makeLabel('Salut')) }] });
        };
      `,
      'scripts/helper.ts': `export function makeLabel(s: string): string { return s + '!'; }`,
    });
    const [contrib] = run(docs);
    expect(contrib.sidebarActions).toHaveLength(1);
    expect(contrib.sidebarActions![0].label).toBe('Salut!');
  });

  test('un composant TSX compile en React.createElement (React injecté, sans import)', async () => {
    const docs = await compile({
      'scripts/main.tsx': `
        const Panel = () => <div className="x">contenu</div>;
        export default (ctx) => { ctx.register({ sidebarTabs: [{ id: 'p', label: 'P', icon: Panel, component: Panel }] }); };
      `,
    });
    const [contrib] = run(docs);
    const Panel = contrib.sidebarTabs![0].component as unknown as () => { type: string; props: { className: string } };
    expect(Panel().type).toBe('div');
    expect(Panel().props.className).toBe('x');
  });

  test("import React from 'react' et lucide-react passent par les builtins injectés", async () => {
    const docs = await compile({
      'scripts/main.tsx': `
        import React from 'react';
        import { Sparkles } from 'lucide-react';
        export default (ctx) => {
          ctx.register({ sidebarActions: [{ id: 'a', label: typeof React.createElement, icon: Sparkles, onClick: () => {} }] });
        };
      `,
    });
    const [contrib] = run(docs);
    expect(contrib.sidebarActions![0].label).toBe('function');
    expect(typeof contrib.sidebarActions![0].icon).toBe('function');
  });

  test("résolution '../' et dossier avec index", async () => {
    const docs = await compile({
      'scripts/main.tsx': `
        import { fromUi } from './ui/panel';
        export default (ctx) => { ctx.register({ sidebarActions: [{ id: 'x', label: fromUi, onClick: () => {} }] }); };
      `,
      'scripts/ui/panel.tsx': `
        import { base } from '../lib';
        export const fromUi = base + '-ui';
      `,
      'scripts/lib/index.ts': `export const base = 'lib';`,
    });
    const [contrib] = run(docs);
    expect(contrib.sidebarActions![0].label).toBe('lib-ui');
  });

  test('cycle A→B→A : exports partiels comme Node, pas de boucle infinie', async () => {
    const docs = await compile({
      'scripts/main.tsx': `
        import { fromA } from './a';
        export default (ctx) => { ctx.register({ sidebarActions: [{ id: 'c', label: fromA(), onClick: () => {} }] }); };
      `,
      'scripts/a.ts': `
        import { bValue } from './b';
        export function fromA(): string { return 'a-' + bValue; }
      `,
      'scripts/b.ts': `
        import { fromA } from './a';
        export const bValue = typeof fromA; // 'undefined' pendant le cycle : exports partiel de a
      `,
    });
    const [contrib] = run(docs);
    expect(contrib.sidebarActions![0].label).toBe('a-undefined');
  });

  test('specifier nu inconnu => erreur claire', async () => {
    // L'import doit être réellement utilisé : sucrase élide les imports morts, qui ne produisent
    // alors aucun require() à rejeter.
    const docs = await compile({
      'scripts/main.tsx': `
        import _ from 'lodash';
        export default (ctx) => { ctx.register({ sidebarActions: [{ id: 'l', label: _.name, onClick: () => {} }] }); };
      `,
    });
    expect(() => run(docs)).toThrow(/Import interdit : 'lodash'/);
  });

  test("pas de scripts/main.* => erreur d'entrée manquante", async () => {
    const docs = await compile({ 'scripts/autre.ts': `export const x = 1;` });
    expect(() => run(docs)).toThrow(/point d'entrée/);
  });

  test('export default absent ou non-fonction => erreur explicite', async () => {
    const docs = await compile({ 'scripts/main.ts': `export const rien = 1;` });
    expect(() => run(docs)).toThrow(/exporter par défaut une fonction/);
  });

  test('erreur de syntaxe => échec de la transpilation avec le chemin fautif', async () => {
    await expect(compile({ 'scripts/main.tsx': `const = ;` })).rejects.toThrow(/scripts\/main\.tsx/);
  });
});
