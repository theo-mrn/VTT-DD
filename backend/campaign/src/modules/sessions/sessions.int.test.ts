/**
 * Sessions prévues : le MJ les planifie et les annule, les membres les lisent,
 * les sessions passées disparaissent de la liste.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Session {
  id: string;
  date: string;
  title: string | null;
}

const DAY = 24 * 3600 * 1000;
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

describe.skipIf(!TEST_DATABASE_URL)('sessions prévues', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let player: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    player = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  it('le MJ planifie, les membres lisent dans l’ordre, le MJ annule', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [player]);
    const url = `/v1/campaigns/${id}/sessions`;
    const second = await h.request(gm, 'POST', url, {
      date: inMs(2 * DAY),
      title: '  Le donjon  ',
    });
    expect(second.statusCode, second.body).toBe(201);
    expect(second.json()).toMatchObject({ title: 'Le donjon' });
    const first = await h.ok<Session>(gm, 'POST', url, { date: inMs(DAY), title: '' });
    expect(first.title).toBeNull();

    const list = await h.ok<Session[]>(player, 'GET', url);
    expect(list.map((s) => s.id)).toEqual([first.id, (second.json() as Session).id]);

    expect((await h.request(player, 'DELETE', `${url}/${first.id}`)).statusCode).toBe(403);
    expect((await h.request(gm, 'DELETE', `${url}/${first.id}`)).statusCode).toBe(204);
    expect((await h.request(gm, 'DELETE', `${url}/${first.id}`)).statusCode).toBe(404);
    expect(await h.ok<Session[]>(player, 'GET', url)).toHaveLength(1);

    const types = (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${id}`)
    ).map((e) => e.type);
    expect(types.filter((x) => x.startsWith('campaign.session_')).sort()).toEqual([
      'campaign.session_cancelled',
      'campaign.session_scheduled',
      'campaign.session_scheduled',
    ]);
  });

  it('refus : joueur, non-membre, date passée ou invalide, titre trop long', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [player]);
    const url = `/v1/campaigns/${id}/sessions`;
    expect((await h.request(player, 'POST', url, { date: inMs(DAY) })).statusCode).toBe(403);
    const stranger = await t.user();
    expect((await h.request(stranger, 'GET', url)).statusCode).toBe(404);
    expect((await h.request(gm, 'POST', url, { date: inMs(-60_000) })).json()).toMatchObject({
      status: 400,
      code: 'date_in_past',
    });
    for (const body of [{ date: 'demain' }, { date: inMs(DAY), title: 'x'.repeat(101) }, {}]) {
      expect((await h.request(gm, 'POST', url, body)).statusCode).toBe(400);
    }
    expect((await h.request(gm, 'DELETE', `${url}/pas-un-uuid`)).statusCode).toBe(400);
  });

  it('une session passée n’est plus listée', async () => {
    const id = await h.campaign(gm);
    const url = `/v1/campaigns/${id}/sessions`;
    await h.ok(gm, 'POST', url, { date: inMs(3600_000) });
    await h.ok(gm, 'POST', url, { date: inMs(3 * 3600_000) });
    t.advance(2 * 3600_000);
    expect(await h.ok<Session[]>(gm, 'GET', url)).toHaveLength(1);
  });
});
