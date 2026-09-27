/**
 * Bout en bout sur un vrai NATS JetStream (TEST_NATS_URL) et un vrai Postgres
 * (TEST_DATABASE_URL) : un événement publié sur le bus devient lisible par
 * l'API, une seule fois même publié deux fois. Consommateur durable propre au
 * test, limité aux sujets d'une campagne neuve, supprimé à la fin.
 */
import { connectBus, EVENTS_STREAM, publishEvent, type Bus } from '@vtt/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  envelope,
  get,
  TEST_DATABASE_URL,
  TEST_NATS_URL,
  testApp,
  type EventBody,
  type TestContext,
  type TestUser,
} from '../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL || !TEST_NATS_URL)('consommation du bus', () => {
  let t: TestContext;
  let bus: Bus;
  let gm: TestUser;
  let alice: TestUser;
  let campaignId: string;
  let durable: string;

  beforeEach(async () => {
    bus = await connectBus({ url: TEST_NATS_URL!, name: 'history-test' });
    campaignId = crypto.randomUUID();
    durable = `history-test-${campaignId.slice(0, 8)}`;
    t = await testApp(
      { NATS_URL: TEST_NATS_URL! },
      { consume: { durable, subjects: [`vtt.${campaignId}.>`] } },
    );
    gm = await t.user();
    alice = await t.user();
    t.services.campaign({ [gm.id]: 'gm', [alice.id]: 'player' }, campaignId);
  });

  afterEach(async () => {
    await t.close();
    await bus.jsm.consumers.delete(EVENTS_STREAM, durable).catch(() => undefined);
    await bus.close();
  });

  /** Attend que l'API renvoie `n` événements (5 s au plus). */
  async function waitFor(n: number): Promise<EventBody[]> {
    let events: EventBody[] = [];
    for (let i = 0; i < 50 && events.length < n; i++) {
      await new Promise((r) => setTimeout(r, 100));
      events = (await get<{ events: EventBody[] }>(t, gm, `/v1/history?campaignId=${campaignId}`))
        .events;
    }
    return events;
  }

  it('un événement publié est journalisé une fois, chaîné et lisible par l’API', async () => {
    const first = envelope({ roomId: campaignId });
    const second = envelope({ roomId: campaignId, visibility: 'gm_only', type: 'dice.rolled' });
    await publishEvent(bus, first);
    // Republication (relais qui rejoue après une coupure) : écartée par JetStream
    expect((await publishEvent(bus, first)).duplicate).toBe(true);
    await publishEvent(bus, second);

    const events = await waitFor(2);
    expect(events.map((x) => [x.id, x.seq])).toEqual([
      [second.id, 2],
      [first.id, 1],
    ]);
    // Le joueur ne voit pas le jet secret
    const seen = await get<{ events: EventBody[] }>(
      t,
      alice,
      `/v1/history?campaignId=${campaignId}`,
    );
    expect(seen.events.map((x) => x.id)).toEqual([first.id]);
    expect(await get(t, gm, `/v1/history/verify?campaignId=${campaignId}`)).toMatchObject({
      ok: true,
      events: 2,
    });
  });
});
