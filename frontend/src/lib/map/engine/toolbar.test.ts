/**
 * Barre déclarative (docs/carte.md § 6, Fonctions branchables) : groupes dans l'ordre, groupes
 * vides omis, droits par viewer, ordre dans le groupe ; une action devient bouton et touche.
 */
import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { setup, GM } from './test-kit';
import type { MapViewer } from './entities/entity-kind';
import {
  arrange,
  hideEntry,
  moveEntry,
  toolbarGroups,
  type ToolbarEntry,
  type ToolbarLayout,
} from './toolbar';
import type { ToolDefinition } from './tools/tool';

const PLAYER: MapViewer = { userId: 'p', role: 'player', characterIds: [] };
const Nothing = () => null;

const tool = (id: string, order: number, extra: Partial<ToolDefinition> = {}): ToolDefinition => ({
  id,
  label: id,
  icon: Box,
  order,
  create: () => ({ id, state: 'idle' }),
  ...extra,
});

const custom = (id: string, group: ToolbarEntry['group'], order?: number, gmOnly = false) =>
  ({
    kind: 'custom',
    id,
    label: id,
    icon: Box,
    group,
    order,
    component: Nothing,
    ...(gmOnly ? { available: (v: MapViewer) => v.role === 'gm' } : {}),
  }) satisfies ToolbarEntry;

const ids = (sections: ReturnType<typeof toolbarGroups>) =>
  sections.map((s) => [s.group, s.slots.map((x) => x.id)]);

describe('toolbarGroups', () => {
  it('groupes dans l’ordre, entrées triées, groupes vides omis', () => {
    const tools = [tool('b', 20), tool('a', 10), tool('cache', 5, { hidden: true })];
    const entries = [custom('fin', 'assist'), custom('z', 'view', 30), custom('y', 'view', 10)];
    expect(ids(toolbarGroups(tools, entries, GM))).toEqual([
      ['tools', ['a', 'b']],
      ['view', ['y', 'z']],
      ['assist', ['fin']],
    ]);
  });

  it('droits : outils du MJ par défaut, entrées pour tous par défaut', () => {
    const tools = [tool('mj', 1), tool('tous', 2, { available: () => true })];
    const entries = [custom('mj-seul', 'view', 1, true), custom('libre', 'view', 2)];
    expect(ids(toolbarGroups(tools, entries, PLAYER))).toEqual([
      ['tools', ['tous']],
      ['view', ['libre']],
    ]);
  });
});

describe('disposition de l’utilisateur', () => {
  const tools = [tool('select', 0, { available: () => true }), tool('p', 10), tool('t', 11)];
  const entries = [custom('a', 'view', 1), custom('b', 'view', 2), custom('c', 'view', 3)];

  it('ordre voulu ; une entrée absente de l’ordre garde sa place', () => {
    const slots = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    expect(arrange(slots, ['c', 'a']).map((s) => s.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(arrange(slots, ['inconnu']).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('masquées retirées, sauf la sélection ; toutes avec `withHidden`', () => {
    const layout: ToolbarLayout = { order: ['t', 'p'], hidden: ['select', 'b'] };
    expect(ids(toolbarGroups(tools, entries, GM, layout))).toEqual([
      ['tools', ['select', 't', 'p']],
      ['view', ['a', 'c']],
    ]);
    expect(ids(toolbarGroups(tools, entries, GM, layout, true))[1]).toEqual([
      'view',
      ['a', 'b', 'c'],
    ]);
  });

  it('déplacer dans un groupe, masquer, remontrer', () => {
    let layout: ToolbarLayout = { order: ['t', 'p'], hidden: [] };
    layout = moveEntry(layout, ['a', 'b', 'c'], 'c', 0);
    expect(layout.order).toEqual(['t', 'p', 'c', 'a', 'b']);
    expect(moveEntry(layout, ['a', 'b', 'c'], 'c', 9)).toBe(layout);
    layout = hideEntry(layout, 'b', true);
    expect(hideEntry(layout, 'select', true)).toBe(layout);
    expect(ids(toolbarGroups(tools, entries, GM, layout))[1]).toEqual(['view', ['c', 'a']]);
    expect(hideEntry(layout, 'b', false).hidden).toEqual([]);
  });
});

describe('actions du moteur', () => {
  it('une action avec `toolbar` pose son bouton ; sa touche passe par le contrôleur', () => {
    const t = setup();
    let runs = 0;
    const off = t.engine.registerAction({
      id: 'essai.go',
      label: 'Essai',
      icon: Box,
      shortcut: { code: 'KeyN', label: 'N' },
      run: () => void runs++,
      toolbar: { group: 'assist', order: 1 },
    });
    expect(t.engine.getExtensions().toolbarEntries.map((e) => e.id)).toContain('essai.go');
    expect(t.engine.actionForKey('KeyN')?.id).toBe('essai.go');
    off();
    expect(t.engine.getExtensions().toolbarEntries.map((e) => e.id)).not.toContain('essai.go');
    expect(t.engine.actionForKey('KeyN')).toBeNull();
    expect(runs).toBe(0);
  });

  it('touche réservée à un rôle : rien pour les autres', () => {
    const t = setup({ viewer: PLAYER });
    t.engine.registerAction({
      id: 'essai.mj',
      label: 'MJ',
      icon: Box,
      shortcut: { code: 'KeyN', label: 'N' },
      available: (v) => v.role === 'gm',
      run: () => undefined,
    });
    expect(t.engine.actionForKey('KeyN')).toBeNull();
  });

  it('même identifiant deux fois : refusé', () => {
    const t = setup();
    const a = { id: 'essai.double', label: 'x', icon: Box, run: () => undefined };
    t.engine.registerAction(a);
    expect(() => t.engine.registerAction(a)).toThrow(/déjà enregistrée/);
    expect(() => t.engine.registerToolbarEntry(custom('dup', 'view'))).not.toThrow();
    expect(() => t.engine.registerToolbarEntry(custom('dup', 'view'))).toThrow(/déjà enregistrée/);
  });
});
