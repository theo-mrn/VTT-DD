import { describe, expect, it } from 'vitest';
import type { CharacterInfo } from '../modules/tokens/model';
import { BubbleBoard, bubbleMessage, speakerOf } from './bubbles';

const info = (id: string, o: Partial<CharacterInfo>): CharacterInfo => ({
  id,
  name: id,
  portraitUrl: null,
  side: null,
  kind: 'pc',
  ownerId: null,
  playedBy: null,
  resource: null,
  ...o,
});

function setup() {
  let now = 0;
  const timers: { at: number; cb: () => void; live: boolean }[] = [];
  const clock = {
    now: () => now,
    setTimeout: (cb: () => void, ms: number) => {
      const t = { at: now + ms, cb, live: true };
      timers.push(t);
      return t;
    },
    clearTimeout: (h: unknown) => void ((h as { live: boolean }).live = false),
  };
  const chars = new Map([
    ['hero', info('hero', { ownerId: 'alice', playedBy: 'alice' })],
    ['gob', info('gob', { kind: 'npc', ownerId: 'gm', playedBy: null })],
  ]);
  const board = new BubbleBoard((id) => chars.get(id), clock);
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers) if (t.live && t.at <= now) ((t.live = false), t.cb());
  };
  return { board, advance, bubbles: () => board.store.getState().bubbles };
}

describe('bulles d’interaction', () => {
  it('le joueur qui incarne le héros le fait parler ; un autre, un PNJ ou un message faux : rien', () => {
    const t = setup();
    t.board.receive(
      bubbleMessage('hero', { type: 'text', content: ' Bonjour ', durationMs: 5000 }),
      {
        userId: 'bob',
      },
    );
    t.board.receive(bubbleMessage('gob', { type: 'emoji', content: '😡', durationMs: 5000 }), {
      userId: 'gm',
    });
    t.board.receive(
      { c: 'hero', b: { t: 'text', v: 'x'.repeat(41), d: 5000 } },
      { userId: 'alice' },
    );
    expect(t.bubbles()).toEqual({});
    t.board.receive(
      bubbleMessage('hero', { type: 'text', content: ' Bonjour ', durationMs: 5000 }),
      {
        userId: 'alice',
      },
    );
    expect(t.bubbles().hero).toMatchObject({ type: 'text', content: 'Bonjour', until: 5000 });
  });

  it('disparaît à l’échéance ; une nouvelle remplace l’ancienne et repart de zéro ; retrait', () => {
    const t = setup();
    t.board.show('hero', 'emoji', '😂', 3000);
    t.advance(2000);
    t.board.show('hero', 'emoji', '😱', 3000);
    t.advance(2000);
    expect(t.bubbles().hero?.content).toBe('😱');
    t.advance(1000);
    expect(t.bubbles()).toEqual({});
    t.board.show('hero', 'text', 'Attendez !', 60_000);
    t.board.receive({ c: 'hero', b: null }, { userId: 'alice' });
    expect(t.bubbles()).toEqual({});
  });

  it('durée bornée de 1 à 60 s', () => {
    const t = setup();
    t.board.show('hero', 'emoji', '👍', 999_999);
    expect(t.bubbles().hero?.until).toBe(60_000);
    expect(bubbleMessage('hero', { type: 'emoji', content: '👍', durationMs: 10 }).b?.d).toBe(1000);
  });

  it('héros du joueur : celui qu’il incarne, sinon son seul personnage', () => {
    const list = [
      info('a', { ownerId: 'u', playedBy: 'v' }),
      info('b', { ownerId: 'u' }),
      info('n', { kind: 'npc', ownerId: 'u' }),
    ];
    expect(speakerOf(list, 'v')?.id).toBe('a');
    expect(speakerOf(list, 'u')?.id).toBe('b');
    expect(speakerOf([...list, info('c', { ownerId: 'u' })], 'u')).toBeNull();
  });
});
