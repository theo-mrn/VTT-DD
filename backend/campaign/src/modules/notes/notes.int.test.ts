/**
 * Notes de campagne : droits repris de l'ancienne app (privées, partagées avec
 * tous ou avec des personnages), spectateurs en lecture, et événements de
 * l'outbox (visibilité, jamais de texte).
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

interface Note {
  id: string;
  owner: { id: string; name: string | null };
  characterId: string | null;
  shared: boolean;
  sharedWith: 'all' | string[] | null;
  title: string;
  content: string;
  type: string;
  tags: { id: string; label: string }[];
  questStatus: string | null;
  subQuests: { id: string; title: string; description: string; status: string }[];
  version: number;
}

interface Event {
  type: string;
  visibility: string;
  actor: { userId: string; characterId: string | null };
  payload: Record<string, unknown>;
}

const SECRET = 'Le trésor est sous le vieux chêne';

describe.skipIf(!TEST_DATABASE_URL)('notes de la campagne', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let campaignId: string;
  let aliceHero: string;
  let bobHero: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
    bob = await t.user('Bob');
    carol = await t.user('Carol');
    campaignId = await h.campaign(gm, 'dnd-classic', [alice, bob, carol]);
    aliceHero = await h.engage(campaignId, alice, { name: 'Aria' });
    bobHero = await h.engage(campaignId, bob, { name: 'Brom' });
    await h.ok(alice, 'PUT', `/v1/campaigns/${campaignId}/me/character`, {
      characterId: aliceHero,
    });
    await h.ok(bob, 'PUT', `/v1/campaigns/${campaignId}/me/character`, { characterId: bobHero });
  });

  afterEach(async () => {
    await t.close();
  });

  const url = (path = '') => `/v1/campaigns/${campaignId}/notes${path}`;
  const list = (u: TestUser) => h.ok<Note[]>(u, 'GET', url());
  const create = (u: TestUser, body: Record<string, unknown>) => h.ok<Note>(u, 'POST', url(), body);

  async function events(noteId: string): Promise<Event[]> {
    const rows = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${campaignId} and ${outbox.envelope}->'aggregate'->>'id' = ${noteId}`,
      )
      .orderBy(outbox.id);
    return rows.map((r) => r.envelope as Event);
  }

  it('une note privée : son auteur seul la lit, ni les autres joueurs ni le MJ', async () => {
    const note = await create(alice, {
      title: 'Journal intime',
      content: `<p>${SECRET}</p>`,
      type: 'journal',
      tags: [{ id: 'secret', label: 'Secret' }],
    });
    expect(note).toMatchObject({
      owner: { id: alice.id, name: 'Alice' },
      characterId: aliceHero,
      shared: false,
      sharedWith: null,
      type: 'journal',
      version: 1,
    });

    expect((await list(alice)).map((n) => n.id)).toEqual([note.id]);
    for (const other of [gm, bob, carol]) {
      expect(await list(other)).toEqual([]);
      for (const [method, payload] of [
        ['GET', undefined],
        ['PATCH', { title: 'Lu !' }],
        ['DELETE', undefined],
      ] as const) {
        const res = await h.request(other, method, url(`/${note.id}`), payload);
        expect(res.statusCode, `${method} ${res.body}`).toBe(404);
        expect(res.json()).toMatchObject({ code: 'note_not_found' });
      }
    }

    const [created] = await events(note.id);
    expect(created).toMatchObject({
      type: 'note.created',
      visibility: 'owner',
      actor: { userId: alice.id, characterId: aliceHero },
      payload: { id: note.id, ownerId: alice.id, shared: false, sharedWith: null },
    });
    // Ni texte ni titre d'une note privée dans le journal
    expect(JSON.stringify(created)).not.toContain('trésor');
    expect(created!.payload).not.toHaveProperty('title');
  });

  it('le MJ garde ses notes privées (sans personnage) et lit les notes partagées avec tous', async () => {
    const mine = await create(gm, { title: 'Scénario', content: 'Le traître est Brom' });
    expect(mine).toMatchObject({ characterId: null, shared: false });
    const shared = await create(alice, { title: 'Carte du donjon', shared: true });
    expect(shared).toMatchObject({ shared: true, sharedWith: 'all' });

    expect((await list(gm)).map((n) => n.id).sort()).toEqual([mine.id, shared.id].sort());
    expect((await list(bob)).map((n) => n.id)).toEqual([shared.id]);
  });

  it('partagée avec tous : chacun la modifie ou la supprime, seul l’auteur la rend privée', async () => {
    const note = await create(alice, {
      title: 'Rumeurs',
      content: '<p>Un dragon</p>',
      shared: true,
    });

    const edited = await h.ok<Note>(bob, 'PATCH', url(`/${note.id}`), {
      content: `<p>${SECRET}</p>`,
      version: 1,
    });
    expect(edited).toMatchObject({ content: `<p>${SECRET}</p>`, version: 2 });
    // Verrou optimiste : version périmée
    const stale = await h.request(gm, 'PATCH', url(`/${note.id}`), { title: 'X', version: 1 });
    expect(stale.statusCode).toBe(409);

    const refused = await h.request(bob, 'PATCH', url(`/${note.id}`), { shared: false });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: 'not_note_owner' });

    const privateAgain = await h.ok<Note>(alice, 'PATCH', url(`/${note.id}`), { shared: false });
    expect(privateAgain).toMatchObject({ shared: false, sharedWith: null });
    expect(await list(bob)).toEqual([]);

    const [created, updated, madePrivate] = await events(note.id);
    expect(created).toMatchObject({
      type: 'note.created',
      visibility: 'public',
      payload: { title: 'Rumeurs', shared: true, sharedWith: 'all' },
    });
    expect(updated).toMatchObject({
      type: 'note.updated',
      visibility: 'public',
      actor: { userId: bob.id },
      payload: { title: 'Rumeurs', changed: ['content'] },
    });
    // Ceux qui perdent l'accès l'apprennent (public), sans le titre de la note devenue privée
    expect(madePrivate).toMatchObject({
      type: 'note.updated',
      visibility: 'public',
      payload: { shared: false, sharedWith: null, changed: ['shared'] },
    });
    expect(madePrivate!.payload).not.toHaveProperty('title');
    for (const e of [created, updated, madePrivate]) {
      expect(JSON.stringify(e)).not.toContain('dragon');
      expect(JSON.stringify(e)).not.toContain('trésor');
    }
  });

  it('partagée avec des personnages : leurs joueurs la lisent, ni les autres ni le MJ', async () => {
    const note = await create(alice, {
      title: 'Pour Brom seulement',
      content: SECRET,
      shared: true,
      sharedWith: [bobHero],
    });
    expect(note.sharedWith).toEqual([bobHero]);
    expect((await list(bob)).map((n) => n.id)).toEqual([note.id]);
    expect((await list(alice)).map((n) => n.id)).toEqual([note.id]);
    expect(await list(carol)).toEqual([]);
    expect(await list(gm)).toEqual([]);
    expect((await h.request(gm, 'GET', url(`/${note.id}`))).statusCode).toBe(404);

    const [created] = await events(note.id);
    expect(created).toMatchObject({ type: 'note.created', visibility: 'gm_only' });
    expect((created!.payload.visibleToUsers as string[]).sort()).toEqual([alice.id, bob.id].sort());
    expect(created!.payload).not.toHaveProperty('title');
    expect(JSON.stringify(created)).not.toContain('trésor');

    // Destinataire modifiable par un lecteur (ancienne app) ; l'ancien destinataire est prévenu
    const toAll = await h.ok<Note>(bob, 'PATCH', url(`/${note.id}`), { sharedWith: 'all' });
    expect(toAll.sharedWith).toBe('all');
    expect((await list(carol)).map((n) => n.id)).toEqual([note.id]);

    const bad = await h.request(alice, 'POST', url(), {
      title: 'X',
      shared: true,
      sharedWith: [crypto.randomUUID()],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: 'invalid_share_target' });
    const notShared = await h.request(alice, 'POST', url(), { sharedWith: [bobHero] });
    expect(notShared.json()).toMatchObject({ code: 'share_requires_shared' });
  });

  it('partager une note privée, puis la supprimer par un autre lecteur', async () => {
    const note = await create(alice, {
      title: 'Quête',
      type: 'quest',
      questType: 'main',
      questStatus: 'not_started',
      subQuests: [{ id: '1', title: 'Trouver la clé', description: '', status: 'in_progress' }],
    });
    const shared = await h.ok<Note>(alice, 'PATCH', url(`/${note.id}`), { shared: true });
    expect(shared).toMatchObject({ shared: true, sharedWith: 'all', subQuests: [{ id: '1' }] });

    const res = await h.request(bob, 'DELETE', url(`/${note.id}`));
    expect(res.statusCode).toBe(204);
    expect(await list(alice)).toEqual([]);

    const [, madeShared, deleted] = await events(note.id);
    expect(madeShared).toMatchObject({
      visibility: 'public',
      payload: { title: 'Quête', changed: ['shared'] },
    });
    expect(deleted).toMatchObject({
      type: 'note.deleted',
      visibility: 'public',
      actor: { userId: bob.id },
      payload: { id: note.id, ownerId: alice.id },
    });
    expect(JSON.stringify(madeShared)).not.toContain('Trouver la clé');
  });

  it('un spectateur lit les notes partagées avec tous sans rien écrire', async () => {
    const note = await create(alice, { title: 'Annonce', shared: true });
    await h.ok(gm, 'PATCH', `/v1/campaigns/${campaignId}/members/${carol.id}`, {
      role: 'spectator',
    });
    expect((await list(carol)).map((n) => n.id)).toEqual([note.id]);
    for (const [method, path, payload] of [
      ['POST', '', { title: 'X' }],
      ['PATCH', `/${note.id}`, { title: 'X' }],
      ['DELETE', `/${note.id}`, undefined],
      ['POST', '/upload', { contentType: 'image/png', size: 10 }],
    ] as const) {
      const res = await h.request(carol, method, url(path), payload);
      expect(res.statusCode, `${method} ${path}`).toBe(403);
    }
  });

  it('URL d’envoi d’une image de note pour les membres ; non-membre : 404', async () => {
    const res = await h.ok<{ uploadUrl: string; publicUrl: string }>(bob, 'POST', url('/upload'), {
      contentType: 'image/webp',
      size: 1024,
    });
    expect(res.publicUrl).toMatch(
      new RegExp(`^https://cdn\\.test\\.local/vtt/campaigns/${campaignId}/[0-9a-f-]+\\.webp$`),
    );
    expect(t.uploads.at(-1)).toMatchObject({ contentType: 'image/webp', size: 1024 });
    const withImage = await create(bob, { title: 'Portrait', imageUrl: res.publicUrl });
    expect(withImage).toMatchObject({ imageUrl: res.publicUrl });

    const stranger = await t.user();
    expect((await h.request(stranger, 'GET', url())).statusCode).toBe(404);
    expect(
      (await h.request(stranger, 'POST', url('/upload'), { contentType: 'image/png', size: 1 }))
        .statusCode,
    ).toBe(404);
  });

  it('validation : type, étapes, champs inconnus', async () => {
    for (const body of [
      { type: 'secret' },
      { questStatus: 'not-started' },
      { subQuests: [{ id: '1', title: 'X', description: '', status: 'done' }] },
      { imageUrl: 'javascript:alert(1)' },
      { imageUrl: 'http://tiers.example/pistage.png' },
      { createdBy: 'x' },
    ]) {
      const res = await h.request(alice, 'POST', url(), body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
  });
});
