/**
 * Consommateur des titres sur un vrai PostgreSQL (rôle identity_svc) : le
 * handler est appelé directement avec des enveloppes. Avec NATS_URL, un test
 * de bout en bout passe par JetStream (durable et événements de test retirés
 * du flux à la fin : il est partagé avec history et realtime).
 *   TEST_DATABASE_URL=postgres://identity_svc:identity-dev@localhost:5432/vtt \
 *   NATS_URL=nats://127.0.0.1:4222 pnpm --filter @vtt/identity test
 */
import { uuidv7, type EventEnvelope } from '@vtt/contracts';
import { connectBus, EVENTS_STREAM, publishEvent, type Bus } from '@vtt/platform';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inbox, outbox, titleProgress, userTitles } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { handleTitleEvent, startTitlesConsumer } from './consumer.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

const NATS_URL = process.env.NATS_URL;
/** Consommateur propre aux tests : l'inbox du vrai identity-titles n'est pas touchée. */
const CONSUMER = `identity-titles-test-${crypto.randomUUID().slice(0, 8)}`;

function envelope(
  type: string,
  userId: string,
  payload: Record<string, unknown>,
  roomId: string = crypto.randomUUID(),
): EventEnvelope {
  return {
    id: uuidv7(),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId,
    actor: { userId, role: 'player', characterId: null },
    aggregate: { type: 'roll', id: uuidv7() },
    visibility: 'public',
    payload,
    correlationId: `test-${uuidv7()}`,
    causationId: null,
    traceparent: null,
  };
}

const roll = (userId: string, d20: number[], source = '3d', roomId?: string) =>
  envelope(
    'dice.rolled',
    userId,
    {
      authorId: userId,
      source,
      dice: [{ faces: 20, values: d20.map((value) => ({ value, kept: true, exploded: false })) }],
      output: `1d20 [${d20.join(', ')}]`,
    },
    roomId,
  );

