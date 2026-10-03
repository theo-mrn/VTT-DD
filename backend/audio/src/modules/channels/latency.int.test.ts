/**
 * Chemin durable réel (§ 3.7) : commande → outbox → relais (LISTEN/NOTIFY) →
 * NATS JetStream → abonné. Mesure le délai entre la réponse REST du MJ et la
 * réception de l'événement par un abonné (ce que realtime relaie aux joueurs).
 */
import { connectBus, consumeEvents, startOutboxRelayWithBus, type Bus } from '@vtt/platform';
import type { EventEnvelope } from '@vtt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

const NATS_URL = process.env.NATS_URL ?? process.env.TEST_NATS_URL;

describe.skipIf(!TEST_DATABASE_URL || !NATS_URL)('latence du chemin durable', () => {
  let t: TestContext;
  let bus: Bus;
  let stopRelay: () => Promise<void>;
  let stopConsumer: () => Promise<void>;
  const received = new Map<number, number>();
  let c: Awaited<ReturnType<TestContext['table']>>;

  beforeAll(async () => {
    t = await testApp();
    c = await t.table();
    bus = await connectBus({ url: NATS_URL!, name: 'audio-latency-test' });
    stopConsumer = await consumeEvents(bus, {
      subjects: [`vtt.${c.id}.audio.>`],
      deliver: 'new',
      async handler(e: EventEnvelope) {
        const v = (e.payload.state as { version?: number } | undefined)?.version;
        if (typeof v === 'number') received.set(v, performance.now());
      },
    });
    stopRelay = startOutboxRelayWithBus({
      natsUrl: NATS_URL!,
      name: 'audio-latency-relay',
      schema: 'audio',
      connectionString: TEST_DATABASE_URL!,
    });
    await new Promise((r) => setTimeout(r, 500));
  }, 30_000);

  afterAll(async () => {
    await stopRelay?.();
    await stopConsumer?.();
    await bus?.close();
    await t?.close();
  });

  it('commande → événement reçu en moins de 200 ms (médiane)', async () => {
    const h = helpers(t);
    const a = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
      source: 'youtube',
      url: 'dQw4w9WgXcQ',
      name: 'A',
    });
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      t.clock.now += 1_000;
      const sent = performance.now();
      const s = await h.ok(
        c.gm,
        'POST',
        `/v1/audio/campaigns/${c.id}/channels/music/commands`,
        i % 2 ? { type: 'pause' } : { type: 'play', assetId: a.id },
      );
      const deadline = Date.now() + 3_000;
      while (!received.has(s.version) && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 2));
      expect(received.has(s.version)).toBe(true);
      delays.push(received.get(s.version)! - sent);
    }
    delays.sort((x, y) => x - y);
    const median = delays[Math.floor(delays.length / 2)]!;
    console.info(
      `latence commande → événement : médiane ${median.toFixed(1)} ms, max ${delays.at(-1)!.toFixed(1)} ms`,
    );
    expect(median).toBeLessThan(200);
  }, 60_000);
});
