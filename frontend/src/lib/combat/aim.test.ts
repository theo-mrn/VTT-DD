import { describe, expect, it } from 'vitest';
import { AIM_TTL_MS, AimBoard, AimSender, aimMessage } from './aim';
import { declaredStage, stepButtonLabel, stepToLaunch } from './attack-flow';
import { clientRunner, partitionStep, serverRunner } from './dice-steps';
import { attack as testAttack } from './test-kit';

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
  it('repli du serveur : aucune face, le serveur tire cette étape seulement', async () => {
    const step = {
      id: 's1',
      phase: 'roll' as const,
      dice: [{ id: 'd1', targetId: null, faces: 20 }],
    };
    expect(await serverRunner.run(step)).toEqual({ stepId: 's1', results: [] });
  });

  it('dégâts après TOUCHÉ : étape que l’attaquant déclenche, libellé tiré des données', () => {
    const attack = testAttack;
    const roll = { id: 'r', phase: 'roll' as const, dice: [] };
    const after = { id: 'a', phase: 'after' as const, label: 'Dégâts', dice: [] };
    expect(stepToLaunch(attack({ status: 'awaiting_dice', pendingSteps: [roll] }))).toBeNull();
    expect(declaredStage(attack({ status: 'awaiting_dice', pendingSteps: [roll] }))).toBe('dice');
    const waiting = attack({ status: 'awaiting_dice', pendingSteps: [after] });
    expect(stepToLaunch(waiting)).toBe(after);
    expect(declaredStage(waiting)).toBe('next');
    expect(stepToLaunch({ ...waiting, resolving: true })).toBeNull();
    expect(stepButtonLabel(after)).toBe('Lancer les dégâts');
    expect(stepButtonLabel({ ...after, phase: 'table', label: 'Blessure critique' })).toBe(
      'Tirer : Blessure critique',
    );
    expect(stepButtonLabel({ ...after, label: undefined })).toBe('Lancer la suite');
  });

  it('dés tirés dans le navigateur : une face valide par dé de l’étape', async () => {
    const step = {
      id: 'roll-0',
      phase: 'roll' as const,
      dice: [
        { id: '0:jet:d20:0', targetId: 't1', faces: 20 },
        { id: '1:jet:d20:0', targetId: 't2', faces: 20 },
        { id: 'apres:d6:0', targetId: null, faces: 6 },
      ],
    };
    for (let n = 0; n < 50; n++) {
      const body = await clientRunner.run(step);
      expect(body.stepId).toBe('roll-0');
      expect(body.results.map((r) => r.id)).toEqual(step.dice.map((d) => d.id));
      body.results.forEach((r, i) => {
        expect(r.value).toBeGreaterThanOrEqual(1);
        expect(r.value).toBeLessThanOrEqual(step.dice[i]!.faces);
      });
    }
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
