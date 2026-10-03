/**
 * Vue du combat pour un joueur (docs/combat.md § 9.3) et charges de `combat.turn_changed`.
 */
import type { CombatState } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { redactCombat, turnChangedPayloads } from './view.js';

const initiative = {
  summary: '17 (1d20 + 3)',
  params: {},
  source: 'server' as const,
  rolledAt: 'x',
};
const full: CombatState = {
  id: 'c',
  round: 2,
  mode: 'individual',
  order: [
    {
      characterId: 'hero',
      side: 'players',
      sortKeys: [18],
      hasActed: true,
      visibleToPlayers: true,
      initiative,
    },
    {
      characterId: 'ninja',
      side: 'enemies',
      sortKeys: [15],
      hasActed: false,
      visibleToPlayers: false,
      initiative,
    },
    {
      characterId: 'orc',
      side: 'enemies',
      sortKeys: [12],
      hasActed: false,
      visibleToPlayers: true,
      initiative,
    },
  ],
  currentIndex: 1,
  initiativeRolled: true,
  version: 7,
  currentActorId: 'ninja',
  turn: 4,
  canGoBack: true,
  redacted: false,
};

describe('redactCombat', () => {
  it('participants cachés retirés, initiative des PNJ vidée, tour caché : -1', () => {
    const view = redactCombat(full);
    expect(view.order.map((p) => p.characterId)).toEqual(['hero', 'orc']);
    expect(view.order[0]).toMatchObject({ sortKeys: [18], initiative });
    expect(view.order[1]).toMatchObject({ sortKeys: [], initiative: null });
    expect(view).toMatchObject({ currentIndex: -1, currentActorId: null, redacted: true });
    expect(view).not.toHaveProperty('canGoBack');
    expect(JSON.stringify(view)).not.toContain('ninja');
  });

  it('tour d’un participant visible : son index dans la liste expurgée', () => {
    expect(redactCombat({ ...full, currentIndex: 2, currentActorId: 'orc' })).toMatchObject({
      currentIndex: 1,
      currentActorId: 'orc',
    });
  });

  it('slots : les créneaux ne sont jamais retirés', () => {
    const slots = [
      { side: 'players' as const },
      { side: 'enemies' as const },
      { side: 'enemies' as const },
    ];
    const view = redactCombat({
      ...full,
      mode: 'slots',
      slots,
      currentIndex: 1,
      currentActorId: null,
    });
    expect(view.slots).toEqual(slots);
    expect(view.currentIndex).toBe(1);
  });
});

describe('turnChangedPayloads', () => {
  it('rien à cacher : une seule charge', () => {
    const visible = { ...full, order: full.order.map((p) => ({ ...p, visibleToPlayers: true })) };
    const r = turnChangedPayloads(
      { ...visible, currentIndex: 2, currentActorId: 'orc' },
      { reason: 'next', acted: 'hero' },
    );
    expect(r.same).toBe(true);
  });

  it('ordre et participant caché : complète au MJ, expurgée aux joueurs', () => {
    const r = turnChangedPayloads(full, {
      reason: 'participants_added',
      added: ['ninja'],
      withOrder: true,
      acted: 'ninja',
    });
    expect(r.same).toBe(false);
    expect(r.gm).toMatchObject({ added: ['ninja'], currentIndex: 1, currentActorId: 'ninja' });
    expect(r.gm.order).toHaveLength(3);
    expect(r.players).toEqual({
      reason: 'participants_added',
      round: 2,
      currentIndex: -1,
      version: 7,
      acted: null,
      currentActorId: null,
      turn: 4,
    });
  });
});
