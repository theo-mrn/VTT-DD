/**
 * Précision de la synchronisation (docs/audio.md § 3.7), mesurée sur le vrai
 * service en HTTP : deux clients aux horloges décalées (−2,5 s et +4,2 s)
 * estiment l'heure du serveur par GET /v1/audio/clock (5 échantillons,
 * `estimateOffset`) puis calculent la position d'un canal en lecture au même
 * instant (`positionAt`). L'écart entre eux est l'erreur de synchronisation.
 */
import type { AddressInfo } from 'node:net';
import { estimateOffset, positionAt, type ClockSample } from '@vtt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('précision de la synchronisation', () => {
  let t: TestContext;
  let base: string;
  beforeAll(async () => {
    t = await testApp();
    t.clock.now = 0;
    // Horloge réelle du serveur pour cette mesure
    (t.app.deps as { now: () => number }).now = () => Date.now();
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => t?.close());

  it('deux clients décalés s’accordent à quelques millisecondes', async () => {
    const u = await t.user();
    const client = async (skewMs: number) => {
      const local = () => performance.timeOrigin + performance.now() + skewMs;
      const samples: ClockSample[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = local();
        const r = await fetch(`${base}/v1/audio/clock`, { headers: u.auth });
        const { serverTime } = (await r.json()) as { serverTime: number };
        samples.push({ t0, t1: local(), serverTime });
        await new Promise((ok) => setTimeout(ok, 20));
      }
      const est = estimateOffset(samples)!;
      return { est, serverNow: () => local() + est.offsetMs };
    };
    const [a, b] = await Promise.all([client(-2_500), client(4_200)]);
    const state = {
      status: 'playing' as const,
      positionMs: 0,
      anchorAt: new Date(Date.now() - 30_000).toISOString(),
      repeat: 'off' as const,
      track: { durationMs: 600_000 },
    };
    const errors: number[] = [];
    for (let i = 0; i < 20; i++) {
      const pa = positionAt(state, a.serverNow()).positionMs;
      const pb = positionAt(state, b.serverNow()).positionMs;
      const truth = positionAt(state, Date.now()).positionMs;
      errors.push(Math.max(Math.abs(pa - pb), Math.abs(pa - truth), Math.abs(pb - truth)));
      await new Promise((ok) => setTimeout(ok, 5));
    }
    const worst = Math.max(...errors);
    console.info(
      `synchronisation : aller-retour ${a.est.rttMs.toFixed(2)} / ${b.est.rttMs.toFixed(2)} ms, ` +
        `écart maximal entre clients et serveur ${worst.toFixed(2)} ms`,
    );
    expect(worst).toBeLessThan(20);
  });
});
