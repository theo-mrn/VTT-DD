import type { Attack, AttackTarget, CombatState } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { currentActorOf, myTurn, turnHeadline, turnRows } from '../turns/model';
import { awaitingMyReaction, reactionTitle } from './model';

const target = (characterId: string, extra: Partial<AttackTarget> = {}): AttackTarget => ({
  characterId,
  status: 'awaiting_reaction',
  decision: 'pending',
  reactionParams: ['esquive'],
  ...extra,
});

const attack = (extra: Partial<Attack> = {}): Attack => ({
  id: 'a1',
  campaignId: 'camp',
  combatId: 'c1',
  round: 1,
  turn: 1,
  attackerId: 'hidden-npc',
  action: { id: 'attaque', name: 'Blaster' },
  params: {},
  rollMode: 'per_target',
  dice: 'server',
  visibility: 'gm',
  status: 'awaiting_reactions',
  outOfTurn: false,
  selfTarget: false,
  targets: [target('kael'), target('lyra')],
  pendingSteps: [],
  createdBy: 'gm',
  createdAt: '2026-09-30T10:00:00Z',
  resolvedAt: null,
  decidedAt: null,
  version: 1,
  redacted: true,
  ...extra,
});

describe('invite de réaction', () => {
  it('seulement mes cibles qui attendent ma défense', () => {
    const a = attack({
      targets: [target('kael'), target('lyra'), target('mira', { status: 'resolved' })],
    });
    expect(awaitingMyReaction(a, new Set(['kael', 'mira'])).map((t) => t.characterId)).toEqual([
      'kael',
    ]);
    expect(awaitingMyReaction(a, 'all').map((t) => t.characterId)).toEqual(['kael', 'lyra']);
    expect(awaitingMyReaction(attack({ status: 'pending' }), 'all')).toEqual([]);
  });

  it('un attaquant inconnu du joueur n’est jamais nommé', () => {
    const names = new Map<string, string | null>([['kael', 'Kael']]);
    expect(reactionTitle(attack(), target('kael'), names)).toBe('Un adversaire attaque Kael');
    expect(reactionTitle(attack(), target('kael'), names)).not.toContain('hidden-npc');
    const known = new Map<string, string | null>([
      ['kael', 'Kael'],
      ['hidden-npc', 'Garde'],
    ]);
    expect(reactionTitle(attack(), target('kael'), known)).toBe('Garde attaque Kael');
  });
});

describe('bandeau d’un joueur (vue expurgée)', () => {
  // Vue d'un joueur : l'embusqué caché est retiré, les clés des ennemis vidées
  const redacted: CombatState = {
    id: 'c1',
    round: 2,
    mode: 'individual',
    order: [
      { characterId: 'kael', side: 'players', sortKeys: [17], hasActed: true },
      { characterId: 'orc', side: 'enemies', sortKeys: [], hasActed: false, initiative: null },
    ],
    currentIndex: -1,
    initiativeRolled: true,
    version: 9,
    currentActorId: null,
    redacted: true,
  };

  it('le tour d’un adversaire caché ne donne ni nom ni identifiant', () => {
    expect(currentActorOf(redacted)).toBeNull();
    expect(turnHeadline(redacted, (id) => id)).toBe('Tour d’un adversaire');
    expect(turnRows(redacted).map((r) => r.characterId)).toEqual(['kael', 'orc']);
    expect(myTurn(redacted, new Set(['kael']))).toBeNull();
  });

  it('pas d’initiative affichée pour un PNJ dont le serveur a vidé les clés', () => {
    const orc = turnRows(redacted).find((r) => r.characterId === 'orc')!;
    expect(orc.initiative).toBeNull();
    expect(orc.score).toBeNull();
  });
});
