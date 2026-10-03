/**
 * Discussion de la campagne : envoi par les membres, lecture paginée et en
 * rattrapage, chuchotements, modification par l'auteur, suppression par
 * l'auteur ou le MJ, limite de débit, événements sans le texte.
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

interface UserRef {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

interface Message {
  id: string;
  author: UserRef;
  body: string;
  recipients: { gm: boolean; users: UserRef[] } | null;
  createdAt: string;
  editedAt: string | null;
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

  const post = (
    u: TestUser,
    campaignId: string,
    body: string,
    recipients?: { gm?: boolean; userIds?: string[] },
  ) =>
    h.request(u, 'POST', `/v1/campaigns/${campaignId}/messages`, {
      body,
      ...(recipients ? { recipients } : {}),
    });

  /** Événements de l'outbox d'une campagne, dans l'ordre. */
  const events = async (campaignId: string, type: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          sql`${outbox.envelope}->>'roomId' = ${campaignId} and ${outbox.envelope}->>'type' = ${type}`,
        )
        .orderBy(outbox.id)
    ).map((e) => e.envelope as { visibility: string; payload: Record<string, unknown> });

  const bodies = (l: Message[]) => l.map((m) => m.body);

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

    expect(list[0]).toMatchObject({ recipients: null, editedAt: null });

    // Le texte n'entre jamais dans le bus (ni donc dans le journal history)
    const [event] = await events(id, 'campaign.message_posted');
    expect(event).toMatchObject({
      visibility: 'public',
      payload: { id: list[0]!.id, authorId: alice.id, recipients: null },
    });
    expect(event!.payload).not.toHaveProperty('body');
  });

  it('pages : derniers messages, page précédente (before), nouveaux messages (after)', async () => {
    const id = await h.campaign(gm);
    const url = `/v1/campaigns/${id}/messages`;
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      // Débit limité à 5 par minute dans ce test : pile la limite
      ids.push((await h.ok<Message>(gm, 'POST', url, { body: `m${i}` })).id);
    }
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
    // Attente jusqu'à la sortie du plus ancien message de la fenêtre d'une minute
    const wait = Number(tooMany.headers['retry-after']);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);
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

  it('chuchotements : lus par l’auteur, les destinataires et les MJ adressés, personne d’autre', async () => {
    const carol = await t.user('Carol');
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob, carol]);
    const url = `/v1/campaigns/${id}/messages`;
    await post(alice, id, 'À tous');
    const toBob = await post(alice, id, 'Psst, Bob', { userIds: [bob.id] });
    expect(toBob.statusCode, toBob.body).toBe(201);
    expect(toBob.json()).toMatchObject({
      recipients: { gm: false, users: [{ id: bob.id, name: 'Bob', avatarUrl: null }] },
    });
    const toGm = (await post(bob, id, 'Au MJ seulement', { gm: true })).json() as Message;
    expect(toGm.recipients).toEqual({ gm: true, users: [] });
    await post(gm, id, 'Le MJ à Alice et Bob', { userIds: [alice.id, bob.id, alice.id] });

    const read = async (u: TestUser) => bodies(await h.ok<Message[]>(u, 'GET', url));
    expect(await read(alice)).toEqual(['À tous', 'Psst, Bob', 'Le MJ à Alice et Bob']);
    expect(await read(bob)).toEqual([
      'À tous',
      'Psst, Bob',
      'Au MJ seulement',
      'Le MJ à Alice et Bob',
    ]);
    // Le MJ ne lit pas un chuchotement entre joueurs, comme dans l'ancienne app
    expect(await read(gm)).toEqual(['À tous', 'Au MJ seulement', 'Le MJ à Alice et Bob']);
    expect(await read(carol)).toEqual(['À tous']);
    // Rattrapage et message seul : même règle
    const first = (await h.ok<Message[]>(carol, 'GET', url))[0]!;
    expect(await h.ok<Message[]>(carol, 'GET', `${url}?after=${first.id}`)).toEqual([]);
    const whisperId = (toBob.json() as Message).id;
    expect((await h.request(bob, 'GET', `${url}/${whisperId}`)).statusCode).toBe(200);
    expect((await h.request(gm, 'GET', `${url}/${whisperId}`)).statusCode).toBe(404);
    expect((await h.request(carol, 'GET', `${url}/${whisperId}`)).statusCode).toBe(404);

    // « Aux MJ » : ceux du moment de la lecture
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${carol.id}`, { role: 'gm' });
    expect(await read(carol)).toContain('Au MJ seulement');

    // Un chuchotement part en gm_only vers l'auteur et ses destinataires, sans le texte
    const posted = await events(id, 'campaign.message_posted');
    expect(posted.map((e) => e.visibility)).toEqual(['public', 'gm_only', 'gm_only', 'gm_only']);
    expect(posted[1]!.payload).toEqual({
      id: whisperId,
      authorId: alice.id,
      recipients: { gm: false, userIds: [bob.id] },
      visibleToUsers: [alice.id, bob.id],
    });
    expect(posted[2]!.payload).toMatchObject({
      recipients: { gm: true, userIds: [] },
      visibleToUsers: [bob.id],
    });
    expect(posted[3]!.payload).toMatchObject({
      recipients: { gm: false, userIds: [alice.id, bob.id] },
    });
  });

  it('chuchotements refusés : sans destinataire, hors campagne, à soi-même, trop nombreux', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const outsider = await t.user('Dehors');
    const res = await post(alice, id, 'x', {});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'recipients_required' });
    for (const userIds of [[outsider.id], [alice.id], [gm.id, outsider.id]]) {
      const r = await post(alice, id, 'x', { userIds });
      expect(r.statusCode, r.body).toBe(422);
      expect(r.json()).toMatchObject({ code: 'invalid_recipient' });
    }
    expect((await post(alice, id, 'x', { userIds: ['pas-un-uuid'] })).statusCode).toBe(400);
    const many = Array.from({ length: 51 }, () => crypto.randomUUID());
    expect((await post(alice, id, 'x', { userIds: many })).statusCode).toBe(400);
    // Rien n'a été écrit
    expect(await h.ok<Message[]>(gm, 'GET', `/v1/campaigns/${id}/messages`)).toEqual([]);
  });

  it('modification : l’auteur seul, date de modification, événement sans le texte', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const url = `/v1/campaigns/${id}/messages`;
    const m = (await post(alice, id, 'Bonjuor')).json() as Message;
    const edit = (u: TestUser, messageId: string, body: string) =>
      h.request(u, 'PATCH', `${url}/${messageId}`, { body });

    const res = await edit(alice, m.id, '  Bonjour  ');
    expect(res.statusCode, res.body).toBe(200);
    const edited = res.json() as Message;
    expect(edited).toMatchObject({ id: m.id, body: 'Bonjour', createdAt: m.createdAt });
    expect(edited.editedAt).toEqual(expect.any(String));
    expect(await h.ok<Message>(bob, 'GET', `${url}/${m.id}`)).toEqual(edited);

    // Même texte : rien ne change
    expect((await edit(alice, m.id, 'Bonjour')).json()).toEqual(edited);
    const updated = await events(id, 'campaign.message_updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      visibility: 'public',
      payload: { id: m.id, authorId: alice.id, recipients: null, editedAt: edited.editedAt },
    });
    expect(updated[0]!.payload).not.toHaveProperty('body');

    // Ni un autre joueur ni le MJ ne réécrivent le message d'un autre
    for (const u of [bob, gm]) {
      const r = await edit(u, m.id, 'Réécrit');
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ code: 'not_author' });
    }
    expect((await edit(alice, m.id, '   ')).statusCode).toBe(400);
    expect((await edit(alice, m.id, 'x'.repeat(1001))).statusCode).toBe(400);
    // Un chuchotement qu'on ne lit pas est introuvable
    const secret = (await post(alice, id, 'Secret', { userIds: [gm.id] })).json() as Message;
    expect((await edit(bob, secret.id, 'Vu')).statusCode).toBe(404);
  });

  it('suppression d’un chuchotement : introuvable pour qui ne le lit pas, gm_only', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const url = `/v1/campaigns/${id}/messages`;
    const between = (await post(alice, id, 'Entre nous', { userIds: [bob.id] })).json() as Message;
    const toGm = (await post(bob, id, 'Au MJ', { gm: true })).json() as Message;

    // Le MJ ne lit pas le premier : il ne peut pas le supprimer
    expect((await h.request(gm, 'DELETE', `${url}/${between.id}`)).statusCode).toBe(404);
    // Le destinataire le lit mais n'en est pas l'auteur
    expect((await h.request(bob, 'DELETE', `${url}/${between.id}`)).statusCode).toBe(403);
    expect((await h.request(alice, 'DELETE', `${url}/${between.id}`)).statusCode).toBe(204);
    expect((await h.request(gm, 'DELETE', `${url}/${toGm.id}`)).statusCode).toBe(204);

    const deleted = await events(id, 'campaign.message_deleted');
    expect(deleted).toEqual([
      expect.objectContaining({
        visibility: 'gm_only',
        payload: {
          id: between.id,
          authorId: alice.id,
          recipients: { gm: false, userIds: [bob.id] },
          visibleToUsers: [alice.id, bob.id],
        },
      }),
      expect.objectContaining({
        visibility: 'gm_only',
        payload: expect.objectContaining({ id: toGm.id, visibleToUsers: [bob.id] }),
      }),
    ]);
  });
});