describe.skipIf(!TEST_DATABASE_URL)('consommateur des titres', () => {
  let t: Contexte;
  const deps = () => ({ db: t.db, consumer: CONSUMER });

  beforeAll(async () => {
    t = await appDeTest();
  });

  afterAll(async () => {
    await t.db.delete(inbox).where(eq(inbox.consumer, CONSUMER));
    await t.fermer();
  });

  const titresDe = async (userId: string) =>
    (
      await t.db
        .select({ slug: userTitles.slug })
        .from(userTitles)
        .where(eq(userTitles.userId, userId))
    )
      .map((r) => r.slug)
      .sort();

  const compteurs = async (userId: string) =>
    Object.fromEntries(
      (
        await t.db
          .select({ counter: titleProgress.counter, value: titleProgress.value })
          .from(titleProgress)
          .where(eq(titleProgress.userId, userId))
      ).map((r) => [r.counter, r.value]),
    );

  const deblocages = async (userId: string) =>
    (
      await t.db
        .select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          and(
            sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`,
            sql`${outbox.envelope}->>'type' = 'identity.title_unlocked'`,
          ),
        )
    ).map((r) => r.envelope as EventEnvelope);

  const amorcer = (userId: string, counter: string, value: number) =>
    t.db.insert(titleProgress).values({ userId, counter, value });

  it('débloque « Maudit des dés » au premier 1 naturel, une seule fois, avec son événement', async () => {
    const j = await t.inscrire();
    const e = roll(j.id, [1]);
    expect(await handleTitleEvent(deps(), e)).toEqual({
      duplicate: false,
      unlocked: ['maudit-des-des', 'apprenti-lanceur'],
    });
    expect(await titresDe(j.id)).toEqual(['apprenti-lanceur', 'maudit-des-des']);
    expect(await compteurs(j.id)).toEqual({ dice_rolls: 1, critical_fails: 1 });

    const evts = await deblocages(j.id);
    expect(evts).toHaveLength(2);
    const maudit = evts.find((x) => x.payload.slug === 'maudit-des-des')!;
    expect(maudit).toMatchObject({
      roomId: null,
      visibility: 'owner',
      actor: { userId: j.id, role: 'user' },
      aggregate: { type: 'user', id: j.id },
      payload: { slug: 'maudit-des-des', label: 'Maudit des dés', source: 'event' },
      correlationId: e.correlationId,
      causationId: e.id,
    });

    // Deuxième 1 naturel : compté, mais le titre n'est pas redébloqué
    expect(await handleTitleEvent(deps(), roll(j.id, [1]))).toEqual({
      duplicate: false,
      unlocked: [],
    });
    expect(await compteurs(j.id)).toEqual({ dice_rolls: 2, critical_fails: 2 });
    expect(await deblocages(j.id)).toHaveLength(2);
  });

  it('traite un événement une seule fois, même relivré ou reçu deux fois en même temps', async () => {
    const j = await t.inscrire();
    const e = roll(j.id, [20]);
    const [a, b] = await Promise.all([handleTitleEvent(deps(), e), handleTitleEvent(deps(), e)]);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(await handleTitleEvent(deps(), e)).toEqual({ duplicate: true, unlocked: [] });

    expect(await compteurs(j.id)).toEqual({ dice_rolls: 1, critical_successes: 1 });
    expect(await titresDe(j.id)).toEqual(['apprenti-lanceur', 'beni-des-dieux', 'chanceux']);
    expect(await deblocages(j.id)).toHaveLength(3);
    const vus = await t.db.select().from(inbox).where(eq(inbox.eventId, e.id));
    expect(vus).toEqual([expect.objectContaining({ consumer: CONSUMER })]);
  });

  it('débloque les titres à paliers quand le compteur atteint le seuil', async () => {
    const j = await t.inscrire();
    await amorcer(j.id, 'dice_rolls', 48);
    await amorcer(j.id, 'critical_fails', 9);
    await amorcer(j.id, 'chat_messages', 49);

    expect((await handleTitleEvent(deps(), roll(j.id, [4]))).unlocked).toEqual([
      'apprenti-lanceur',
    ]);
    expect((await handleTitleEvent(deps(), roll(j.id, [1]))).unlocked).toEqual([
      'maudit-des-des',
      'lanceur-enthousiaste',
      'eternel-malchanceux',
    ]);
    const message = envelope('campaign.message_posted', j.id, {
      id: uuidv7(),
      authorId: j.id,
      body: 'Bonjour',
    });
    expect((await handleTitleEvent(deps(), message)).unlocked).toEqual([
      'orateur-novice',
      'conteur-bavard',
    ]);
    expect(await compteurs(j.id)).toEqual({
      dice_rolls: 50,
      critical_fails: 10,
      chat_messages: 50,
    });
  });

  it('ignore les jets importés, par clé d’API ou hors campagne, sans rien écrire', async () => {
    const j = await t.inscrire();
    const ignores = [
      roll(j.id, [1], 'import'),
      roll(j.id, [20], 'api'),
      { ...roll(j.id, [20]), roomId: null },
    ];
    for (const e of ignores) {
      expect(await handleTitleEvent(deps(), e)).toEqual({ duplicate: false, unlocked: [] });
    }
    expect(await titresDe(j.id)).toEqual([]);
    expect(await compteurs(j.id)).toEqual({});
    const vus = await t.db
      .select()
      .from(inbox)
      .where(
        inArray(
          inbox.eventId,
          ignores.map((e) => e.id),
        ),
      );
    expect(vus).toEqual([]);
  });

  it('consomme sans effet l’événement d’un compte inconnu d’identity', async () => {
    const inconnu = crypto.randomUUID();
    const e = roll(inconnu, [1]);
    expect(await handleTitleEvent(deps(), e)).toEqual({ duplicate: false, unlocked: [] });
    expect(await handleTitleEvent(deps(), e)).toEqual({ duplicate: true, unlocked: [] });
    expect(await compteurs(inconnu)).toEqual({});
  });

  describe.skipIf(!NATS_URL)('de bout en bout avec NATS JetStream', () => {
    let bus: Bus;
    beforeAll(async () => {
      bus = await connectBus({ url: NATS_URL!, name: 'test-identity-titles' });
    });
    afterAll(async () => {
      await bus?.close();
    });

    it('un dice.rolled publié sur le bus débloque le titre', async () => {
      const j = await t.inscrire();
      const room = crypto.randomUUID();
      const stop = await startTitlesConsumer({ bus, db: t.db, durable: CONSUMER });
      try {
        const e = roll(j.id, [20], '3d', room);
        await publishEvent(bus, e);
        const limite = Date.now() + 10_000;
        while (!(await titresDe(j.id)).includes('beni-des-dieux') && Date.now() < limite) {
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(await titresDe(j.id)).toEqual(['apprenti-lanceur', 'beni-des-dieux', 'chanceux']);
        expect(await compteurs(j.id)).toEqual({ dice_rolls: 1, critical_successes: 1 });
      } finally {
        await stop();
        await bus.jsm.consumers.delete(EVENTS_STREAM, CONSUMER).catch(() => undefined);
        await bus.jsm.streams.purge(EVENTS_STREAM, { filter: `vtt.${room}.>` });
      }
    });
  });
});
