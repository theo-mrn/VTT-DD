/**
 * Catalogue complet : ids uniques, touches par défaut valides, et aucun conflit entre les
 * défauts, rôle par rôle (la même touche peut servir deux rôles disjoints : K).
 */
import { describe, expect, it } from 'vitest';
import { parseBinding } from '@/lib/shortcuts/chord';
import { findConflicts, forRole } from '@/lib/shortcuts/registry';
import { BUILTIN_SHORTCUTS } from './catalog';

describe('catalogue des raccourcis', () => {
  it('ids uniques, défauts valides', () => {
    const ids = BUILTIN_SHORTCUTS.map((d) => d.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    for (const d of BUILTIN_SHORTCUTS)
      if (d.defaultBinding) expect(parseBinding(d.defaultBinding), d.id).not.toBeNull();
  });

  it.each(['gm', 'player', 'spectator'] as const)(
    'aucun conflit entre les défauts (%s)',
    (role) => {
      const list = forRole(BUILTIN_SHORTCUTS, role).map((descriptor) => ({
        descriptor,
        binding: descriptor.defaultBinding,
      }));
      expect(Object.fromEntries(findConflicts(list))).toEqual({});
    },
  );
});
