import { describe, expect, it } from 'vitest';
import type { LiveStroke } from '@/lib/map/live/live-channel';
import { GHOST_IDLE_MS, GHOST_SETTLE_MS, LiveStrokes } from './live-strokes';

const meta = (id: string, tool: LiveStroke['tool'] = 'pen'): Omit<LiveStroke, 'points'> => ({
  id,
  tool,
  color: '#3e9bf580',
  width: 6,
});

const msg = (userId: string, stroke: LiveStroke | null, end = false) => ({ userId, stroke, end });

describe('tracés en cours des autres', () => {
  it('main levée : les deltas s’ajoutent, avec la couleur de l’auteur', () => {
    const g = new LiveStrokes();
    expect(g.receive(msg('ana', { ...meta('t1'), points: [0, 0, 10, 0] }), 0)).toBe(true);
    g.receive(msg('ana', { ...meta('t1'), points: [20, 5] }), 50);
    const ghost = g.get('ana:t1')!;
    expect(ghost.flat).toEqual([0, 0, 10, 0, 20, 5]);
    expect(ghost.color).toBe('#3e9bf580');
    expect(ghost.ended).toBe(false);
  });

  it('forme : l’origine, puis la dernière extrémité reçue', () => {
    const g = new LiveStrokes();
    g.receive(msg('ana', { ...meta('r', 'rectangle'), points: [0, 0, 10, 10] }), 0);
    g.receive(msg('ana', { ...meta('r', 'rectangle'), points: [20, 20, 30, 40] }), 50);
    expect(g.get('ana:r')!.flat).toEqual([0, 0, 30, 40]);
    expect(g.get('ana:r')!.fill).toBeNull();
  });

  it('forme remplie : le fantôme garde le remplissage de l’auteur', () => {
    const g = new LiveStrokes();
    g.receive(
      msg('ana', { ...meta('r', 'rectangle'), fill: '#3e9bf559', points: [0, 0, 10, 10] }),
      0,
    );
    expect(g.get('ana:r')!.fill).toBe('#3e9bf559');
  });

  it('un dernier message « eraser » annule le tracé', () => {
    const g = new LiveStrokes();
    g.receive(msg('ana', { ...meta('t1'), points: [0, 0, 10, 0] }), 0);
    g.receive(msg('ana', { ...meta('t1', 'eraser'), points: [10, 0] }, true), 60);
    expect(g.size).toBe(0);
    // Inconnu : ignoré
    expect(g.receive(msg('ana', { ...meta('zz', 'eraser'), points: [1, 1] }), 70)).toBe(false);
  });

  it('se pose quand le dessin enregistré du même auteur, parti du même point, arrive', () => {
    const g = new LiveStrokes();
    g.receive(msg('ana', { ...meta('t1'), points: [100.1, 50, 200, 50] }), 0);
    g.receive(msg('ana', null, true), 100);
    expect(g.size).toBe(1);
    // Un autre auteur, ou un autre point : rien
    expect(g.arrived({ createdBy: 'bob', points: [{ x: 100.1, y: 50 }] }, 150)).toBe(false);
    expect(g.arrived({ createdBy: 'ana', points: [{ x: 300, y: 50 }] }, 160)).toBe(false);
    expect(g.arrived({ createdBy: 'ana', points: [{ x: 100.08, y: 50 }] }, 200)).toBe(true);
    expect(g.size).toBe(0);
  });

  it('le dessin arrivé avant la fin du geste pose le fantôme à la fin', () => {
    const g = new LiveStrokes();
    g.receive(msg('ana', { ...meta('t1'), points: [10, 10, 20, 20] }), 0);
    g.arrived({ createdBy: 'ana', points: [{ x: 10, y: 10 }] }, 40);
    expect(g.size).toBe(1);
    g.receive(msg('ana', null, true), 60);
    expect(g.size).toBe(0);
  });

  it('un second tracé en cours ne se pose pas sur le dessin du premier', () => {
    const g = new LiveStrokes();
    g.receive(msg('ana', { ...meta('t1'), points: [0, 0, 5, 5] }), 0);
    g.receive(msg('ana', null, true), 10);
    g.receive(msg('ana', { ...meta('t2'), points: [0, 0, 9, 9] }), 20);
    g.arrived({ createdBy: 'ana', points: [{ x: 0, y: 0 }] }, 30);
    expect(g.get('ana:t1')).toBeUndefined();
    expect(g.get('ana:t2')).toBeDefined();
  });

  it('expire : 3 s après la fin sans dessin, ou muet trop longtemps', () => {
    const g = new LiveStrokes();
    g.receive(msg('ana', { ...meta('t1'), points: [0, 0, 5, 5] }), 0);
    g.receive(msg('ana', null, true), 100);
    g.receive(msg('bob', { ...meta('t2'), points: [0, 0, 5, 5] }), 0);
    expect(g.nextExpiry(100)).toBe(GHOST_SETTLE_MS);
    expect(g.expire(100 + GHOST_SETTLE_MS - 1)).toBe(false);
    expect(g.expire(100 + GHOST_SETTLE_MS)).toBe(true);
    expect(g.get('ana:t1')).toBeUndefined();
    expect(g.get('bob:t2')).toBeDefined();
    expect(g.expire(GHOST_IDLE_MS)).toBe(true);
    expect(g.size).toBe(0);
    expect(g.nextExpiry(0)).toBeNull();
  });
});
