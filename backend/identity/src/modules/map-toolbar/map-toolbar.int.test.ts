/**
 * Disposition de la barre d'outils de la carte par HTTP, sur un vrai PostgreSQL : défaut,
 * écriture entière, doublons retirés, idempotence, conflit de version, validation, chacun la
 * sienne, suppression avec le compte.
 */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapToolbarLayouts, outbox, users } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

const URL = '/v1/users/me/map-toolbar';

describe.skipIf(!TEST_DATABASE_URL)('disposition de la barre de la carte', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  const put = (headers: Record<string, string>, payload: unknown) =>
    t.app.inject({ method: 'PUT', url: URL, headers, payload: payload as object });

  it('exige une authentification', async () => {
    expect((await t.app.inject({ url: URL })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'PUT', url: URL, payload: {} })).statusCode).toBe(401);
  });

  it('défaut, écriture, doublons, idempotence, conflit', async () => {
    const moi = await t.inscrire();
    const d = await t.app.inject({ url: URL, headers: moi.auth });
    expect(d.json()).toEqual({ order: [], hidden: [], version: 0 });

    const v1 = await put(moi.auth, {
      order: ['camera.fit', 'snap', 'camera.fit'],
      hidden: ['presence.cursor', 'presence.cursor'],
      version: 0,
    });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toEqual({
      order: ['camera.fit', 'snap'],
      hidden: ['presence.cursor'],
      version: 1,
    });

    // Même disposition : rien n'est réécrit
    const same = await put(moi.auth, {
      order: ['camera.fit', 'snap'],
      hidden: ['presence.cursor'],
    });
    expect(same.json().version).toBe(1);

    // Version lue périmée : refus, avec la disposition actuelle
    const conflict = await put(moi.auth, { order: [], hidden: [], version: 0 });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      code: 'version_conflict',
      current: { order: ['camera.fit', 'snap'], version: 1 },
    });

    // Sans version : la dernière écriture l'emporte (« Rétablir »)
    const reset = await put(moi.auth, { order: [], hidden: [] });
    expect(reset.json()).toEqual({ order: [], hidden: [], version: 2 });

    // Une écriture, un événement pour ses autres appareils
    const events = await t.db
      .select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        and(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${moi.id}`,
          sql`${outbox.envelope}->>'type' = 'identity.map_toolbar_updated'`,
        ),
      );
    expect(
      events.map((e) => (e.envelope as { payload: { version: number } }).payload.version),
    ).toEqual(expect.arrayContaining([1, 2]));
    expect(events).toHaveLength(2);
    expect(events[0]!.envelope).toMatchObject({ visibility: 'owner' });
  });

  it('refuse un identifiant invalide ou une liste trop longue', async () => {
    const moi = await t.inscrire();
    for (const payload of [
      { order: ['<script>'], hidden: [] },
      { order: [], hidden: [''] },
      { order: Array.from({ length: 101 }, (_, i) => `e${i}`), hidden: [] },
      { order: [] },
    ])
      expect((await put(moi.auth, payload)).statusCode, JSON.stringify(payload)).toBe(400);
  });

  it('chacun la sienne ; supprimée avec le compte', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    await put(a.auth, { order: ['snap'], hidden: [] });
    expect((await t.app.inject({ url: URL, headers: b.auth })).json().version).toBe(0);

    await t.db.delete(users).where(eq(users.id, a.id));
    const rows = await t.db
      .select()
      .from(mapToolbarLayouts)
      .where(eq(mapToolbarLayouts.userId, a.id));
    expect(rows).toEqual([]);
  });
});
