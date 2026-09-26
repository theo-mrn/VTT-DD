/**
 * Invitations : code aléatoire stocké haché, expiration, nombre
 * d'utilisations, adhésion comme joueur.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignInvitations } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import { hashCode } from './codes.js';

interface Invitation {
  code: string;
  url: string;
  expiresAt: string;
  maxUses: number;
}

describe.skipIf(!TEST_DATABASE_URL)('invitations', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  const join = (u: TestUser, code: string) => h.request(u, 'POST', '/v1/campaigns/join', { code });

  it('crée un lien, stocke seulement l’empreinte, fait rejoindre comme joueur', async () => {
    const id = await h.campaign(gm);
    const res = await h.request(gm, 'POST', `/v1/campaigns/${id}/invitations`, {
      expiresIn: 3600,
      maxUses: 5,
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const inv = res.json() as Invitation;
    expect(inv.code).toMatch(/^inv_[A-Za-z0-9_-]{27}$/);
    expect(inv.url).toBe(`https://jeu.test.local/join/${inv.code}`);
    expect(new Date(inv.expiresAt).getTime() - Date.now()).toBeGreaterThan(3500_000);
    expect(inv.maxUses).toBe(5);

    const [row] = await t
      .db!.select()
      .from(campaignInvitations)
      .where(eq(campaignInvitations.campaignId, id));
    expect(row!.codeHash).toBe(hashCode(inv.code));
    expect(JSON.stringify(row)).not.toContain(inv.code);

    const r = await join(alice, inv.code);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id, role: 'player' });
    // Déjà membre : la campagne est renvoyée sans consommer d'utilisation
    expect((await join(alice, inv.code)).statusCode).toBe(200);
    expect((await join(gm, inv.code)).json()).toMatchObject({ role: 'gm' });
    const [after] = await t
      .db!.select()
      .from(campaignInvitations)
      .where(eq(campaignInvitations.campaignId, id));
    expect(after!.uses).toBe(1);
  });

  it('refuse un code faux (404), expiré ou épuisé (410)', async () => {
    const id = await h.campaign(gm);
    for (const code of ['nimporte-quoi', `inv_${'A'.repeat(27)}`]) {
      const res = await join(alice, code);
      expect(res.statusCode, code).toBe(404);
    }

    const single = await h.ok<Invitation>(gm, 'POST', `/v1/campaigns/${id}/invitations`, {
      maxUses: 1,
    });
    expect((await join(alice, single.code)).statusCode).toBe(200);
    expect((await join(bob, single.code)).json()).toMatchObject({
      status: 410,
      code: 'invitation_exhausted',
    });

    const short = await h.ok<Invitation>(gm, 'POST', `/v1/campaigns/${id}/invitations`, {
      expiresIn: 60,
    });
    t.advance(61_000);
    expect((await join(bob, short.code)).json()).toMatchObject({
      status: 410,
      code: 'invitation_expired',
    });
    expect((await h.request(bob, 'GET', `/v1/campaigns/${id}`)).statusCode).toBe(404);
  });

  it('bornes : durée et utilisations limitées, MJ seulement', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    for (const body of [{ expiresIn: 10 }, { expiresIn: 31 * 86400 }, { maxUses: 0 }]) {
      expect(
        (await h.request(gm, 'POST', `/v1/campaigns/${id}/invitations`, body)).statusCode,
      ).toBe(400);
    }
    expect((await h.request(alice, 'POST', `/v1/campaigns/${id}/invitations`, {})).statusCode).toBe(
      403,
    );
    const byDefault = await h.ok<Invitation>(gm, 'POST', `/v1/campaigns/${id}/invitations`, {});
    expect(byDefault.maxUses).toBe(10);
  });

  it('deux adhésions simultanées ne dépassent pas le nombre d’utilisations', async () => {
    const id = await h.campaign(gm);
    const inv = await h.ok<Invitation>(gm, 'POST', `/v1/campaigns/${id}/invitations`, {
      maxUses: 1,
    });
    const statuses = (await Promise.all([join(alice, inv.code), join(bob, inv.code)]))
      .map((r) => r.statusCode)
      .sort();
    expect(statuses).toEqual([200, 410]);
  });
});
