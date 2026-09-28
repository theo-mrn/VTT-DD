import { describe, expect, it } from 'vitest';
import { ServerClock } from './clock';

describe('horloge du serveur', () => {
  it('garde l’aller-retour le plus court : décalage exact malgré un réseau asymétrique', async () => {
    let local = 1_000;
    // Serveur en avance de 5 000 ms ; aller-retours 120, 18, 300, 40, 60 ms (retours lents)
    const rtts = [120, 18, 300, 40, 60];
    let i = 0;
    const clock = new ServerClock(
      async () => {
        const rtt = rtts[i++]!;
        const serverTime = local + 5_000 + rtt / 2 + (rtt > 100 ? rtt / 4 : 0);
        local += rtt;
        return { serverTime };
      },
      () => local,
      async (ms) => {
        local += ms;
      },
    );
    expect(clock.synced).toBe(false);
    await clock.resync();
    expect(clock.synced).toBe(true);
    expect(clock.rttMs).toBe(18);
    expect(clock.offsetMs).toBeCloseTo(5_000, 5);
    expect(clock.now()).toBeCloseTo(local + 5_000, 5);
  });

  it('échantillons perdus tolérés ; un seul échantillonnage à la fois ; estimation grossière avant', async () => {
    let calls = 0;
    let local = 0;
    const clock = new ServerClock(
      async () => {
        calls += 1;
        if (calls % 2) throw new Error('réseau');
        return { serverTime: local + 250 };
      },
      () => local,
      async () => undefined,
    );
    clock.hint(700);
    expect(clock.offsetMs).toBe(700);
    await Promise.all([clock.resync(), clock.resync()]);
    expect(calls).toBe(5);
    expect(clock.offsetMs).toBe(250);
    clock.hint(9_999); // mesurée : l'estimation grossière ne remplace plus rien
    expect(clock.offsetMs).toBe(250);
  });
});
