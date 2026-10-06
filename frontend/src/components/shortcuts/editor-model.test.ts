/** Éditeur : qui gêne une touche (portées, rôles), remplacer, tout rétablir. */
import { describe, expect, it } from 'vitest';
import type { ShortcutDescriptor } from '@/lib/shortcuts/registry';
import { bindingOf, EMPTY_PREFS, type ShortcutPrefs } from '@/lib/shortcuts/store';
import { clashesFor, replaceBinding, resetAll } from './editor-model';

const d = (id: string, scope: ShortcutDescriptor['scope'], key: string | null, extra = {}) =>
  ({ id, label: id, scope, defaultBinding: key, ...extra }) as ShortcutDescriptor;

const chat = d('table.panel.chat', 'table', 'KeyC');
const draw = d('map.tool.draw', 'map', 'KeyP');
const calques = d('map.action.layers.panel', 'map', 'KeyK', { roles: ['gm'] });
const bulle = d('map.bubble', 'table', 'KeyK', { roles: ['player'] });
const rotation = d('fixed.rotate', 'map', 'KeyR', { fixed: true });
const relancer = d('dice.reroll', 'dice', 'KeyR');
const list = [chat, draw, calques, bulle, rotation, relancer];

describe('éditeur des raccourcis', () => {
  it('gêne : même touche, portées et rôles communs', () => {
    expect(clashesFor(list, EMPTY_PREFS, chat, 'KeyP').map((x) => x.id)).toEqual([draw.id]);
    // La bulle (joueur) et les calques (MJ) ne se gênent pas
    expect(clashesFor(list, EMPTY_PREFS, bulle, 'KeyK')).toEqual([]);
    // Les dés ne voient pas la carte
    expect(clashesFor(list, EMPTY_PREFS, relancer, 'KeyR')).toEqual([]);
    expect(clashesFor(list, EMPTY_PREFS, chat, 'KeyR').map((x) => x.id)).toEqual([rotation.id]);
  });

  it('remplacer : l’autre perd sa touche, un geste standard la garde', () => {
    const next = replaceBinding(EMPTY_PREFS, chat, 'KeyP', [draw, rotation]);
    expect(bindingOf(next, chat)).toBe('KeyP');
    expect(bindingOf(next, draw)).toBeNull();
    expect(bindingOf(next, rotation)).toBe('KeyR');
  });

  it('tout rétablir : défauts, raccourcis créés gardés sans touche', () => {
    const prefs: ShortcutPrefs = {
      bindings: { [chat.id]: 'KeyX' },
      custom: [{ id: 'a', kind: 'roll', label: 'A', formula: '1d20', binding: 'KeyF' }],
    };
    expect(resetAll(prefs)).toEqual({
      bindings: {},
      custom: [{ id: 'a', kind: 'roll', label: 'A', formula: '1d20', binding: null }],
    });
  });
});
