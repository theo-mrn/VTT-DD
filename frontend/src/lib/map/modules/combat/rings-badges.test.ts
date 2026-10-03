// @vitest-environment jsdom
/**
 * Combat sur la carte complète : anneaux (tour, cibles, hors de combat) et traits de visée
 * suivent les tokens à chaque image ; badges d'état (icônes, durée, « +N ») posés sous le token,
 * redessinés seulement quand ses états changent ; tout se retire quand la source se vide.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { GM, mountMap, type MapHarness } from '../../test/map-harness';
import { mountStateBadges, type BadgeSource, type MapStateBadge } from './badges';
import { mountCombatRings, type RingSnapshot, type RingSource } from './rings';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

/** Source modifiable : `set` change l'instantané et prévient les abonnés. */
function source<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => value,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    set(next: T) {
      value = next;
      for (const l of listeners) l();
    },
  };
}

const EMPTY: RingSnapshot = {
  turnCharacterId: null,
  mine: [],
  targets: new Set(),
  lines: [],
  defeated: new Set(),
};

/** Conteneur ajouté par `mount` (le module de combat de l'app a déjà le sien, vide). */
function mounted<T>(m: MapHarness, label: string, mount: () => T): { root: Container; stop: T } {
  const plane = m.engine.plane('adornments')!;
  const before = new Set(plane.children);
  const stop = mount();
  const root = plane.children.find((c) => !before.has(c) && c.label === label) as Container;
  return { root, stop };
}

describe('anneaux du combat', () => {
  it('tour (doublé pour mes personnages), cibles, hors de combat, traits de visée', async () => {
    h = await mountMap({ viewer: GM });
    const s = source<RingSnapshot>(EMPTY);
    const { root, stop } = mounted(h, 'combat-rings', () =>
      mountCombatRings(h!.engine, s as RingSource),
    );
    h.frame();
    expect(root).toBeDefined();
    s.set({
      turnCharacterId: 'c-heros',
      mine: ['c-heros'],
      targets: new Set(['c-orc']),
      lines: [{ attackerId: 'c-heros', targetIds: ['c-orc', 'c-inconnu'] }],
      defeated: new Set(['c-barde']),
    });
    h.frames(3);
    const labels = root.children.map((c) => c.label).sort();
    expect(labels).toEqual(['combat-aim-lines', 'combat-defeated', 'combat-target', 'combat-turn']);
    // Le token bouge, le zoom change : l'anneau suit
    h.store
      .getState()
      .upsert('tokens', [
        { ...h.get('tokens', 't-heros')!, pos: { x: 500, y: 500 }, version: 5 },
      ] as never);
    h.engine.camera.zoomAt({ x: 500, y: 400 }, 2);
    h.frames(3);
    const turn = root.children.find((c) => c.label === 'combat-turn')!;
    expect(turn.position.x).toBe(h.engine.entity('t-heros')!.current.x);
    // Ce n'est plus mon personnage : anneau refait sans le double trait
    s.set({ ...s.snapshot(), mine: [] });
    h.frame();
    // Fin du combat : plus rien
    s.set(EMPTY);
    h.frame();
    expect(root.children.map((c) => c.label)).toEqual(['combat-aim-lines']);
    stop();
  });
});

describe('badges d’état', () => {
  const state = (name: string, duration: number | null = null): MapStateBadge => ({
    icon: 'aveugle',
    name,
    duration,
  });

  it('badges sous le token, durée, « +N » au-delà de 4 ; redessin seulement si ça change', async () => {
    h = await mountMap({ viewer: GM });
    const s = source<ReadonlyMap<string, readonly MapStateBadge[]>>(new Map());
    const { root, stop } = mounted(h, 'combat-states', () =>
      mountStateBadges(h!.engine, s as BadgeSource),
    );
    h.frame();
    expect(root.children).toHaveLength(0);
    const many = [
      state('Aveuglé', 2),
      state('Étourdi'),
      state('Charmé', 1),
      state('Effrayé'),
      state('Paralysé'),
    ];
    s.set(
      new Map([
        ['c-heros', many],
        ['c-orc', [state('Aveuglé', 3)]],
        ['c-inconnu', [state('x')]],
      ]),
    );
    h.frames(3);
    expect(root.children).toHaveLength(2);
    const heroBox = root.children[0] as Container;
    const drawn = heroBox.children.length;
    expect(drawn).toBeGreaterThan(6);
    // Même états : rien n'est refait
    s.set(new Map(s.snapshot()));
    h.frame();
    expect((root.children[0] as Container).children.length).toBe(drawn);
    // Survol du token : le libellé de ses états, retiré à la sortie
    h.engine.setHovered('t-heros', { world: h.engine.entity('t-heros')!.current });
    h.frames(20, 100);
    h.engine.setHovered(null);
    h.frames(2);
    // Le token disparaît (supprimé) puis la source se vide
    h.store.getState().remove('tokens', ['t-orc']);
    s.set(new Map(s.snapshot()));
    h.frame();
    expect(root.children).toHaveLength(1);
    s.set(new Map());
    h.frame();
    expect(root.children).toHaveLength(0);
    stop();
  });
});
