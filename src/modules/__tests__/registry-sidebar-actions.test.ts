import { moduleRegistry } from '../registry';
import type { ModuleDefinition } from '../types';

// getSidebarActions suit le même chemin collectContributions que les autres getters — on vérifie
// l'agrégation multi-modules, le filtre enabled et le cleanup par unregister (invariant ExtensionHost).

function makeModule(id: string, actionIds: string[], defaultEnabled = true): ModuleDefinition {
  return {
    manifest: { id, name: id, version: '1.0.0', description: '', author: 'test', type: 'feature', defaultEnabled },
    contributions: {
      sidebarActions: actionIds.map((aid) => ({ id: aid, label: aid, onClick: () => {} })),
    },
  };
}

describe('moduleRegistry.getSidebarActions', () => {
  afterEach(() => {
    moduleRegistry.unregister('test-a');
    moduleRegistry.unregister('test-b');
  });

  test('agrège les contributions des modules activés et disparaît à l\'unregister', () => {
    moduleRegistry.register(makeModule('test-a', ['a1', 'a2']));
    moduleRegistry.register(makeModule('test-b', ['b1']));
    expect(moduleRegistry.getSidebarActions().map((a) => a.id).sort()).toEqual(['a1', 'a2', 'b1']);

    moduleRegistry.unregister('test-a');
    expect(moduleRegistry.getSidebarActions().map((a) => a.id)).toEqual(['b1']);
  });

  test('un module non activé ne contribue pas', () => {
    moduleRegistry.register(makeModule('test-a', ['a1'], false));
    expect(moduleRegistry.getSidebarActions().find((a) => a.id === 'a1')).toBeUndefined();
  });
});
