import { describe, expect, it } from 'vitest';
import { TokenBucket } from './rate-limit.js';
import { deliveryFor, packet, rooms, targetsFor } from './routing.js';
import { envelope } from './test/test-app.js';

const C = '0192f0c1-0000-7000-8000-000000000001';
const author = '0192f0c1-0000-7000-8000-00000000000a';
const other = '0192f0c1-0000-7000-8000-00000000000b';
const actor = { userId: author, role: 'player' as const, characterId: null };

describe('routage des événements', () => {
  it('public : toute la campagne', () => {
    const e = envelope({ type: 'dice.rolled', roomId: C, actor, visibility: 'public' });
    expect(targetsFor(e)).toEqual({ full: [rooms.campaign(C)], redacted: [] });
    expect(deliveryFor(e, { userId: other, role: 'spectator' })).toBe('full');
  });

  it('gm_only : les MJ, et une version expurgée pour son auteur', () => {
    const e = envelope({ type: 'dice.rolled', roomId: C, actor, visibility: 'gm_only' });
    expect(targetsFor(e)).toEqual({ full: [rooms.gm(C)], redacted: [rooms.user(author)] });
    expect(deliveryFor(e, { userId: other, role: 'gm' })).toBe('full');
    expect(deliveryFor(e, { userId: author, role: 'player' })).toBe('redacted');
    expect(deliveryFor(e, { userId: other, role: 'player' })).toBeNull();
  });

  it('gm_only avec visibleTo : aussi les utilisateurs listés, en entier', () => {
    const gm = '0192f0c1-0000-7000-8000-00000000000c';
    const e = envelope({
      type: 'token.updated',
      roomId: C,
      actor: { userId: gm, role: 'gm', characterId: null },
      visibility: 'gm_only',
      payload: { id: 't1', visibleTo: [author, author, gm, 42, ''] },
    });
    expect(targetsFor(e)).toEqual({
      full: [rooms.gm(C), rooms.user(author), rooms.user(gm)],
      redacted: [],
    });
    expect(deliveryFor(e, { userId: author, role: 'player' })).toBe('full');
    expect(deliveryFor(e, { userId: other, role: 'player' })).toBeNull();
    // Auteur non listé : expurgé
    const byPlayer = { ...e, actor, payload: { visibleTo: [other] } };
    expect(targetsFor(byPlayer).redacted).toEqual([rooms.user(author)]);
    expect(deliveryFor(byPlayer, { userId: other, role: 'spectator' })).toBe('full');
  });

  it("owner : l'auteur seul, pas le MJ (jets « self »)", () => {
    const e = envelope({ type: 'dice.rolled', roomId: C, actor, visibility: 'owner' });
    expect(targetsFor(e)).toEqual({ full: [rooms.user(author)], redacted: [] });
    expect(deliveryFor(e, { userId: author, role: 'player' })).toBe('full');
    expect(deliveryFor(e, { userId: other, role: 'gm' })).toBeNull();
  });

  it("hors campagne : l'auteur seul, rien sans auteur ni pour gm_only", () => {
    const e = envelope({ type: 'dice.preferences_updated', actor, visibility: 'owner' });
    expect(targetsFor(e)).toEqual({ full: [rooms.user(author)], redacted: [] });
    expect(targetsFor({ ...e, visibility: 'gm_only' }).full).toEqual([]);
    const system = envelope({ type: 'dice.preferences_updated', visibility: 'owner' });
    expect(targetsFor(system).full).toEqual([]);
  });

  it('version expurgée : sans charge utile, marquée', () => {
    const e = envelope({ type: 'dice.rolled', roomId: C, actor, payload: { total: 20 } });
    expect(packet(e, 7)).toEqual({ seq: 7, event: e });
    const r = packet(e, 7, true);
    expect(r.redacted).toBe(true);
    expect(r.event.payload).toEqual({});
    expect(r.event.aggregate).toEqual(e.aggregate);
  });
});

describe('seau à jetons', () => {
  it('laisse passer la rafale puis le débit continu', () => {
    let now = 0;
    const b = new TokenBucket(2, 3, () => now);
    expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false]);
    now = 500;
    expect([b.take(), b.take()]).toEqual([true, false]);
    now = 10_000;
    expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false]);
  });
});
