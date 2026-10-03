/**
 * Invitations nominatives (un ami invité rejoint sans code) et adhésion sans
 * code : campagne publique ou invitation.
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
  code: string;
  role: string | null;
  members: { userId: string; role: string }[];
  invitees: { userId: string; name: string | null; invitedBy: string; invitedAt: string }[];
}

interface Invited {
  id: string;
  name: string;
  role: null;
  memberCount: number;
  invitedBy: { id: string; name: string | null };
  invitedAt: string;
}

describe.skipIf(!TEST_DATABASE_URL)('invitations nominatives et adhésion sans code', () => {
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

  const events = async (campaignId: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    ).map(
      (e) => e.envelope as { type: string; visibility?: string; payload: Record<string, unknown> },
    );

  const invite = (u: TestUser, id: string, userIds: string[]) =>
    h.request(u, 'POST', `/v1/campaigns/${id}/invitees`, { userIds });

  it('le MJ invite ; l’invité voit l’invitation et rejoint une campagne privée sans code', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [bob]);
    const res = await invite(gm, id, [alice.id, alice.id, gm.id, bob.id]);
    expect(res.statusCode).toBe(200);
    // Membres ignorés, doublons fusionnés
    expect((res.json() as Campaign).invitees).toEqual([
      {
        userId: alice.id,
        name: 'Alice',
        avatarUrl: null,
        invitedBy: gm.id,
        invitedAt: expect.any(String),
      },
    ]);
    // Seul le MJ voit les invitations en attente
    expect((await h.ok<Campaign>(bob, 'GET', `/v1/campaigns/${id}`)).invitees).toEqual([]);
    // Réinviter ne change rien
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/invitees`, { userIds: [alice.id] });

    const invited = await h.ok<Invited[]>(alice, 'GET', '/v1/campaigns/invited');
    expect(invited).toMatchObject([
      {
        id,
        name: 'La Table',
        role: null,
        memberCount: 2,
        invitedBy: { id: gm.id, name: 'Maître' },
      },
    ]);
    expect(await h.ok(bob, 'GET', '/v1/campaigns/invited')).toEqual([]);
    // Toujours introuvable pour l'invité tant qu'il n'a pas rejoint
    expect((await h.request(alice, 'GET', `/v1/campaigns/${id}`)).statusCode).toBe(404);

    const joined = await h.ok<Campaign>(alice, 'POST', `/v1/campaigns/${id}/join`);
    expect(joined).toMatchObject({ id, role: 'player' });
    expect(await h.ok(alice, 'GET', '/v1/campaigns/invited')).toEqual([]);
    expect((await h.ok<Campaign>(gm, 'GET', `/v1/campaigns/${id}`)).invitees).toEqual([]);

    const types = (await events(id)).map((e) => [e.type, e.visibility ?? 'public', e.payload]);
    expect(types).toEqual(
      expect.arrayContaining([
        ['campaign.member_invited', 'gm_only', { userId: alice.id }],
        ['campaign.member_joined', 'public', { userId: alice.id, role: 'player', byInvitee: true }],
      ]),
    );
    expect(types.filter(([type]) => type === 'campaign.member_invited')).toHaveLength(1);
  });

  it('décliner, annuler : l’invité ou le MJ ; refus pour les autres', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [bob]);
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/invitees`, { userIds: [alice.id] });

    // Un joueur n'invite ni n'annule
    expect((await invite(bob, id, [alice.id])).statusCode).toBe(403);
    expect(
      (await h.request(bob, 'DELETE', `/v1/campaigns/${id}/invitees/${alice.id}`)).statusCode,
    ).toBe(403);

    // L'invitée décline
    expect(
      (await h.request(alice, 'DELETE', `/v1/campaigns/${id}/invitees/${alice.id}`)).statusCode,
    ).toBe(204);
    expect(
      (await h.request(alice, 'DELETE', `/v1/campaigns/${id}/invitees/${alice.id}`)).json(),
    ).toMatchObject({ status: 404, code: 'campaign_not_found' });
    // Plus d'invitation : la campagne privée reste fermée
    expect((await h.request(alice, 'POST', `/v1/campaigns/${id}/join`)).json()).toMatchObject({
      status: 404,
      code: 'campaign_not_found',
    });

    // Le MJ annule une invitation
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/invitees`, { userIds: [alice.id] });
    expect(
      (await h.request(gm, 'DELETE', `/v1/campaigns/${id}/invitees/${alice.id}`)).statusCode,
    ).toBe(204);
    expect(
      (await h.request(gm, 'DELETE', `/v1/campaigns/${id}/invitees/${alice.id}`)).statusCode,
    ).toBe(404);

    const removed = (await events(id)).filter((e) => e.type === 'campaign.invitee_removed');
    expect(removed.map((e) => [e.visibility, e.payload])).toEqual([
      ['gm_only', { userId: alice.id, declined: true }],
      ['gm_only', { userId: alice.id, declined: false }],
    ]);
  });

  it('refuse un banni, plafonne les invitations en attente', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    await h.ok(gm, 'DELETE', `/v1/campaigns/${id}/members/${alice.id}?ban=true`);
    expect((await invite(gm, id, [alice.id])).json()).toMatchObject({
      status: 409,
      code: 'user_banned',
    });

    const many = Array.from({ length: 20 }, () => crypto.randomUUID());
    for (let i = 0; i < 2; i++)
      await h.ok(gm, 'POST', `/v1/campaigns/${id}/invitees`, {
        userIds: many.map(() => crypto.randomUUID()),
      });
    expect((await invite(gm, id, many)).json()).toMatchObject({
      status: 409,
      code: 'too_many_invitees',
    });
    expect((await invite(gm, id, many.slice(0, 10))).statusCode).toBe(200);
  });

  it('rejoindre sans code : campagne publique, privée introuvable, banni refusé, déjà membre', async () => {
    const open = await h.ok<Campaign>(gm, 'POST', '/v1/campaigns', {
      name: 'Table ouverte',
      systemId: 'dnd-classic',
      isPublic: true,
    });
    const closed = await h.campaign(gm);

    const joined = await h.ok<Campaign>(alice, 'POST', `/v1/campaigns/${open.id}/join`);
    expect(joined).toMatchObject({ id: open.id, role: 'player' });
    // Déjà membre : la campagne est renvoyée, sans nouvel événement
    await h.ok(alice, 'POST', `/v1/campaigns/${open.id}/join`);
    const joins = (await events(open.id)).filter((e) => e.type === 'campaign.member_joined');
    expect(joins.map((e) => e.payload)).toEqual([
      { userId: alice.id, role: 'player', publicCampaign: true },
    ]);

    expect((await h.request(bob, 'POST', `/v1/campaigns/${closed}/join`)).json()).toMatchObject({
      status: 404,
      code: 'campaign_not_found',
    });
    expect(
      (await h.request(bob, 'POST', `/v1/campaigns/${crypto.randomUUID()}/join`)).statusCode,
    ).toBe(404);

    await h.ok(gm, 'DELETE', `/v1/campaigns/${open.id}/members/${alice.id}?ban=true`);
    expect((await h.request(alice, 'POST', `/v1/campaigns/${open.id}/join`)).json()).toMatchObject({
      status: 403,
      code: 'banned',
    });
  });

  it('rejoindre par code efface l’invitation nominative', async () => {
    const c = await h.ok<Campaign>(gm, 'POST', '/v1/campaigns', {
      name: 'La Table',
      systemId: 'dnd-classic',
    });
    await h.ok(gm, 'POST', `/v1/campaigns/${c.id}/invitees`, { userIds: [alice.id] });
    await h.ok(alice, 'POST', '/v1/campaigns/join', { code: c.code });
    expect(await h.ok(alice, 'GET', '/v1/campaigns/invited')).toEqual([]);
    expect((await h.ok<Campaign>(gm, 'GET', `/v1/campaigns/${c.id}`)).invitees).toEqual([]);
  });
});
