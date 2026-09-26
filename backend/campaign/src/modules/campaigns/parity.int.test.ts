/**
 * Parité avec l'ancienne app : code de campagne, options (publique, création
 * de fiches), image, campagnes publiques, adhésion par code de campagne,
 * nombre de joueurs illimité, bannissements.
 */
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaigns, outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Campaign {
  id: string;
  code: string;
  imageUrl: string | null;
  isPublic: boolean;
  characterCreation: boolean;
  playerCount: number;
  role: string | null;
  owner: { id: string; name: string | null };
  memberCount?: number;
}

interface Page {
  campaigns: Campaign[];
  page: number;
  perPage: number;
  total: number;
}

describe.skipIf(!TEST_DATABASE_URL)('campagnes : parité avec l’ancienne app', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
    bob = await t.user('Bob');
  });

  afterEach(async () => {
    await t.close();
  });

  const create = (u: TestUser, body: object = {}) =>
    h.ok<Campaign>(u, 'POST', '/v1/campaigns', {
      name: 'La Table',
      systemId: 'dnd-classic',
      ...body,
    });
  const join = (u: TestUser, code: string) => h.request(u, 'POST', '/v1/campaigns/join', { code });
  const types = async (campaignId: string) =>
    (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    ).map((e) => e.type);

  it('création : code unique, options par défaut ou choisies, modifiables par le MJ', async () => {
    const byDefault = await create(gm);
    expect(byDefault).toMatchObject({
      code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{6}$/),
      imageUrl: null,
      isPublic: false,
      characterCreation: true,
      playerCount: 0,
      owner: { id: gm.id, name: 'Maître' },
    });
    const chosen = await create(gm, { isPublic: true, characterCreation: false });
    expect(chosen).toMatchObject({ isPublic: true, characterCreation: false });
    expect(chosen.code).not.toBe(byDefault.code);

    for (const body of [{ isPublic: 'oui' }, { characterCreation: 1 }]) {
      const res = await h.request(gm, 'POST', '/v1/campaigns', {
        name: 'X',
        systemId: 'dnd-classic',
        ...body,
      });
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }

    const updated = await h.ok<Campaign>(gm, 'PATCH', `/v1/campaigns/${byDefault.id}`, {
      isPublic: true,
      characterCreation: false,
    });
    expect(updated).toMatchObject({ isPublic: true, characterCreation: false });
    expect(updated.code).toBe(byDefault.code);
    expect(await types(byDefault.id)).toEqual(['campaign.created', 'campaign.updated']);
  });

  it('mes campagnes : champs de la liste et filtre par rôle', async () => {
    const mine = await create(gm);
    const other = await h.campaign(alice, 'dnd-classic', [gm]);

    const all = await h.ok<Campaign[]>(gm, 'GET', '/v1/campaigns');
    expect(all.map((c) => c.id).sort()).toEqual([mine.id, other].sort());
    const [asGm] = await h.ok<Campaign[]>(gm, 'GET', '/v1/campaigns?role=gm');
    expect(asGm).toMatchObject({ id: mine.id, role: 'gm', playerCount: 0 });
    const asPlayer = await h.ok<Campaign[]>(gm, 'GET', '/v1/campaigns?role=player');
    expect(asPlayer).toMatchObject([
      { id: other, role: 'player', playerCount: 1, memberCount: 2, owner: { id: alice.id } },
    ]);
    expect((await h.request(gm, 'GET', '/v1/campaigns?role=mj')).statusCode).toBe(400);
  });

  it('campagnes publiques : privées absentes, recherche, pages, rôle de l’appelant', async () => {
    // Nom unique au test : la base est partagée avec les autres tests
    const mark = `Quête-${crypto.randomUUID().slice(0, 8)}`;
    const open = await create(gm, { name: `${mark} du dragon`, isPublic: true });
    await create(gm, { name: `${mark} secrète` });
    const described = await create(bob, {
      name: 'Autre table',
      description: `Suite de la ${mark}`,
      isPublic: true,
    });

    const page = await h.ok<Page>(alice, 'GET', `/v1/campaigns/public?search=${mark}`);
    expect(page).toMatchObject({ page: 1, perPage: 20, total: 2 });
    expect(page.campaigns.map((c) => c.id).sort()).toEqual([open.id, described.id].sort());
    expect(page.campaigns.find((c) => c.id === open.id)).toMatchObject({
      role: null,
      code: open.code,
      playerCount: 0,
      owner: { id: gm.id, name: 'Maître' },
    });

    // Par code, en minuscules ; un joker de LIKE ne remonte pas tout
    const byCode = await h.ok<Page>(
      alice,
      'GET',
      `/v1/campaigns/public?search=${open.code.toLowerCase()}`,
    );
    expect(byCode.campaigns.map((c) => c.id)).toEqual([open.id]);
    expect((await h.ok<Page>(alice, 'GET', `/v1/campaigns/public?search=${mark}%25_`)).total).toBe(
      0,
    );

    // Une fois entré, l'appelant voit son rôle et le joueur est compté
    await h.ok(alice, 'POST', '/v1/campaigns/join', { code: open.code });
    const after = await h.ok<Page>(alice, 'GET', `/v1/campaigns/public?search=${mark}`);
    expect(after.campaigns.find((c) => c.id === open.id)).toMatchObject({
      role: 'player',
      playerCount: 1,
    });

    // Pagination : page vide au-delà du total, bornes validées
    const far = await h.ok<Page>(alice, 'GET', `/v1/campaigns/public?search=${mark}&page=2`);
    expect(far).toMatchObject({ page: 2, total: 2, campaigns: [] });
    expect((await h.request(alice, 'GET', '/v1/campaigns/public?page=0')).statusCode).toBe(400);
    const anonymous = await t.app.inject({ method: 'GET', url: '/v1/campaigns/public' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('image : URL présignée pour le MJ, seule une image de la campagne est acceptée', async () => {
    const c = await create(gm);
    await h.ok(gm, 'POST', `/v1/campaigns/${c.id}/invitations`, {});
    const id = await h.campaign(gm, 'dnd-classic', [alice]);

    const upload = await h.ok<{ uploadUrl: string; publicUrl: string; expiresIn: number }>(
      gm,
      'POST',
      `/v1/campaigns/${id}/image`,
      { contentType: 'image/webp', size: 1234 },
    );
    expect(upload.publicUrl).toMatch(
      new RegExp(`^https://cdn\\.test\\.local/vtt/campaigns/${id}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(upload.uploadUrl).toContain(
      upload.publicUrl.slice('https://cdn.test.local/vtt/'.length),
    );
    expect(upload.expiresIn).toBe(300);
    expect(t.uploads.at(-1)).toMatchObject({ contentType: 'image/webp', size: 1234 });

    // Joueur : 403 ; non-membre : 404 ; fichier trop gros ou type refusé : 400
    expect(
      (
        await h.request(alice, 'POST', `/v1/campaigns/${id}/image`, {
          contentType: 'image/png',
          size: 10,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await h.request(bob, 'POST', `/v1/campaigns/${id}/image`, {
          contentType: 'image/png',
          size: 10,
        })
      ).statusCode,
    ).toBe(404);
    for (const body of [
      { contentType: 'image/png', size: 6 * 1024 * 1024 },
      { contentType: 'image/svg+xml', size: 10 },
    ]) {
      expect((await h.request(gm, 'POST', `/v1/campaigns/${id}/image`, body)).statusCode).toBe(400);
    }

    const withImage = await h.ok<Campaign>(gm, 'PATCH', `/v1/campaigns/${id}`, {
      imageUrl: upload.publicUrl,
    });
    expect(withImage.imageUrl).toBe(upload.publicUrl);
    // L'image d'une autre campagne, ou une URL arbitraire : refusées
    for (const imageUrl of [
      `https://cdn.test.local/vtt/campaigns/${c.id}/a.png`,
      'https://pistage.example/pixel.gif',
    ]) {
      expect(
        (await h.request(gm, 'PATCH', `/v1/campaigns/${id}`, { imageUrl })).json(),
      ).toMatchObject({ status: 400, code: 'invalid_image' });
    }
    // Reprendre la même URL ou l'effacer reste possible
    expect(
      (await h.request(gm, 'PATCH', `/v1/campaigns/${id}`, { imageUrl: upload.publicUrl }))
        .statusCode,
    ).toBe(200);
    expect(
      (await h.ok<Campaign>(gm, 'PATCH', `/v1/campaigns/${id}`, { imageUrl: null })).imageUrl,
    ).toBe(null);
  });

  it('image : 503 si le stockage n’est pas configuré', async () => {
    const bare = await testApp({ S3_PUBLIC_URL: '' });
    try {
      const bh = helpers(bare);
      const u = await bare.user();
      const id = await bh.campaign(u);
      const res = await bh.request(u, 'POST', `/v1/campaigns/${id}/image`, {
        contentType: 'image/png',
        size: 10,
      });
      expect(res.json()).toMatchObject({ status: 503, code: 'storage_unavailable' });
    } finally {
      await bare.close();
    }
  });

  it('rejoindre par code de campagne : privée ou publique, saisie tolérante, introuvable', async () => {
    const privateCampaign = await create(gm);
    const typed = `${privateCampaign.code.slice(0, 3).toLowerCase()}-${privateCampaign.code.slice(3)}`;
    const res = await join(alice, typed);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      id: privateCampaign.id,
      role: 'player',
      code: privateCampaign.code,
    });
    // Déjà membre : la campagne, sans nouvel événement
    expect((await join(alice, privateCampaign.code)).statusCode).toBe(200);
    expect((await join(gm, privateCampaign.code)).json()).toMatchObject({ role: 'gm' });
    expect(
      (await types(privateCampaign.id)).filter((x) => x === 'campaign.member_joined'),
    ).toHaveLength(1);

    // Une campagne privée reste invisible hors de ses membres
    expect((await h.request(bob, 'GET', `/v1/campaigns/${privateCampaign.id}`)).statusCode).toBe(
      404,
    );
    const [row] = await t.db!.select().from(campaigns).where(eq(campaigns.id, privateCampaign.id));
    expect(row!.isPublic).toBe(false);

    for (const code of ['ZZZZZZ', 'ABC', 'n’importe quoi', `inv_${'A'.repeat(27)}`]) {
      expect((await join(bob, code)).json(), code).toMatchObject({
        status: 404,
        code: 'campaign_not_found',
      });
    }
  });

  it('pas de limite de joueurs : tout le monde entre, par code comme par invitation', async () => {
    const c = await create(gm);
    const { code } = await h.ok<{ code: string }>(
      gm,
      'POST',
      `/v1/campaigns/${c.id}/invitations`,
      {},
    );
    const others = await Promise.all(['Carol', 'Dan', 'Eve', 'Fred'].map((n) => t.user(n)));
    // Adhésions simultanées : aucune n'est refusée
    const statuses = await Promise.all([
      join(alice, c.code),
      join(bob, code),
      ...others.map((u, i) => join(u, i % 2 ? c.code : code)),
    ]);
    expect(statuses.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200, 200]);
    const detail = await h.ok<Campaign & { members: unknown[] }>(
      gm,
      'GET',
      `/v1/campaigns/${c.id}`,
    );
    expect(detail.playerCount).toBe(6);
    expect(detail.members).toHaveLength(7);
  });

  it('bannir : exclu, ne revient ni par code ni par invitation, jusqu’à la levée', async () => {
    const c = await create(gm);
    const { code } = await h.ok<{ code: string }>(
      gm,
      'POST',
      `/v1/campaigns/${c.id}/invitations`,
      {},
    );
    await h.ok(alice, 'POST', '/v1/campaigns/join', { code: c.code });
    await h.ok(bob, 'POST', '/v1/campaigns/join', { code: c.code });

    // Un joueur ne bannit personne, pas même lui-même ; le MJ ne se bannit pas
    const kick = (u: TestUser, target: TestUser) =>
      h.request(u, 'DELETE', `/v1/campaigns/${c.id}/members/${target.id}?ban=true`);
    expect((await kick(bob, alice)).statusCode).toBe(403);
    expect((await kick(bob, bob)).statusCode).toBe(403);
    expect((await kick(gm, gm)).json()).toMatchObject({ status: 400, code: 'cannot_ban_self' });
    expect((await h.request(bob, 'GET', `/v1/campaigns/${c.id}/bans`)).statusCode).toBe(403);

    expect((await kick(gm, alice)).statusCode).toBe(204);
    for (const x of [c.code, code]) {
      expect((await join(alice, x)).json()).toMatchObject({ status: 403, code: 'banned' });
    }
    const bans = await h.ok<unknown[]>(gm, 'GET', `/v1/campaigns/${c.id}/bans`);
    expect(bans).toEqual([
      {
        userId: alice.id,
        name: 'Alice',
        avatarUrl: null,
        bannedBy: gm.id,
        bannedAt: expect.any(String),
      },
    ]);

    // Exclusion simple : Bob peut revenir
    await h.ok(gm, 'DELETE', `/v1/campaigns/${c.id}/members/${bob.id}`);
    expect((await join(bob, c.code)).statusCode).toBe(200);

    // Levée du bannissement (MJ) : Alice revient
    const unban = (u: TestUser) => h.request(u, 'DELETE', `/v1/campaigns/${c.id}/bans/${alice.id}`);
    expect((await unban(bob)).statusCode).toBe(403);
    expect((await unban(gm)).statusCode).toBe(204);
    expect((await unban(gm)).statusCode).toBe(404);
    expect((await join(alice, c.code)).statusCode).toBe(200);

    const events = await t
      .db!.select({ type: sql<string>`${outbox.envelope}->>'type'`, envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'roomId' = ${c.id}`)
      .orderBy(outbox.id);
    const left = events.find((e) => e.type === 'campaign.member_left');
    expect(left!.envelope).toMatchObject({
      payload: { userId: alice.id, kicked: true, banned: true },
    });
    expect(events.find((e) => e.type === 'campaign.member_unbanned')!.envelope).toMatchObject({
      visibility: 'gm_only',
      payload: { userId: alice.id },
    });
  });
});
