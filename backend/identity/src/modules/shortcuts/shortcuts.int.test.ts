/**
 * Raccourcis de l'utilisateur par HTTP, sur un vrai PostgreSQL : défaut, écriture entière,
 * idempotence (ordre des clés compris), conflit de version, validation, événement sans texte
 * libre, chacun les siens, suppression avec le compte.
 */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox, shortcutPreferences, users } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

const URL = '/v1/users/me/shortcuts';

describe.skipIf(!TEST_DATABASE_URL)('raccourcis de l’utilisateur', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  const put = (headers: Record<string, string>, payload: unknown) =>
    t.app.inject({ method: 'PUT', url: URL, headers, payload: payload as object });

  const attaque = {
    id: 'a1',
    kind: 'roll',
    label: 'Attaque',
    formula: '1d20 + mod(@FOR)',
    binding: 'Shift+KeyF',
  };

  it('exige une authentification', async () => {
    expect((await t.app.inject({ url: URL })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'PUT', url: URL, payload: {} })).statusCode).toBe(401);
  });

  it('défaut, écriture, idempotence, conflit, événement', async () => {
    const moi = await t.inscrire();
    expect((await t.app.inject({ url: URL, headers: moi.auth })).json()).toEqual({
      bindings: {},
      custom: [],
      version: 0,
    });

    const v1 = await put(moi.auth, {
      bindings: { 'table.panel.chat': 'Shift+KeyC', 'map.tool.draw': null },
      custom: [attaque],
      version: 0,
    });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, custom: [attaque] });

    // Mêmes préférences, clés dans un autre ordre : rien n'est réécrit
    const same = await put(moi.auth, {
      bindings: { 'map.tool.draw': null, 'table.panel.chat': 'Shift+KeyC' },
      custom: [attaque],
    });
    expect(same.json().version).toBe(1);

    const conflict = await put(moi.auth, { bindings: {}, custom: [], version: 0 });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'version_conflict', current: { version: 1 } });

    const reset = await put(moi.auth, { bindings: {}, custom: [] });
    expect(reset.json()).toEqual({ bindings: {}, custom: [], version: 2 });

    const events = await t.db
      .select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        and(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${moi.id}`,
          sql`${outbox.envelope}->>'type' = 'identity.shortcuts_updated'`,
        ),
      );
    expect(events).toHaveLength(2);
    // La version seulement : le nom et la formule d'un raccourci n'entrent pas dans le journal
    expect(events.map((e) => (e.envelope as { payload: unknown }).payload)).toEqual(
      expect.arrayContaining([{ version: 1 }, { version: 2 }]),
    );
    expect(events[0]!.envelope).toMatchObject({ visibility: 'owner' });
  });

  it('refuse un id, une touche ou un raccourci créé invalides', async () => {
    const moi = await t.inscrire();
    for (const payload of [
      { bindings: { '<x>': 'KeyA' }, custom: [] },
      { bindings: { a: 'x'.repeat(65) }, custom: [] },
      { bindings: {}, custom: [{ ...attaque, label: '' }] },
      { bindings: {}, custom: [{ ...attaque, kind: 'macro' }] },
      { bindings: {}, custom: Array.from({ length: 51 }, (_, i) => ({ ...attaque, id: `c${i}` })) },
      { bindings: {} },
    ])
      expect((await put(moi.auth, payload)).statusCode, JSON.stringify(payload).slice(0, 80)).toBe(
        400,
      );
  });

  it('chacun les siens ; supprimés avec le compte', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    await put(a.auth, { bindings: { 'general.search': null }, custom: [] });
    expect((await t.app.inject({ url: URL, headers: b.auth })).json().version).toBe(0);
    await t.db.delete(users).where(eq(users.id, a.id));
    const rows = await t.db
      .select()
      .from(shortcutPreferences)
      .where(eq(shortcutPreferences.userId, a.id));
    expect(rows).toEqual([]);
  });
});
