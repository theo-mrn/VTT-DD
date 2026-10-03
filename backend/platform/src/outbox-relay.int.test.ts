/**
 * Relais d'outbox sur un vrai Postgres (TEST_DATABASE_URL, rôle d'un service
 * quelconque) et, pour la publication réelle, un vrai NATS (NATS_URL).
 *
 * L'outbox testée est une table temporaire (`pg_temp.outbox`, même colonnes et
 * même trigger que le gabarit) : pas besoin de droits DDL, et l'outbox réelle
 * du service n'est jamais touchée. Une table temporaire n'existe que dans sa
 * session : le relais reçoit donc un pool d'une seule connexion.
 */
import { randomUUID } from 'node:crypto';
import { EventEnvelope, uuidv7 } from '@vtt/contracts';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectBus, consumeEvents, EVENTS_STREAM, publishEvent, type Bus } from './bus.js';
import { startOutboxRelay, startOutboxRelayWithBus } from './outbox-relay.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const NATS_URL = process.env.NATS_URL;
const SCHEMA = 'pg_temp';

function event(roomId: string): EventEnvelope {
  return EventEnvelope.parse({
    id: uuidv7(),
    type: 'test.relayed',
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId,
    actor: { userId: null, role: 'system' },
    aggregate: { type: 'test', id: roomId },
    payload: { ok: true },
    correlationId: 'test-outbox-relay',
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000) {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('délai dépassé');
    await sleep(50);
  }
}

/** Faux bus : enregistre les publications, échoue quand `fail` le décide. */
function fakeBus(fail: (id: string) => boolean = () => false) {
  const published: string[] = [];
  const js = {
    publish: async (_subject: string, _data: string, opts: { msgID: string }) => {
      if (fail(opts.msgID)) throw new Error('nats indisponible');
      published.push(opts.msgID);
      return { seq: published.length, duplicate: false };
    },
  };
  return { bus: { js } as unknown as Pick<Bus, 'js'>, published };
}

describe('relais d’outbox : options', () => {
  it('refuse un schéma qui n’est pas un identifiant SQL simple', async () => {
    const { bus } = fakeBus();
    for (const schema of ['dice"; DROP TABLE x; --', 'Dice', '1dice', '', 'a.b']) {
      await expect(
        startOutboxRelay({ schema, bus, connectionString: 'postgres://x@localhost:1/x' }),
      ).rejects.toThrow(/invalide/);
      expect(() =>
        startOutboxRelayWithBus({
          schema,
          natsUrl: 'nats://localhost:1',
          name: 'test',
          connectionString: 'postgres://x@localhost:1/x',
        }),
      ).toThrow(/invalide/);
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)('relais d’outbox (Postgres réel)', () => {
  let pool: pg.Pool;

  /** Insère dans l'ordre donné ; `created_at` suit l'ordre de `events` (1 ms d'écart). */
  const insert = async (events: EventEnvelope[], insertionOrder = events) => {
    const base = Date.now();
    for (const e of insertionOrder) {
      await pool.query(
        `INSERT INTO pg_temp.outbox (id, subject, envelope, created_at) VALUES ($1, $2, $3, $4)`,
        [e.id, `vtt.${e.roomId}.test.relayed`, e, new Date(base + events.indexOf(e))],
      );
    }
  };
  const row = async (id: string) =>
    (
      await pool.query<{ published: boolean; attempts: number; last_error: string | null }>(
        `SELECT published_at IS NOT NULL AS published, attempts, last_error
           FROM pg_temp.outbox WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const pending = async () =>
    (
      await pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_temp.outbox WHERE published_at IS NULL',
      )
    ).rows[0]!.n;
  const relay = (bus: Pick<Bus, 'js'>, pollMs = 60_000) =>
    startOutboxRelay({
      schema: SCHEMA,
      bus,
      pool,
      listenConnectionString: TEST_DATABASE_URL!,
      pollMs,
    });

  beforeAll(async () => {
    // Une seule connexion, jamais recyclée : la table temporaire y reste visible
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1, idleTimeoutMillis: 0 });
    await pool.query(`
      CREATE TEMP TABLE outbox (
        id uuid PRIMARY KEY,
        subject text NOT NULL,
        envelope jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz,
        attempts int NOT NULL DEFAULT 0,
        last_error text
      );
      CREATE FUNCTION pg_temp.outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_notify('pg_temp_outbox', NEW.id::text);
        RETURN NEW;
      END $$;
      CREATE TRIGGER outbox_notify AFTER INSERT ON outbox
        FOR EACH ROW EXECUTE FUNCTION pg_temp.outbox_notify();
    `);
  });
  afterEach(async () => {
    await pool.query('DELETE FROM pg_temp.outbox');
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('publie les lignes en attente dans l’ordre puis les marque publiées', async () => {
    const room = randomUUID();
    const events = [event(room), event(room), event(room)];
    // Insertion dans le désordre : c'est created_at qui fait foi
    await insert(events, [events[2]!, events[0]!, events[1]!]);
    const fake = fakeBus();
    const stop = await relay(fake.bus);
    try {
      await waitFor(async () => (await pending()) === 0);
      expect(fake.published).toEqual(events.map((e) => e.id));
    } finally {
      await stop();
    }
  });

  it('se réveille sur NOTIFY sans attendre le poll', async () => {
    const fake = fakeBus();
    const stop = await relay(fake.bus, 60_000);
    try {
      const e = event(randomUUID());
      await insert([e]);
      await waitFor(() => fake.published.includes(e.id), 2_000);
      expect((await row(e.id))?.published).toBe(true);
    } finally {
      await stop();
    }
  });

  it('en cas d’échec : attempts, last_error, arrêt du lot et pause jusqu’au poll', async () => {
    const room = randomUUID();
    const [a, b, c] = [event(room), event(room), event(room)];
    await insert([a!, b!, c!]);
    let down = true;
    const fake = fakeBus((id) => down && id === b!.id);
    const stop = await relay(fake.bus, 1_000);
    try {
      await waitFor(async () => (await row(b!.id))?.attempts === 1);
      expect(await row(a!.id)).toMatchObject({ published: true, attempts: 0 });
      expect(await row(b!.id)).toMatchObject({
        published: false,
        attempts: 1,
        last_error: 'nats indisponible',
      });
      // L'ordre est préservé : c n'a pas été tentée
      expect(await row(c!.id)).toMatchObject({ published: false, attempts: 0 });

      // En pause, une notification ne relance pas le lot (pas de boucle folle)
      const d = event(room);
      await insert([d]);
      await sleep(300);
      expect((await row(b!.id))?.attempts).toBe(1);
      expect(fake.published).toEqual([a!.id]);

      // NATS revient : le poll reprend dans l'ordre
      down = false;
      await waitFor(async () => (await pending()) === 0, 4_000);
      expect(fake.published).toEqual([a!.id, b!.id, c!.id, d.id]);
    } finally {
      await stop();
    }
  });

  it('purge les lignes publiées depuis plus de 7 jours', async () => {
    const room = randomUUID();
    const [old, recent] = [event(room), event(room)];
    await insert([old!, recent!]);
    await pool.query(
      `UPDATE pg_temp.outbox SET published_at = now() - interval '8 days' WHERE id = $1`,
      [old!.id],
    );
    await pool.query(
      `UPDATE pg_temp.outbox SET published_at = now() - interval '6 days' WHERE id = $1`,
      [recent!.id],
    );
    const stop = await relay(fakeBus().bus);
    try {
      await waitFor(async () => (await row(old!.id)) === undefined);
      expect(await row(recent!.id)).toMatchObject({ published: true });
    } finally {
      await stop();
    }
  });

  describe.skipIf(!NATS_URL)('avec NATS JetStream', () => {
    let bus: Bus;
    beforeAll(async () => {
      bus = await connectBus({ url: NATS_URL!, name: 'test-outbox-relay' });
    });
    afterAll(async () => {
      await bus?.close();
    });

    it('les événements arrivent sur le flux, une seule fois', async () => {
      const room = randomUUID();
      const events = [event(room), event(room), event(room)];
      await insert(events);
      const stop = await relay(bus);
      const received: string[] = [];
      const stopConsuming = await consumeEvents(bus, {
        subjects: [`vtt.${room}.>`],
        deliver: 'all',
        handler: async (e) => {
          received.push(e.id);
        },
      });
      try {
        await waitFor(async () => (await pending()) === 0);
        await waitFor(() => received.length === events.length);
        expect(received).toEqual(events.map((e) => e.id));

        // Republication (coupure entre la publication et le COMMIT) : écartée par JetStream
        expect((await publishEvent(bus, events[0]!)).duplicate).toBe(true);
        await sleep(200);
        expect(received).toHaveLength(events.length);
      } finally {
        await stopConsuming();
        await stop();
        // Le flux local est partagé avec history et realtime : on retire nos événements
        await bus.jsm.streams.purge(EVENTS_STREAM, { filter: `vtt.${room}.>` });
      }
    });
  });
});
