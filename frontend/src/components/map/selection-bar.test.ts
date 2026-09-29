/**
 * Barre de la sélection : répartition des entrées du menu (action principale, boutons à icône,
 * « … » avec tout le menu, « Supprimer » à part).
 */
import { describe, expect, it } from 'vitest';
import type { MenuItem } from '@/lib/map/engine/entities/entity-kind';
import { barLayout } from './selection-bar';

const Icon = () => null;
const item = (id: string, extra: Partial<MenuItem> = {}): MenuItem => ({
  id,
  label: id,
  icon: Icon,
  run: () => undefined,
  ...extra,
});

describe('barre de la sélection', () => {
  it('principale en bouton libellé, icônes en boutons, Supprimer à part, tout sous « … »', () => {
    const items = [
      item('lock'),
      item('sep:kind', { icon: undefined, run: undefined }),
      item('token:sheet', { primary: true }),
      item('order', { run: undefined, children: [item('front')] }),
      item('sans-icone', { icon: undefined }),
      item('delete', { danger: true }),
    ];
    const l = barLayout(items);
    expect(l.primary.map((i) => i.id)).toEqual(['token:sheet']);
    expect(l.quick.map((i) => i.id)).toEqual(['lock', 'order']);
    expect(l.remove?.id).toBe('delete');
    expect(l.all).toEqual(items);
  });

  it('six boutons à icône au plus ; le reste reste dans « … »', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`a${i}`));
    const l = barLayout(items);
    expect(l.quick).toHaveLength(6);
    expect(l.all).toHaveLength(9);
  });

  it('joueur : pas de barre au clic, sauf les actions marquées pour lui (« Fouiller »)', () => {
    const items = [item('lock'), item('token:sheet', { primary: true }), item('delete')];
    const none = barLayout(items, false);
    expect([...none.primary, ...none.quick, ...none.all]).toEqual([]);
    expect(none.remove).toBeNull();
    const search = barLayout(
      [...items, item('object:search', { primary: true, forPlayers: true })],
      false,
    );
    expect(search.primary.map((i) => i.id)).toEqual(['object:search']);
    expect(search.all).toEqual([]);
  });
});
