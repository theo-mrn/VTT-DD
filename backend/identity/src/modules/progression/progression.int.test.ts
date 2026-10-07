/**
 * Progression du compte sur un vrai PostgreSQL (rôle identity_svc) : le
 * consommateur est appelé directement avec des enveloppes ; avec NATS_URL, un
 * test de bout en bout passe par JetStream (durable et événements de test
 * retirés du flux à la fin).
 *   TEST_DATABASE_URL=postgres://identity_svc:identity-dev@localhost:5432/vtt \
 *   NATS_URL=nats://127.0.0.1:4222 pnpm --filter @vtt/identity test
 */
import { uuidv7, type EventEnvelope } from '@vtt/contracts';
import { connectBus, EVENTS_STREAM, publishEvent, type Bus } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accountProgress,
  inbox,
  outbox,
  profiles,
  progressionChallenges,
  progressionCounters,
  progressionDaily,
  progressionKeys,
  userTitles,
  users,
} from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { activeChallenges } from './challenges.js';
import { handleProgressionEvent, startProgressionConsumer } from './consumer.js';
import { LEVEL_REWARDS, xpForLevel } from './levels.js';
import { addDays, isoWeek, parisDay } from './periods.js';
import {
  backfillUserInTx,
  DAILY_KEPT_DAYS,
  purgeProgressionDaily,
  levelOf,
  readProgression,
  recordActivitiesInTx,
  type ProgressionView,
} from './service.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

const NATS_URL = process.env.NATS_URL;
/** Consommateur propre aux tests : l'inbox du vrai identity-progression n'est pas touchée. */
const CONSUMER = `identity-progression-test-${crypto.randomUUID().slice(0, 8)}`;

function envelope(
  type: string,
  userId: string | null,
  payload: Record<string, unknown>,
  o: { roomId?: string | null; role?: EventEnvelope['actor']['role']; occurredAt?: string } = {},
): EventEnvelope {
  return {
    id: uuidv7(),
    type,
    version: 1,
    occurredAt: o.occurredAt ?? new Date().toISOString(),
    roomId: o.roomId === undefined ? crypto.randomUUID() : o.roomId,
    actor: { userId, role: o.role ?? 'player', characterId: null },
    aggregate: { type: 'x', id: uuidv7() },
    visibility: 'public',
    payload,
    correlationId: `test-${uuidv7()}`,
    causationId: null,
    traceparent: null,
  };
}

const roll = (userId: string, roomId: string | null, source = '3d') =>
  envelope('dice.rolled', userId, { authorId: userId, source, dice: [] }, { roomId });

