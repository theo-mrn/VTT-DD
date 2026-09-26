/**
 * Discussion de la campagne : envoi par les membres, lecture paginée et en
 * polling, suppression par l'auteur ou le MJ, limite de débit.
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

interface Message {
  id: string;
  author: { id: string; name: string | null; avatarUrl: string | null };
  body: string;
  createdAt: string;
}

describe.skipIf(!TEST_DATABASE_URL)('messages de la campagne', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp({ RATE_LIMIT_MESSAGES_MAX: '5' });
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
    bob = await t.user('Bob');
  });

  afterEach(async () => {
    await t.close();
  });

  const post = (u: TestUser, campaignId: string, body: string) =>
    h.request(u, 'POST', `/v1/campaigns/${campaignId}/messages`, { body });

  it('les membres écrivent et lisent, avec l’auteur ; événement campaign.message_posted', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const res = await post(alice, id, '  Bonjour la table  ');
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      body: 'Bonjour la table',
      author: { id: alice.id, name: 'Alice', avatarUrl: null },
      createdAt: expect.any(String),
    });
    await post(gm, id, 'Bienvenue');

    const list = await h.ok<Message[]>(alice, 'GET', `/v1/campaigns/${id}/messages`);
    expect(list.map((m) => [m.author.name, m.body])).toEqual([
      ['Alice', 'Bonjour la table'],
      ['Maître', 'Bienvenue'],
    ]);

    const [event] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${id} and ${outbox.envelope}->>'type' = 'campaign.message_posted'`,
      )
      .orderBy(outbox.id)
      .limit(1);
    expect(event!.envelope).toMatchObject({
      payload: { id: list[0]!.id, authorId: alice.id, body: 'Bonjour la table' },
    });
  });

  it('pages : derniers messages, page précédente (before), nouveaux messages (after)', async () => {
    const id = await h.campaign(gm);
    const url = `/v1/campaigns/${id}/messages`;
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      // Débit limité à 5 par minute dans ce test : pile la limite
      ids.push((await h.ok<Message>(gm, 'POST', url, { body: `m${i}` })).id);
    }
    const bodies = (l: Message[]) => l.map((m) => m.body);
    expect(bodies(await h.ok<Message[]>(gm, 'GET', `${url}?limit=2`))).toEqual(['m4', 'm5']);
    expect(bodies(await h.ok<Message[]>(gm, 'GET', `${url}?limit=2&before=${ids[3]}`))).toEqual([
      'm2',
      'm3',
    ]);
    expect(bodies(await h.ok<Message[]>(gm, 'GET', `${url}?after=${ids[2]}`))).toEqual([
      'm4',
      'm5',
    ]);
    expect(await h.ok<Message[]>(gm, 'GET', `${url}?after=${ids[4]}`)).toEqual([]);
    for (const q of ['limit=0', 'limit=101', `before=${ids[1]}&after=${ids[0]}`, 'before=x']) {
      expect((await h.request(gm, 'GET', `${url}?${q}`)).statusCode, q).toBe(400);
    }
  });

  it('refus : non-membre, message vide ou trop long, débit dépassé', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    expect((await post(bob, id, 'Coucou')).statusCode).toBe(404);
    expect((await h.request(bob, 'GET', `/v1/campaigns/${id}/messages`)).statusCode).toBe(404);
    expect((await post(alice, id, '   ')).statusCode).toBe(400);
    expect((await post(alice, id, 'x'.repeat(1001))).statusCode).toBe(400);
    expect((await post(alice, id, 'x'.repeat(1000))).statusCode).toBe(201);

    for (let i = 0; i < 4; i++) expect((await post(alice, id, `m${i}`)).statusCode).toBe(201);
    const tooMany = await post(alice, id, 'encore');
    expect(tooMany.json()).toMatchObject({ status: 429, code: 'too_many_messages' });
    expect(tooMany.headers['retry-after']).toBe('60');
    // La limite est propre à chaque membre
    expect((await post(gm, id, 'Doucement')).statusCode).toBe(201);
  });

  it('suppression : l’auteur ou le MJ, jamais un autre joueur', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const m1 = (await post(alice, id, 'un')).json() as Message;
    const m2 = (await post(alice, id, 'deux')).json() as Message;
    const remove = (u: TestUser, m: string) =>
      h.request(u, 'DELETE', `/v1/campaigns/${id}/messages/${m}`);

    expect((await remove(bob, m1.id)).statusCode).toBe(403);
    expect((await remove(alice, m1.id)).statusCode).toBe(204);
    expect((await remove(alice, m1.id)).statusCode).toBe(404);
    expect((await remove(gm, m2.id)).statusCode).toBe(204);
    expect(await h.ok(bob, 'GET', `/v1/campaigns/${id}/messages`)).toEqual([]);
    // Un message d'une autre campagne est introuvable ici
    const other = await h.campaign(bob);
    const elsewhere = (await post(bob, other, 'ailleurs')).json() as Message;
    expect((await remove(gm, elsewhere.id)).statusCode).toBe(404);
  });
});
