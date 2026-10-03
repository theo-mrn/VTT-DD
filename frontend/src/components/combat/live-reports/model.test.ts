import type { Attack } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { attack as baseAttack, attackTarget } from '@/lib/combat/test-kit';
import { focusOf, liveItems, liveStack, needsDecision } from './model';

const at = (minute: number) => `2026-09-30T20:${String(minute).padStart(2, '0')}:00.000Z`;

const attack = (id: string, minute: number, extra: Partial<Attack> = {}): Attack =>
  baseAttack({ id, createdAt: at(minute), status: 'pending', ...extra });

describe('rapports montrés', () => {
  it('à décider et en cours ; ni décidés, ni abandonnés', () => {
    const items = liveItems([
      [
        attack('a', 1),
        attack('b', 2, {
          status: 'awaiting_dice',
          targets: [attackTarget({ status: 'awaiting_dice' })],
        }),
        attack('c', 3, { status: 'applied', targets: [attackTarget({ decision: 'applied' })] }),
        attack('d', 4, { status: 'cancelled' }),
      ],
    ]);
    expect(items.map((i) => [i.attack.id, i.kind])).toEqual([
      ['b', 'progress'],
      ['a', 'decide'],
    ]);
  });

  it('un rapport en attente sans rien à décider ne s’affiche pas', () => {
    const a = attack('a', 1, { targets: [attackTarget({ decision: 'applied' })] });
    expect(needsDecision(a)).toBe(false);
    expect(liveItems([[a]])).toEqual([]);
  });

  it('les plus récents en haut, sans doublon, la version la plus neuve gardée', () => {
    const old = attack('a', 5, { version: 1 });
    const fresh = attack('a', 5, { version: 2 });
    const items = liveItems([
      [old, attack('b', 1)],
      [fresh, attack('c', 9)],
    ]);
    expect(items.map((i) => i.attack.id)).toEqual(['c', 'a', 'b']);
    expect(items[1]!.attack.version).toBe(2);
  });

  it('un rapport décidé depuis la pile reste à sa place le temps de la confirmation', () => {
    const decided = attack('a', 5, {
      version: 3,
      status: 'applied',
      targets: [attackTarget({ decision: 'applied' })],
    });
    const items = liveItems([[attack('b', 1)]], new Map([['a', decided]]));
    expect(items.map((i) => [i.attack.id, i.kind])).toEqual([
      ['a', 'settled'],
      ['b', 'decide'],
    ]);
  });

  it('une application annulée : la carte redevient à décider', () => {
    const decided = attack('a', 5, { version: 3, status: 'applied' });
    const back = attack('a', 5, { version: 4 });
    const items = liveItems([[back]], new Map([['a', decided]]));
    expect(items.map((i) => [i.attack.id, i.kind])).toEqual([['a', 'decide']]);
  });
});

describe('bornes de la pile', () => {
  const items = liveItems([[1, 2, 3, 4, 5].map((m) => attack(`a${m}`, m))]);

  it('trois cartes visibles, le reste en « +n »', () => {
    const s = liveStack(items, false);
    expect(s.visible.map((i) => i.attack.id)).toEqual(['a5', 'a4', 'a3']);
    expect(s.hidden).toBe(2);
    expect(s.waiting).toBe(5);
    expect(s.first?.id).toBe('a5');
  });

  it('repliée : aucune carte, tout compté', () => {
    const s = liveStack(items, true);
    expect(s.visible).toEqual([]);
    expect(s.hidden).toBe(5);
    expect(s.first).toBeNull();
  });

  it('le premier à décider saute les cartes en cours ou confirmées', () => {
    const mixed = liveItems(
      [[attack('p', 9, { status: 'awaiting_dice' }), attack('d', 1)]],
      new Map([['s', attack('s', 8, { status: 'applied' })]]),
    );
    expect(liveStack(mixed, false).first?.id).toBe('d');
  });
});

describe('carte dépliée', () => {
  const stack = liveStack(
    liveItems(
      [[attack('p', 9, { status: 'awaiting_dice' }), attack('b', 2), attack('a', 1)]],
      new Map([['s', attack('s', 8, { status: 'applied' })]]),
    ),
    false,
    4,
  );

  it('par défaut, la première à décider', () => {
    expect(focusOf(stack, null)).toBe('b');
  });

  it('celle que le MJ a choisie, tant qu’elle attend une décision', () => {
    expect(focusOf(stack, 'a')).toBe('a');
  });

  it('un choix en cours, confirmé ou parti revient à la première à décider', () => {
    expect(focusOf(stack, 'p')).toBe('b');
    expect(focusOf(stack, 's')).toBe('b');
    expect(focusOf(stack, 'z')).toBe('b');
  });

  it('rien à décider : aucune', () => {
    expect(focusOf(liveStack([], false), 'a')).toBeNull();
  });
});
