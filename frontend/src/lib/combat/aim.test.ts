import { describe, expect, it } from 'vitest';
import { AIM_TTL_MS, AimBoard, AimSender, aimMessage } from './aim';
import { partitionStep, serverRunner } from './dice-steps';

describe('visée en direct (combat.aim)', () => {
  it('n’envoie que les changements, puis `end` une seule fois', () => {
    const sent: unknown[] = [];
    const sender = new AimSender((m) => sent.push(m));
    sender.update(aimMessage('hero', ['gobelin']));
    sender.update(aimMessage('hero', ['gobelin']));
    sender.update(aimMessage('hero', ['gobelin', 'loup']));
    sender.update(null);
    sender.end();
    expect(sent).toEqual([
      { a: 'hero', t: ['gobelin'] },
      { a: 'hero', t: ['gobelin', 'loup'] },
      { a: 'hero', t: ['gobelin', 'loup'], end: true },
    ]);
  });

  it('pas d’attaquant : rien à montrer', () => {
    expect(aimMessage(null, ['gobelin'])).toBeNull();
    const sent: unknown[] = [];
    new AimSender((m) => sent.push(m)).end();
    expect(sent).toEqual([]);
  });

  it('réception (MJ) : par émetteur, `end` efface, une visée muette expire', () => {
    const board = new AimBoard();
    expect(board.receive('alice', { a: 'hero', t: ['gobelin'] }, 0)).toBe(true);
    expect(board.receive('alice', { a: 'hero', t: ['gobelin'] }, 10)).toBe(false);
    expect(board.receive('bob', { a: 'brom', t: [] }, 20)).toBe(true);
    expect(board.list().map((a) => a.attackerId)).toEqual(['hero', 'brom']);
    expect(board.receive('alice', { a: 'hero', t: ['gobelin'], end: true }, 30)).toBe(true);
    expect(board.size).toBe(1);
    // Message invalide : ignoré
    expect(board.receive('eve', { a: 42 }, 40)).toBe(false);
    expect(board.expire(20 + AIM_TTL_MS + 1)).toBe(true);
    expect(board.size).toBe(0);
  });
});

describe('étapes de dés (point d’extension de l’étape C)', () => {
  it('repli du serveur : aucune face, le serveur tire', async () => {
    const step = {
      id: 's1',
      phase: 'roll' as const,
      dice: [{ id: 'd1', targetId: null, faces: 20 }],
    };
    expect(await serverRunner.run(step)).toEqual({
      stepId: 's1',
      results: [],
      serverFallback: true,
    });
  });

  it('dés lancés en 3D et dés laissés au serveur (d100, limite du lanceur)', () => {
    const dice = [
      { id: 'a', targetId: 't1', faces: 20 },
      { id: 'b', targetId: null, faces: 100 },
      ...Array.from({ length: 16 }, (_, i) => ({ id: `c${i}`, targetId: null, faces: 6 })),
      { id: 'sym', targetId: null, faces: 8, die: 'aptitude' },
    ];
    const { thrown, server } = partitionStep({ id: 's', phase: 'roll', dice }, (die) =>
      die === 'aptitude' ? 'd8' : null,
    );
    expect(thrown).toHaveLength(15);
    expect(server.map((d) => d.id)).toEqual(['b', 'c14', 'c15', 'sym']);
  });
});