describe.skipIf(!TEST_DATABASE_URL)('progression du compte', () => {
  let t: Contexte;
  const deps = () => ({ db: t.db, consumer: CONSUMER });
  const handle = (e: EventEnvelope) => handleProgressionEvent(deps(), e);

  beforeAll(async () => {
    t = await appDeTest();
  });

  afterAll(async () => {
    await t.db.delete(inbox).where(eq(inbox.consumer, CONSUMER));
    await t.fermer();
  });

  const progress = async (userId: string) =>
    (
      await t.db
        .select({ xp: accountProgress.xp, level: accountProgress.level })
        .from(accountProgress)
        .where(eq(accountProgress.userId, userId))
    )[0] ?? null;

  const counters = async (userId: string) =>
    Object.fromEntries(
      (
        await t.db
          .select({ activity: progressionCounters.activity, total: progressionCounters.total })
          .from(progressionCounters)
          .where(eq(progressionCounters.userId, userId))
      ).map((r) => [r.activity, r.total]),
    );

  const completed = async (userId: string) =>
    (
      await t.db
        .select({ id: progressionChallenges.challengeId, period: progressionChallenges.period })
        .from(progressionChallenges)
        .where(eq(progressionChallenges.userId, userId))
    )
      .map((r) => `${r.id}@${r.period}`)
      .sort();

  const events = async (userId: string, type: string) =>
    (
      await t.db
        .select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          and(
            sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`,
            sql`${outbox.envelope}->>'type' = ${type}`,
          ),
        )
    ).map((r) => r.envelope as EventEnvelope);

  const consumedBy = async (eventId: string) =>
    (
      await t.db.select({ consumer: inbox.consumer }).from(inbox).where(eq(inbox.eventId, eventId))
    ).map((r) => r.consumer);

  /** XP des défis tournants accomplis par une seule unité de ces activités ce jour-là. */
  const rotatingXpForOneUnit = (userId: string, day: string, kinds: string[]) =>
    [...activeChallenges(userId, 'daily', day), ...activeChallenges(userId, 'weekly', isoWeek(day))]
      .filter((c) => c.target <= 1 && c.activities.some((a) => kinds.includes(a)))
      .reduce((s, c) => s + c.xp, 0);

  it('premier jet en campagne : XP du jet et de la séance, Premiers pas, niveau 2, une seule fois', async () => {
    const j = await t.inscrire();
    const room = crypto.randomUUID();
    const e = roll(j.id, room);
    const day = parisDay(new Date(e.occurredAt));

    const r = await handle(e);
    expect(r.duplicate).toBe(false);
    const expected =
      2 + 40 + 25 + 50 + rotatingXpForOneUnit(j.id, day, ['dice_roll', 'session_played']);
    expect(r.users[j.id]).toMatchObject({ xpGained: expected, levelBefore: 1, level: 2 });
    expect(await progress(j.id)).toEqual({ xp: expected, level: 2 });
    expect(await counters(j.id)).toEqual({ dice_roll: 1, session_played: 1 });
    expect(await completed(j.id)).toEqual(
      expect.arrayContaining(['first_roll@permanent', 'first_session@permanent']),
    );

    const [level, ...more] = await events(j.id, 'identity.level_reached');
    expect(more).toHaveLength(0);
    expect(level!.visibility).toBe('owner');
    expect(level!.causationId).toBe(e.id);
    expect(level!.correlationId).toBe(e.correlationId);
    expect(level!.payload).toEqual({ level: 2, previousLevel: 1, xp: expected, rewards: [] });
    const challengeEvents = await events(j.id, 'identity.challenge_completed');
    expect(challengeEvents.map((c) => c.payload.challengeId)).toEqual(
      expect.arrayContaining(['first_roll', 'first_session']),
    );
    expect(challengeEvents.find((c) => c.payload.challengeId === 'first_roll')!.payload).toEqual({
      challengeId: 'first_roll',
      kind: 'permanent',
      period: 'permanent',
      xp: 25,
    });

    // Relivraison : rien n'est refait
    expect(await handle(e)).toEqual({ duplicate: true, users: {} });
    expect(await progress(j.id)).toEqual({ xp: expected, level: 2 });

    // Deuxième jet, même campagne, même jour : pas de deuxième séance
    await handle(roll(j.id, room));
    expect(await counters(j.id)).toEqual({ dice_roll: 2, session_played: 1 });
  });

  it('plafonne l’XP du jour mais compte toutes les unités pour les défis', async () => {
    const j = await t.inscrire();
    for (let i = 0; i < 25; i += 1) await handle(roll(j.id, null, 'free'));
    const [today] = await t.db
      .select({ units: progressionDaily.units, xp: progressionDaily.xp })
      .from(progressionDaily)
      .where(and(eq(progressionDaily.userId, j.id), eq(progressionDaily.activity, 'dice_roll')));
    expect(today).toEqual({ units: 25, xp: 40 });
    expect(await counters(j.id)).toEqual({ dice_roll: 25 });
    // Défi quotidien des dés, s'il est tiré aujourd'hui : accompli à 10 ou 25
    const day = parisDay(new Date());
    const dice = activeChallenges(j.id, 'daily', day).find((c) =>
      c.activities.includes('dice_roll'),
    );
    if (dice) expect(await completed(j.id)).toContain(`${dice.id}@${day}`);
  });

  it('jets import et api, événements hors sujet : rien d’écrit, pas même l’inbox', async () => {
    const j = await t.inscrire();
    const ignored = [
      roll(j.id, null, 'import'),
      roll(j.id, null, 'api'),
      envelope('campaign.updated', j.id, {}),
    ];
    for (const e of ignored) expect(await handle(e)).toEqual({ duplicate: false, users: {} });
    expect(await progress(j.id)).toBeNull();
    const seen = await t.db
      .select()
      .from(inbox)
      .where(and(eq(inbox.consumer, CONSUMER), eq(inbox.eventId, ignored[0]!.id)));
    expect(seen).toEqual([]);
  });

  it('amitié : XP pour les deux, une seule fois par ami même après un retrait', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    const accepted = () =>
      envelope(
        'identity.friend_request_accepted',
        a.id,
        { friendId: b.id },
        { roomId: null, role: 'user' },
      );
    const r = await handle(accepted());
    expect(Object.keys(r.users).sort()).toEqual([a.id, b.id].sort());
    expect(await counters(a.id)).toEqual({ friend_added: 1 });
    expect(await counters(b.id)).toEqual({ friend_added: 1 });
    expect(await completed(a.id)).toContain('first_friend@permanent');

    const again = await handle(accepted());
    expect(again.users[a.id]).toMatchObject({ xpGained: 0 });
    expect(await counters(a.id)).toEqual({ friend_added: 1 });
  });

  it('profil complété : seulement avec un avatar ou une bio en base, une fois', async () => {
    const j = await t.inscrire();
    const updated = () =>
      envelope(
        'identity.profile_updated',
        j.id,
        { fields: ['bio'] },
        { roomId: null, role: 'user' },
      );
    await handle(updated());
    expect(await progress(j.id)).toEqual({ xp: 0, level: 1 });

    await t.db.update(profiles).set({ bio: 'Barde' }).where(eq(profiles.userId, j.id));
    await handle(updated());
    expect(await progress(j.id)).toEqual({ xp: 100, level: 2 });
    expect(await completed(j.id)).toEqual(['first_profile@permanent']);

    await handle(updated());
    expect(await progress(j.id)).toEqual({ xp: 100, level: 2 });
  });

  it('palier : titre débloqué (source level) et récompenses dans l’événement de niveau', async () => {
    const j = await t.inscrire();
    await t.db.insert(accountProgress).values({ userId: j.id, xp: xpForLevel(5) - 1, level: 4 });
    // Une note : 5 XP (et un éventuel défi tournant), assez pour le niveau 5
    await handle(envelope('note.created', j.id, { ownerId: j.id }));
    expect((await progress(j.id))!.level).toBe(5);

    const titles = await t.db
      .select({ slug: userTitles.slug })
      .from(userTitles)
      .where(eq(userTitles.userId, j.id));
    expect(titles.map((x) => x.slug)).toEqual(['aventurier-confirme']);
    const [unlocked] = await events(j.id, 'identity.title_unlocked');
    expect(unlocked!.payload).toEqual({
      slug: 'aventurier-confirme',
      label: 'Aventurier Confirmé',
      source: 'level',
    });
    const [level] = await events(j.id, 'identity.level_reached');
    expect(level!.payload).toMatchObject({
      level: 5,
      previousLevel: 4,
      rewards: [{ level: 5, type: 'title', id: 'aventurier-confirme' }],
    });
  });

  it('consomme sans effet l’événement d’un compte inconnu', async () => {
    const unknown = crypto.randomUUID();
    const e = roll(unknown, null, 'free');
    expect(await handle(e)).toEqual({ duplicate: false, users: {} });
    expect(await handle(e)).toEqual({ duplicate: true, users: {} });
    expect(await progress(unknown)).toBeNull();
  });

  it('GET /v1/users/me/progression : niveau, défis actifs, prochaines étapes', async () => {
    const j = await t.inscrire();
    const anonymous = await t.app.inject({ url: '/v1/users/me/progression' });
    expect(anonymous.statusCode).toBe(401);

    const res = await t.app.inject({ url: '/v1/users/me/progression', headers: j.auth });
    expect(res.statusCode).toBe(200);
    const v = res.json() as ProgressionView;
    expect(v).toMatchObject({ level: 1, xp: 0, levelXp: 0, nextLevelXp: 100, todayXp: 0 });
    expect(v.borders).toEqual([]);
    expect(v.nextReward).toMatchObject({ level: 3, type: 'border', id: 'blue', reached: false });
    expect(v.rewards.find((r) => r.level === 5)).toMatchObject({
      type: 'title',
      label: 'Aventurier Confirmé',
    });
    expect(v.challenges.daily).toHaveLength(3);
    expect(v.challenges.weekly).toHaveLength(2);
    expect(v.steps.map((s) => s.id)).toEqual([
      'first_profile',
      'first_character',
      'first_campaign',
    ]);
    expect(new Date(v.periods.dailyEndsAt).getTime()).toBeGreaterThan(Date.now());

    // Après un personnage : l'étape disparaît, la progression du jour apparaît
    await handle(envelope('character.created', j.id, {}, { roomId: null, role: 'user' }));
    const after = (
      await t.app.inject({ url: '/v1/users/me/progression', headers: j.auth })
    ).json() as ProgressionView;
    expect(after.steps.map((s) => s.id)).toEqual(['first_profile', 'first_campaign', 'first_roll']);
    expect(after.todayXp).toBe(30);
    expect(after.challenges.permanent.find((c) => c.id === 'characters_5')).toMatchObject({
      progress: 1,
      target: 5,
      completed: false,
    });

    const history = await t.app.inject({
      url: '/v1/users/me/progression/history',
      headers: j.auth,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({
      counters: [{ activity: 'character_created', total: 1 }],
      daily: [{ activity: 'character_created', units: 1, xp: 30 }],
      challenges: [{ challengeId: 'first_character', period: 'permanent', xp: 50 }],
    });

    // Le niveau apparaît sur le profil public
    const other = await t.inscrire();
    const pub = await t.app.inject({ url: `/v1/users/${j.id}`, headers: other.auth });
    expect(pub.json().level).toBe(after.level);
  });

  it('niveau d’avant : un compte démarre au niveau de son temps de jeu, sans reprise', async () => {
    const j = await t.inscrire();
    // 1 300 minutes : 10 tranches de 2 h, niveau 11 dans l'ancienne app
    await t.db.update(profiles).set({ timeSpentMinutes: 1300 }).where(eq(profiles.userId, j.id));
    // Avant toute ligne : le profil public montre déjà le niveau d'avant
    expect(await levelOf(t.db, j.id)).toBe(11);

    const view = await readProgression(t.db, j.id);
    expect(view).toMatchObject({ level: 11, xp: xpForLevel(11) });
    expect(view.steps.some((s) => s.id.startsWith('first_'))).toBe(false);
    // Titres des paliers atteints, sans notification de niveau ni défi annoncé
    const slugs = (
      await t.db
        .select({ slug: userTitles.slug })
        .from(userTitles)
        .where(eq(userTitles.userId, j.id))
    ).map((r) => r.slug);
    for (const r of LEVEL_REWARDS.filter((x) => x.type === 'title' && x.level <= 11))
      expect(slugs).toContain(r.id);
    expect(await events(j.id, 'identity.level_reached')).toEqual([]);
    expect(await events(j.id, 'identity.challenge_completed')).toEqual([]);

    // Relu : rien ne change ; une activité ensuite part de là
    expect(await readProgression(t.db, j.id)).toMatchObject({ level: 11, xp: xpForLevel(11) });
    const before = (await progress(j.id))!;
    await t.db.transaction((tx) =>
      recordActivitiesInTx(
        tx,
        { correlationId: `test-${uuidv7()}` },
        j.id,
        [{ userId: j.id, kind: 'character_created', units: 1 }],
        new Date(),
      ),
    );
    const after = (await progress(j.id))!;
    expect(after.xp).toBeGreaterThan(before.xp);
    expect(after.level).toBeGreaterThanOrEqual(11);
  });

  it('nouveau compte sans temps de jeu : niveau 1, Premiers pas proposés', async () => {
    const j = await t.inscrire();
    const view = await readProgression(t.db, j.id);
    expect(view).toMatchObject({ level: 1, xp: 0 });
    expect(view.steps.some((s) => s.id.startsWith('first_'))).toBe(true);
  });

  it('reprise de l’existant : compteurs relevés, permanents accomplis', async () => {
    const j = await t.inscrire();
    const friend = crypto.randomUUID();
    const ctx = { correlationId: `test-${uuidv7()}` };
    const run = () =>
      t.db.transaction((tx) =>
        backfillUserInTx(
          tx,
          ctx,
          j.id,
          { dice_roll: 150, character_created: 2, campaign_joined: 1 },
          [{ activity: 'friend_added', key: friend }],
        ),
      );
    const first = await run();
    expect(first!.completed.map((c) => c.id).sort()).toEqual(
      ['first_campaign', 'first_character', 'first_roll', 'rolls_100'].sort(),
    );
    const xp = 50 + 50 + 25 + 100;
    expect(await progress(j.id)).toMatchObject({ xp });
    expect(await counters(j.id)).toEqual({
      dice_roll: 150,
      character_created: 2,
      campaign_joined: 1,
    });

    // Rejouée : rien de plus ; un compteur déjà plus haut n'est jamais baissé
    await t.db
      .update(progressionCounters)
      .set({ total: 500 })
      .where(
        and(eq(progressionCounters.userId, j.id), eq(progressionCounters.activity, 'dice_roll')),
      );
    const second = await run();
    expect(second).toMatchObject({ completed: [] });
    expect(await progress(j.id)).toMatchObject({ xp });
    expect((await counters(j.id)).dice_roll).toBe(500);

    // La clé de l'ami repris empêche un second gain
    const r = await handle(
      envelope(
        'identity.friend_request_accepted',
        j.id,
        { friendId: friend },
        { roomId: null, role: 'user' },
      ),
    );
    expect(r.users[j.id]).toMatchObject({ xpGained: 0 });
  });

  it('purge le détail par jour au-delà de 90 jours seulement', async () => {
    const j = await t.inscrire();
    const today = parisDay(new Date());
    await t.db.insert(progressionDaily).values([
      {
        userId: j.id,
        day: addDays(today, -(DAILY_KEPT_DAYS + 1)),
        activity: 'dice_roll',
        units: 1,
        xp: 2,
      },
      {
        userId: j.id,
        day: addDays(today, -DAILY_KEPT_DAYS),
        activity: 'dice_roll',
        units: 1,
        xp: 2,
      },
    ]);
    await purgeProgressionDaily(t.db);
    const left = await t.db
      .select({ day: progressionDaily.day })
      .from(progressionDaily)
      .where(eq(progressionDaily.userId, j.id));
    expect(left.map((r) => r.day)).toEqual([addDays(today, -DAILY_KEPT_DAYS)]);
  });

  it('la suppression du compte efface toute sa progression', async () => {
    const j = await t.inscrire();
    await handle(roll(j.id, crypto.randomUUID()));
    expect(await progress(j.id)).not.toBeNull();
    await t.db.delete(users).where(eq(users.id, j.id));
    for (const table of [
      accountProgress,
      progressionDaily,
      progressionCounters,
      progressionKeys,
      progressionChallenges,
    ]) {
      const rows = await t.db.select().from(table).where(eq(table.userId, j.id));
      expect(rows).toEqual([]);
    }
    expect(await readProgression(t.db, j.id)).toMatchObject({ level: 1, xp: 0 });
  });

  describe.skipIf(!NATS_URL)('de bout en bout avec NATS JetStream', () => {
    let bus: Bus;
    beforeAll(async () => {
      bus = await connectBus({ url: NATS_URL!, name: 'test-identity-progression' });
    });
    afterAll(async () => {
      await bus?.close();
    });

    it('un dice.rolled publié sur le bus fait gagner de l’XP', async () => {
      const j = await t.inscrire();
      const room = crypto.randomUUID();
      const stop = await startProgressionConsumer({ bus, db: t.db, durable: CONSUMER });
      try {
        const e = roll(j.id, room);
        await publishEvent(bus, e);
        const limit = Date.now() + 10_000;
        while (!(await consumedBy(e.id)).includes(CONSUMER) && Date.now() < limit) {
          await new Promise((r) => setTimeout(r, 100));
        }
        // Un identity local branché sur la même base consomme aussi l'événement
        // (durable identity-progression) : chaque consommateur compte son jet
        const consumers = (await consumedBy(e.id)).filter(
          (c) => c === CONSUMER || c === 'identity-progression',
        );
        expect(consumers).toContain(CONSUMER);
        expect(await counters(j.id)).toEqual({ dice_roll: consumers.length, session_played: 1 });
      } finally {
        await stop();
        await bus.jsm.consumers.delete(EVENTS_STREAM, CONSUMER).catch(() => undefined);
        await bus.jsm.streams.purge(EVENTS_STREAM, { filter: `vtt.${room}.>` });
      }
    });
  });
});
