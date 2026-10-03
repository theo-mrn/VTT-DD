/**
 * Campagnes, membres et rôles sur un vrai PostgreSQL (rôle campaign_svc).
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

interface Campaign {
  id: string;
  name: string;
  description: string;
  system: { id: string; version: string };
  ownerId: string;
  role: string;
  members: { userId: string; name: string | null; role: string }[];
  characters: { characterId: string; side: string }[];
  version: number;
}

describe.skipIf(!TEST_DATABASE_URL)('campagnes et membres', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let player: TestUser;
  let stranger: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    player = await t.user('Aria');
    stranger = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  const events = async (campaignId: string) =>
    (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'`, subject: outbox.subject })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    ).map((e) => e.type);

  it('crée une campagne : le créateur est MJ propriétaire, événement campaign.created', async () => {
    const res = await h.request(gm, 'POST', '/v1/campaigns', {
      name: '  La Table  ',
      systemId: 'star-wars-eote',
      description: 'Campagne du jeudi',
    });
    expect(res.statusCode).toBe(201);
    const c = res.json() as Campaign;
    expect(c).toMatchObject({
      name: 'La Table',
      description: 'Campagne du jeudi',
      system: { id: 'star-wars-eote', version: '1.0.0' },
      ownerId: gm.id,
      role: 'gm',
      playedCharacterId: null,
      members: [{ userId: gm.id, name: 'Maître', role: 'gm' }],
      characters: [],
      version: 1,
    });
    expect(await events(c.id)).toEqual(['campaign.created']);
    const [event] = await t
      .db!.select({ subject: outbox.subject, envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'roomId' = ${c.id}`);
    expect(event!.subject).toBe(`vtt.${c.id}.campaign.created`);
    expect(event!.envelope).toMatchObject({
      aggregate: { type: 'campaign', id: c.id },
      actor: { userId: gm.id, role: 'gm' },
      payload: { name: 'La Table', isPublic: false, system: { id: 'star-wars-eote' } },
    });

    const list = await h.ok<unknown[]>(gm, 'GET', '/v1/campaigns');
    expect(list).toEqual([
      {
        id: c.id,
        name: 'La Table',
        role: 'gm',
        description: 'Campagne du jeudi',
        system: { id: 'star-wars-eote', version: '1.0.0' },
        memberCount: 1,
        playerCount: 0,
        code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{6}$/),
        imageUrl: null,
        isPublic: false,
        characterCreation: true,
        pitch: '',
        accent: 'gold',
        tags: [],
        owner: { id: gm.id, name: 'Maître', avatarUrl: null },
        updatedAt: expect.any(String),
        members: [{ userId: gm.id, name: 'Maître', avatarUrl: null, role: 'gm' }],
        nextSession: null,
        playedCharacterId: null,
        characterIds: [],
      },
    ]);
    expect(await h.ok(stranger, 'GET', '/v1/campaigns')).toEqual([]);
  });

  it('refuse un système inconnu, un nom vide, un anonyme', async () => {
    expect(
      (await h.request(gm, 'POST', '/v1/campaigns', { name: 'X', systemId: 'inconnu' })).json(),
    ).toMatchObject({ status: 400, code: 'unknown_system' });
    expect(
      (await h.request(gm, 'POST', '/v1/campaigns', { name: ' ', systemId: 'dnd-classic' }))
        .statusCode,
    ).toBe(400);
    const anonymous = await t.app.inject({ method: 'GET', url: '/v1/campaigns' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('404 pour un non-membre, 403 pour un joueur sur les routes du MJ', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [player]);
    for (const [method, url, payload] of [
      ['GET', `/v1/campaigns/${id}`, undefined],
      ['PATCH', `/v1/campaigns/${id}`, { name: 'Volée' }],
      ['DELETE', `/v1/campaigns/${id}`, undefined],
      ['POST', `/v1/campaigns/${id}/invitations`, {}],
      ['PATCH', `/v1/campaigns/${id}/members/${player.id}`, { role: 'gm' }],
    ] as const) {
      const res = await h.request(stranger, method, url, payload);
      expect(res.statusCode, url).toBe(404);
      expect(res.json(), url).toMatchObject({ code: 'campaign_not_found' });
    }
    for (const [method, url, payload] of [
      ['PATCH', `/v1/campaigns/${id}`, { name: 'Volée' }],
      ['DELETE', `/v1/campaigns/${id}`, undefined],
      ['POST', `/v1/campaigns/${id}/invitations`, {}],
      ['PATCH', `/v1/campaigns/${id}/members/${player.id}`, { role: 'gm' }],
      ['POST', `/v1/campaigns/${id}/combat`, { participants: [crypto.randomUUID()] }],
    ] as const) {
      expect((await h.request(player, method, url, payload)).statusCode, url).toBe(403);
    }
    const view = await h.ok<Campaign>(player, 'GET', `/v1/campaigns/${id}`);
    expect(view.role).toBe('player');
    expect(view.members.map((m) => [m.name, m.role])).toEqual([
      ['Maître', 'gm'],
      ['Aria', 'player'],
    ]);
  });

  it('le MJ modifie la campagne ; le système ne change plus une fois des personnages engagés', async () => {
    const id = await h.campaign(gm);
    const c = await h.ok<Campaign>(gm, 'PATCH', `/v1/campaigns/${id}`, {
      name: 'Nouvelle table',
      systemId: 'nooblies',
    });
    expect(c).toMatchObject({ name: 'Nouvelle table', system: { id: 'nooblies' }, version: 2 });
    const [updated] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${id} and ${outbox.envelope}->>'type' = 'campaign.updated'`,
      );
    // Champs envoyés, et diff avant/après (seulement ce qui a changé)
    expect((updated!.envelope as { payload: unknown }).payload).toEqual({
      version: 2,
      name: 'Nouvelle table',
      systemId: 'nooblies',
      systemVersion: c.system.version,
      changes: [
        { path: 'name', before: 'La Table', after: 'Nouvelle table' },
        { path: 'systemId', before: 'dnd-classic', after: 'nooblies' },
      ],
    });
    await h.engage(id, gm, { systemId: 'nooblies' });
    const refused = await h.request(gm, 'PATCH', `/v1/campaigns/${id}`, {
      systemId: 'dnd-classic',
    });
    expect(refused.json()).toMatchObject({ status: 409, code: 'characters_engaged' });
  });

  it('rôles : le MJ promeut et rétrograde ; le propriétaire reste MJ', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [player]);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${player.id}`, { role: 'spectator' });
    expect(
      (
        await h.request(player, 'POST', `/v1/campaigns/${id}/characters`, {
          characterId: crypto.randomUUID(),
        })
      ).statusCode,
    ).toBe(403);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${player.id}`, { role: 'gm' });
    // Co-MJ : il peut inviter, mais pas rétrograder le propriétaire ni supprimer la campagne
    expect(
      (await h.request(player, 'POST', `/v1/campaigns/${id}/invitations`, {})).statusCode,
    ).toBe(201);
    const owner = await h.request(player, 'PATCH', `/v1/campaigns/${id}/members/${gm.id}`, {
      role: 'player',
    });
    expect(owner.json()).toMatchObject({ status: 409, code: 'owner' });
    expect((await h.request(player, 'DELETE', `/v1/campaigns/${id}`)).statusCode).toBe(403);
    const unknown = await h.request(gm, 'PATCH', `/v1/campaigns/${id}/members/${stranger.id}`, {
      role: 'player',
    });
    expect(unknown.statusCode).toBe(404);
    expect(
      (await h.request(gm, 'PATCH', `/v1/campaigns/${id}/members/${player.id}`, { role: 'mj' }))
        .statusCode,
    ).toBe(400);
    expect(await events(id)).toEqual([
      'campaign.created',
      'campaign.invitation_created',
      'campaign.member_joined',
      'campaign.member_role_changed',
      'campaign.member_role_changed',
      'campaign.invitation_created',
    ]);
  });

  it('quitter, exclure : ses personnages quittent la campagne ; le propriétaire ne part pas', async () => {
    const other = await t.user();
    const id = await h.campaign(gm, 'dnd-classic', [player, other]);
    await h.engage(id, player);
    expect(
      (await h.request(other, 'DELETE', `/v1/campaigns/${id}/members/${player.id}`)).statusCode,
    ).toBe(403);
    expect(
      (await h.request(player, 'DELETE', `/v1/campaigns/${id}/members/${player.id}`)).statusCode,
    ).toBe(204);
    const c = await h.ok<Campaign>(gm, 'GET', `/v1/campaigns/${id}`);
    expect(c.members.map((m) => m.userId)).toEqual([gm.id, other.id]);
    expect(c.characters).toEqual([]);
    expect((await h.request(player, 'GET', `/v1/campaigns/${id}`)).statusCode).toBe(404);

    expect(
      (await h.request(gm, 'DELETE', `/v1/campaigns/${id}/members/${other.id}`)).statusCode,
    ).toBe(204);
    const owner = await h.request(gm, 'DELETE', `/v1/campaigns/${id}/members/${gm.id}`);
    expect(owner.json()).toMatchObject({ status: 409, code: 'owner' });
  });

  it('le propriétaire supprime la campagne et tout ce qu’elle contient', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [player]);
    const hero = await h.engage(id, player);
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/combat`, { participants: [hero] });
    expect((await h.request(gm, 'DELETE', `/v1/campaigns/${id}`)).statusCode).toBe(204);
    expect((await h.request(gm, 'GET', `/v1/campaigns/${id}`)).statusCode).toBe(404);
    expect(await h.ok(player, 'GET', '/v1/campaigns')).toEqual([]);
    expect((await events(id)).at(-1)).toBe('campaign.deleted');
  });
});
