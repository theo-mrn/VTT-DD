/**
 * Notes : droits repris de l'ancienne app (privées, partagées avec tous ou avec
 * des personnages), notes personnelles, partage avec les MJ, épingles par
 * lecteur, spectateurs en lecture, assainissement, recherche, pagination,
 * conflits de version et événements de l'outbox (visibilité, jamais de texte).
 */
import { inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { notes, outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import { resanitizeNotes } from './backfill.js';

interface Note {
  id: string;
  campaignId: string | null;
  owner: { id: string; name: string | null };
  characterId: string | null;
  shared: boolean;
  sharedWith: 'all' | string[] | null;
  sharedWithGm: boolean;
  title: string;
  icon: string | null;
  content: string;
  type: string;
  tags: { id: string; label: string }[];
  questStatus: string | null;
  subQuests: { id: string; title: string; description: string; status: string }[];
  pinned: boolean;
  permissions: { edit: boolean; delete: boolean; share: boolean; move: boolean };
  version: number;
}

interface Summary extends Omit<Note, 'content' | 'subQuests' | 'questStatus'> {
  excerpt: string;
}

interface Page {
  items: Summary[];
  nextCursor: string | null;
  total: number | null;
}

interface Event {
  type: string;
  roomId: string | null;
  visibility: string;
  actor: { userId: string; role: string; characterId: string | null };
  payload: Record<string, unknown>;
}

const SECRET = 'Le trésor est sous le vieux chêne';

describe.skipIf(!TEST_DATABASE_URL)('notes', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let users: TestUser[];
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
    users = [gm, alice, bob, carol];
    campaignId = await h.campaign(gm, 'dnd-classic', [alice, bob, carol]);
    aliceHero = await h.engage(campaignId, alice, { name: 'Aria' });
    bobHero = await h.engage(campaignId, bob, { name: 'Brom' });
    await h.ok(alice, 'PUT', `/v1/campaigns/${campaignId}/me/character`, {
      characterId: aliceHero,
    });
    await h.ok(bob, 'PUT', `/v1/campaigns/${campaignId}/me/character`, { characterId: bobHero });
  });

  afterEach(async () => {
    // Notes personnelles (sans campagne) : la suppression des campagnes ne les emporte pas
    await t.db?.delete(notes).where(
      inArray(
        notes.ownerUserId,
        users.map((u) => u.id),
      ),
    );
    await t.close();
  });

  const url = (path = '') => `/v1/campaigns/${campaignId}/notes${path}`;
  const list = async (u: TestUser, query = '') =>
    (await h.ok<Page>(u, 'GET', `${url()}${query}`)).items;
  const create = (u: TestUser, body: Record<string, unknown>) => h.ok<Note>(u, 'POST', url(), body);
  const mine = (u: TestUser, query = '') => h.ok<Page>(u, 'GET', `/v1/notes${query}`);
  const createPersonal = (u: TestUser, body: Record<string, unknown>) =>
    h.ok<Note>(u, 'POST', '/v1/notes', body);

  async function events(noteId: string): Promise<Event[]> {
    const rows = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${noteId}`)
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
      campaignId,
      owner: { id: alice.id, name: 'Alice' },
      characterId: aliceHero,
      shared: false,
      sharedWith: null,
      sharedWithGm: false,
      type: 'journal',
      pinned: false,
      permissions: { edit: true, delete: true, share: true, move: true },
      version: 1,
    });

    expect((await list(alice)).map((n) => n.id)).toEqual([note.id]);
    for (const other of [gm, bob, carol]) {
      expect(await list(other)).toEqual([]);
      for (const [method, path, payload] of [
        ['GET', url(`/${note.id}`), undefined],
        ['PATCH', url(`/${note.id}`), { title: 'Lu !' }],
        ['DELETE', url(`/${note.id}`), undefined],
        ['GET', `/v1/notes/${note.id}`, undefined],
        ['PUT', `/v1/notes/${note.id}/pin`, undefined],
      ] as const) {
        const res = await h.request(other, method, path, payload);
        expect(res.statusCode, `${method} ${res.body}`).toBe(404);
        expect(res.json()).toMatchObject({ code: 'note_not_found' });
      }
    }

    const [created] = await events(note.id);
    expect(created).toMatchObject({
      type: 'note.created',
      roomId: campaignId,
      visibility: 'owner',
      actor: { userId: alice.id, characterId: aliceHero },
      payload: { id: note.id, ownerId: alice.id, shared: false, sharedWith: null, version: 1 },
    });
    // Ni texte ni titre d'une note privée dans le journal
    expect(JSON.stringify(created)).not.toContain('trésor');
    expect(created!.payload).not.toHaveProperty('title');
  });

  it('le MJ garde ses notes privées (sans personnage) et lit les notes partagées avec tous', async () => {
    const own = await create(gm, { title: 'Scénario', content: 'Le traître est Brom' });
    expect(own).toMatchObject({ characterId: null, shared: false });
    const shared = await create(alice, { title: 'Carte du donjon', shared: true });
    expect(shared).toMatchObject({ shared: true, sharedWith: 'all' });

    expect((await list(gm)).map((n) => n.id).sort()).toEqual([own.id, shared.id].sort());
    expect((await list(bob)).map((n) => n.id)).toEqual([shared.id]);
    // Lecteur non auteur : il modifie et supprime, sans changer la visibilité ni la campagne
    expect((await list(bob))[0]!.permissions).toEqual({
      edit: true,
      delete: true,
      share: false,
      move: false,
    });
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
    // Verrou optimiste : version périmée, rien n'est écrasé
    const stale = await h.request(gm, 'PATCH', url(`/${note.id}`), { title: 'X', version: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'version_conflict' });
    expect(await h.ok<Note>(gm, 'GET', `/v1/notes/${note.id}`)).toMatchObject({
      title: 'Rumeurs',
      version: 2,
    });

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
      payload: { title: 'Rumeurs', changed: ['content'], version: 2 },
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
    const nobody = await h.request(alice, 'POST', url(), { shared: true, sharedWith: [] });
    expect(nobody.json()).toMatchObject({ code: 'invalid_share_target' });
  });

  it('partagée avec le MJ : l’auteur et les MJ la lisent, pas les autres joueurs', async () => {
    const note = await create(alice, {
      title: 'Question au MJ',
      content: SECRET,
      shared: true,
      sharedWithGm: true,
    });
    expect(note).toMatchObject({ shared: true, sharedWith: [], sharedWithGm: true });
    expect((await list(gm)).map((n) => n.id)).toEqual([note.id]);
    expect(await list(bob)).toEqual([]);
    expect((await h.ok<Note>(gm, 'GET', `/v1/notes/${note.id}`)).content).toBe(SECRET);

    const [created] = await events(note.id);
    expect(created).toMatchObject({ visibility: 'gm_only', payload: { sharedWithGm: true } });
    expect(created!.payload.visibleToUsers).toEqual([alice.id]);
    expect(created!.payload).not.toHaveProperty('title');

    // Avec un personnage en plus, puis avec toute la table (le MJ y est compris)
    const both = await h.ok<Note>(alice, 'PATCH', url(`/${note.id}`), { sharedWith: [bobHero] });
    expect(both).toMatchObject({ sharedWith: [bobHero], sharedWithGm: true });
    expect((await list(bob)).map((n) => n.id)).toEqual([note.id]);
    const all = await h.ok<Note>(alice, 'PATCH', url(`/${note.id}`), { sharedWith: 'all' });
    expect(all).toMatchObject({ sharedWith: 'all', sharedWithGm: false });
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
    const [seen] = await list(carol);
    expect(seen).toMatchObject({
      id: note.id,
      permissions: { edit: false, delete: false, share: false, move: false },
    });
    for (const [method, path, payload] of [
      ['POST', url(), { title: 'X' }],
      ['PATCH', url(`/${note.id}`), { title: 'X' }],
      ['DELETE', url(`/${note.id}`), undefined],
      ['POST', url('/upload'), { contentType: 'image/png', size: 10 }],
      ['POST', '/v1/notes', { title: 'X', campaignId }],
      ['PATCH', `/v1/notes/${note.id}`, { title: 'X' }],
    ] as const) {
      const res = await h.request(carol, method, path, payload);
      expect(res.statusCode, `${method} ${path}`).toBe(403);
    }
    // Épingler reste une préférence personnelle
    expect((await h.request(carol, 'PUT', `/v1/notes/${note.id}/pin`)).statusCode).toBe(204);
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
    users.push(stranger);
    expect((await h.request(stranger, 'GET', url())).statusCode).toBe(404);
    expect(
      (await h.request(stranger, 'POST', url('/upload'), { contentType: 'image/png', size: 1 }))
        .statusCode,
    ).toBe(404);
    const elsewhere = await h.request(stranger, 'POST', '/v1/notes', { campaignId, title: 'X' });
    expect(elsewhere.json()).toMatchObject({ code: 'campaign_not_found' });
  });

  it('validation : type, étapes, icône, champs inconnus', async () => {
    for (const body of [
      { type: 'secret' },
      { questStatus: 'not-started' },
      { subQuests: [{ id: '1', title: 'X', description: '', status: 'done' }] },
      { imageUrl: 'javascript:alert(1)' },
      { imageUrl: 'http://tiers.example/pistage.png' },
      { icon: 'AB' },
      { icon: '🐉🐺' },
      { icon: '<b>' },
      {
        tags: [
          { id: 'a', label: 'A' },
          { id: 'a', label: 'B' },
        ],
      },
      { createdBy: 'x' },
      { campaignId },
    ]) {
      const res = await h.request(alice, 'POST', url(), body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await create(alice, { icon: '🗺️' })).icon).toBe('🗺️');
  });

  describe('notes personnelles et liste de toutes mes notes', () => {
    it('une note personnelle : sans campagne, son auteur seul, événement hors campagne', async () => {
      const note = await createPersonal(alice, {
        title: 'Idées de personnage',
        content: `<p>${SECRET}</p>`,
        icon: '🧙',
      });
      expect(note).toMatchObject({
        campaignId: null,
        characterId: null,
        shared: false,
        icon: '🧙',
        permissions: { edit: true, delete: true, share: false, move: true },
      });
      for (const other of [gm, bob]) {
        expect((await h.request(other, 'GET', `/v1/notes/${note.id}`)).statusCode).toBe(404);
        expect((await mine(other)).items.map((n) => n.id)).not.toContain(note.id);
      }
      const refused = await h.request(alice, 'PATCH', `/v1/notes/${note.id}`, { shared: true });
      expect(refused.json()).toMatchObject({ code: 'personal_note_not_shareable' });
      const direct = await h.request(alice, 'POST', '/v1/notes', { shared: true });
      expect(direct.json()).toMatchObject({ code: 'personal_note_not_shareable' });

      const [created] = await events(note.id);
      expect(created).toMatchObject({
        type: 'note.created',
        roomId: null,
        visibility: 'owner',
        actor: { userId: alice.id, role: 'user', characterId: null },
        payload: { id: note.id, campaignId: null },
      });
      expect(JSON.stringify(created)).not.toContain('trésor');
      expect(JSON.stringify(created)).not.toContain('Idées');
    });

    it('toutes mes notes : personnelles et de campagne, filtres et facettes', async () => {
      const personal = await createPersonal(alice, { title: 'Perso', type: 'character' });
      const campaignNote = await create(alice, {
        title: 'Campagne',
        tags: [{ id: 't1', label: 'Indice' }],
      });
      const sharedByBob = await create(bob, { title: 'De Bob', shared: true, type: 'location' });
      await create(bob, { title: 'Privée de Bob' });

      const all = await mine(alice);
      expect(all.total).toBe(3);
      expect(all.items.map((n) => n.id).sort()).toEqual(
        [personal.id, campaignNote.id, sharedByBob.id].sort(),
      );
      expect((await mine(alice, '?campaignId=none')).items.map((n) => n.id)).toEqual([personal.id]);
      expect(
        (await mine(alice, `?campaignId=${campaignId}`)).items.map((n) => n.id).sort(),
      ).toEqual([campaignNote.id, sharedByBob.id].sort());
      expect((await mine(alice, '?type=location')).items.map((n) => n.id)).toEqual([
        sharedByBob.id,
      ]);

      const facets = await h.ok<{
        total: number;
        pinned: number;
        types: Record<string, number>;
        campaigns: { campaignId: string | null; count: number }[];
        tags: { label: string; count: number }[];
      }>(alice, 'GET', '/v1/notes/facets');
      expect(facets).toMatchObject({
        total: 3,
        pinned: 0,
        types: { character: 1, location: 1, other: 1, quest: 0 },
        tags: [{ label: 'Indice', count: 1 }],
      });
      expect(facets.campaigns).toEqual(
        expect.arrayContaining([
          { campaignId: null, count: 1 },
          { campaignId, count: 2 },
        ]),
      );
    });

    it('épingles : préférence de chaque lecteur, en tête de liste, événement personnel', async () => {
      const older = await create(alice, { title: 'Ancienne', shared: true });
      const newer = await create(alice, { title: 'Récente', shared: true });
      expect((await mine(bob)).items.map((n) => n.id)).toEqual([newer.id, older.id]);

      await h.ok(bob, 'PUT', `/v1/notes/${older.id}/pin`);
      await h.ok(bob, 'PUT', `/v1/notes/${older.id}/pin`);
      const bobs = await mine(bob);
      expect(bobs.items.map((n) => [n.id, n.pinned])).toEqual([
        [older.id, true],
        [newer.id, false],
      ]);
      // Alice n'est pas concernée par l'épingle de Bob
      expect((await mine(alice)).items.map((n) => n.pinned)).toEqual([false, false]);
      expect((await mine(bob, '?pinned=true')).items.map((n) => n.id)).toEqual([older.id]);
      expect((await h.ok<Note>(bob, 'GET', `/v1/notes/${older.id}`)).pinned).toBe(true);

      await h.ok(bob, 'DELETE', `/v1/notes/${older.id}/pin`);
      expect((await mine(bob, '?pinned=true')).items).toEqual([]);

      const pins = (await events(older.id)).filter(
        (e) => e.type.startsWith('note.pin') || e.type.startsWith('note.unpin'),
      );
      // Une seule épingle posée (la seconde ne change rien), puis retirée
      expect(pins.map((e) => [e.type, e.roomId, e.visibility, e.actor.userId])).toEqual([
        ['note.pinned', null, 'owner', bob.id],
        ['note.unpinned', null, 'owner', bob.id],
      ]);
    });

    it('changer de campagne : l’auteur seul ; la note repart privée', async () => {
      const note = await createPersonal(alice, { title: 'À partager', content: '<p>x</p>' });
      const moved = await h.ok<Note>(alice, 'PATCH', `/v1/notes/${note.id}`, {
        campaignId,
        shared: true,
        version: note.version,
      });
      expect(moved).toMatchObject({
        campaignId,
        characterId: aliceHero,
        shared: true,
        sharedWith: 'all',
        version: 2,
      });
      expect((await list(bob)).map((n) => n.id)).toEqual([note.id]);

      const notOwner = await h.request(bob, 'PATCH', `/v1/notes/${note.id}`, { campaignId: null });
      expect(notOwner.json()).toMatchObject({ code: 'not_note_owner' });

      const back = await h.ok<Note>(alice, 'PATCH', `/v1/notes/${note.id}`, { campaignId: null });
      expect(back).toMatchObject({ campaignId: null, characterId: null, shared: false });
      expect(await list(bob)).toEqual([]);

      const updates = (await events(note.id)).filter((e) => e.type === 'note.updated');
      expect(updates).toHaveLength(4);
      // Personnelle → campagne, puis campagne → personnelle : un événement de chaque côté
      // (écrits dans la même transaction, leur ordre relatif n'est pas garanti)
      const side = (list: Event[], room: string | null) => list.find((e) => e.roomId === room)!;
      const [toCampaign, toPersonal] = [updates.slice(0, 2), updates.slice(2)];
      for (const pair of [toCampaign, toPersonal]) {
        expect(side(pair, null)).toMatchObject({ visibility: 'owner' });
        expect(side(pair, campaignId)).toMatchObject({ visibility: 'public' });
      }
      expect(side(toCampaign, null).payload).toMatchObject({ changed: ['campaignId', 'shared'] });
      // La note quitte la table : la campagne l'apprend, sans son titre
      expect(side(toPersonal, campaignId).payload).not.toHaveProperty('title');
    });

    it('une modification sans changement n’écrit rien', async () => {
      const note = await createPersonal(alice, { title: 'Stable', content: '<p>x</p>' });
      const same = await h.ok<Note>(alice, 'PATCH', `/v1/notes/${note.id}`, {
        title: 'Stable',
        content: '<p>x</p>',
        version: 1,
      });
      expect(same.version).toBe(1);
      expect((await events(note.id)).map((e) => e.type)).toEqual(['note.created']);
    });
  });

  describe('contenu, recherche et pages', () => {
    it('assainit le HTML à l’écriture ; trop long une fois réécrit : 400', async () => {
      const note = await createPersonal(alice, {
        content:
          '<p onclick="alert(1)">Bonjour <img src=x onerror=alert(1)>' +
          '<a href="javascript:alert(1)">lien</a></p><script>alert(1)</script>',
      });
      expect(note.content).toBe('<p>Bonjour lien</p>');
      const patched = await h.ok<Note>(alice, 'PATCH', `/v1/notes/${note.id}`, {
        content: '<h2 style="text-align:center">T</h2><iframe src="x"></iframe>',
      });
      expect(patched.content).toBe('<h2 style="text-align: center">T</h2>');

      const tooLong = await h.request(alice, 'POST', '/v1/notes', {
        content: `<p>${'<'.repeat(199_000)}</p>`,
      });
      expect(tooLong.json()).toMatchObject({ code: 'content_too_long' });
    });

    it('recherche plein texte : sans accents, par préfixe, racines, titre et étiquettes', async () => {
      const sword = await createPersonal(alice, {
        title: 'Armurerie',
        content: `<h2>Stock</h2><p>${'Du blabla. '.repeat(30)}Une Épée longue et des chevaux.</p>`,
      });
      const tagged = await createPersonal(alice, {
        title: 'Taverne',
        tags: [{ id: 'x', label: 'Légende' }],
      });
      const search = async (q: string) =>
        (await mine(alice, `?q=${encodeURIComponent(q)}`)).items.map((n) => n.id);

      expect(await search('epee')).toEqual([sword.id]);
      expect(await search('ÉPÉ')).toEqual([sword.id]);
      expect(await search('cheval')).toEqual([sword.id]);
      expect(await search('armu')).toEqual([sword.id]);
      expect(await search('legende')).toEqual([tagged.id]);
      expect(await search('la')).toEqual([]);
      expect(await search('epee taverne')).toEqual([]);
      expect(await search('  ')).toHaveLength(2);

      // Extrait centré sur le terme trouvé, coupé aux mots
      const [hit] = (await mine(alice, '?q=chevaux')).items;
      expect(hit!.excerpt.startsWith('… ')).toBe(true);
      expect(hit!.excerpt).toContain('Épée longue et des chevaux.');
      // Sans recherche : l'aperçu, sans les intertitres
      const plain = (await mine(alice)).items.find((n) => n.id === sword.id)!;
      expect(plain.excerpt.startsWith('Du blabla.')).toBe(true);
    });

    it('pages : curseur stable, sans doublon, total sur la première', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push((await createPersonal(alice, { title: `N${i}` })).id);
      await h.ok(alice, 'PUT', `/v1/notes/${ids[1]}/pin`);

      const seen: string[] = [];
      let cursor: string | null = null;
      let first = true;
      do {
        const p: Page = await mine(alice, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
        expect(p.total).toBe(first ? 5 : null);
        first = false;
        seen.push(...p.items.map((n) => n.id));
        cursor = p.nextCursor;
      } while (cursor);
      // Épinglée d'abord, puis les plus récentes
      expect(seen).toEqual([ids[1], ids[4], ids[3], ids[2], ids[0]]);

      const bad = await h.request(alice, 'GET', '/v1/notes?cursor=nimporte');
      expect(bad.json()).toMatchObject({ code: 'invalid_cursor' });
    });

    it('notes importées : servies assainies, puis reprises en base sans nouvelle version', async () => {
      const id = crypto.randomUUID();
      await t.db!.insert(notes).values({
        id,
        campaignId,
        ownerUserId: alice.id,
        title: 'Importée',
        content: '<p>Texte <b>gras</b><img src="x" onerror="alert(1)"></p><script>x</script>',
      });
      const served = await h.ok<Note>(alice, 'GET', `/v1/notes/${id}`);
      expect(served).toMatchObject({ content: '<p>Texte <strong>gras</strong></p>', version: 1 });

      expect(await resanitizeNotes(t.db!, { imageBase: null })).toBeGreaterThanOrEqual(1);
      const [row] = await t
        .db!.select({
          content: notes.content,
          plainText: notes.plainText,
          sanitizerVersion: notes.sanitizerVersion,
          version: notes.version,
        })
        .from(notes)
        .where(sql`${notes.id} = ${id}`);
      expect(row).toEqual({
        content: '<p>Texte <strong>gras</strong></p>',
        plainText: 'Texte gras',
        sanitizerVersion: 1,
        version: 1,
      });
      expect((await mine(alice, '?q=gras')).items.map((n) => n.id)).toEqual([id]);
    });
  });
});
