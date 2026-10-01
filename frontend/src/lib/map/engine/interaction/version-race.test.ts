/**
 * Glisser-déposer rapides du même élément, avec un serveur qui tient la version (verrou optimiste),
 * répond en retard, publie un événement « déplacé » sans version et relit la couche : aucune
 * écriture ne doit partir avec une version périmée.
 */
import { describe, expect, it, vi } from 'vitest';
import type { EntityUpdate } from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import { box, boxKind, setup } from '../test-kit';

describe('versions et déplacements rapides', () => {
  it('aucune version périmée envoyée', async () => {
    const server = new Map<string, { version: number; x: number; y: number }>([
      ['a', { version: 1, x: 100, y: 100 }],
    ]);
    const conflicts: number[] = [];
    const events: (() => void)[] = [];
    const later = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let t!: ReturnType<typeof setup>;
    const persistence = {
      update: vi.fn(async (updates: readonly EntityUpdate<MapDto>[]) => {
        await later(30);
        return updates.map((u) => {
          const row = server.get(u.after.id)!;
          if (u.version !== row.version) {
            conflicts.push(u.version);
            throw Object.assign(new Error('conflit'), { status: 409 });
          }
          const a = u.after as unknown as { x: number; y: number };
          row.version += 1;
          row.x = a.x;
          row.y = a.y;
          const id = u.after.id;
          const pos = { x: a.x, y: a.y };
          // Événement temps réel, sans version, qui arrive bien plus tard
          events.push(() => t.store.getState().patchItem('boxes', id, pos));
          return { ...u.after, version: row.version };
        });
      }),
    };
    t = setup({ boxes: [box('a', 100, 100)], kind: boxKind(persistence as never) });
    for (let i = 1; i <= 6; i++) {
      t.drag({ x: 100 + (i - 1) * 50, y: 100 }, { x: 100 + i * 50, y: 100 });
      // Relecture de la couche par moments (vision du joueur), et des événements en retard
      if (i % 2 === 0) {
        const snapshot = [...server].map(([id, r]) => ({
          ...box(id, r.x, r.y),
          version: r.version,
        }));
        setTimeout(() => t.store.getState().replaceCollection('boxes', snapshot), 40);
      }
      if (i % 3 === 0) setTimeout(() => events.splice(0).forEach((f) => f()), 45);
      await later(10);
    }
    await later(400);
    await t.engine.commands.idle();
    expect(persistence.update).toHaveBeenCalledTimes(6);
    expect(conflicts).toEqual([]);
  });
});
