/** Conflits : portées actives ensemble, rôles, gestes standards entre eux. */
import { describe, expect, it } from 'vitest';
import { findConflicts, forRole, type ShortcutDescriptor } from './registry';

const d = (
  id: string,
  scope: ShortcutDescriptor['scope'],
  extra: Partial<ShortcutDescriptor> = {},
) =>
  ({ id, label: { text: id }, scope, defaultBinding: null, ...extra }) satisfies ShortcutDescriptor;

describe('findConflicts', () => {
  it('table et carte ensemble ; dés et carte non', () => {
    const c = findConflicts([
      { descriptor: d('panneau', 'table'), binding: 'KeyP' },
      { descriptor: d('outil', 'map'), binding: 'KeyP' },
      { descriptor: d('relancer', 'dice'), binding: 'KeyR' },
      { descriptor: d('rotation', 'map', { fixed: true }), binding: 'KeyR' },
    ]);
    expect(c.get('panneau')).toEqual(['outil']);
    expect(c.has('relancer')).toBe(false);
  });

  it('rôles disjoints : pas de conflit ; séquence et préfixe : conflit', () => {
    const c = findConflicts([
      { descriptor: d('calques', 'map', { roles: ['gm'] }), binding: 'KeyK' },
      { descriptor: d('bulle', 'table', { roles: ['player'] }), binding: 'KeyK' },
      { descriptor: d('rapide', 'global'), binding: 'Space Enter' },
      { descriptor: d('espace', 'notes'), binding: 'Space' },
    ]);
    expect(c.has('calques')).toBe(false);
    expect(c.get('rapide')).toEqual(['espace']);
  });

  it('deux gestes standards ne se signalent pas ; sans touche : rien', () => {
    const c = findConflicts([
      { descriptor: d('a', 'table', { fixed: true }), binding: 'Escape' },
      { descriptor: d('b', 'map', { fixed: true }), binding: 'Escape' },
      { descriptor: d('c', 'map'), binding: null },
      { descriptor: d('e', 'map'), binding: null },
    ]);
    expect(c.size).toBe(0);
  });

  it('forRole : les commandes de ce rôle, toutes sans rôle', () => {
    const list = [d('mj', 'map', { roles: ['gm'] }), d('tous', 'map')];
    expect(forRole(list, 'player').map((x) => x.id)).toEqual(['tous']);
    expect(forRole(list, null)).toHaveLength(2);
  });
});
