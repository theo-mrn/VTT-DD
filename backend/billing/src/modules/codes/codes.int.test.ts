/**
 * Codes, sur un vrai PostgreSQL (rôle billing_svc) : création, échange
 * (premium à durée limitée, skin, cadre), refus sans consommer le code,
 * expiration par la tâche horaire, abonnement et achat encore possibles.
 */
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeRedemptions, codes, entitlements } from '../../db/schema.js';
import { createCode, expireEntitlements, normalizeCode } from '../../payments/codes.js';
import { grant } from '../../payments/entitlements.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('codes', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let alice: TestUser;
  let bob: TestUser;
  const created: string[] = [];

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    alice = await t.user();
    bob = await t.user();
  });

  afterEach(async () => {
    const mine = created.splice(0);
    if (mine.length) {
      await t.db!.delete(codeRedemptions).where(inArray(codeRedemptions.code, mine));
      await t.db!.delete(codes).where(inArray(codes.code, mine));
    }
    await t.close();
  });

  const make = async (
    ...args: Parameters<typeof createCode> extends [unknown, infer C] ? [C] : never
  ) => {
    const code = await createCode(t.db!, args[0]);
    created.push(normalizeCode(code));
    return code;
  };
  const redeem = (u: TestUser, code: string) =>
    h.request(u, 'POST', '/v1/billing/codes/redeem', { code });
  const status = async (u: TestUser, code: string) => {
    const res = await redeem(u, code);
    return [res.statusCode, res.json().code];
  };

  it('premium 30 jours : droit daté, premium dans /me, une utilisation par compte', async () => {
    const code = await make({ reward: { kind: 'premium', days: 30 }, maxUses: 2 });
    expect(code).toMatch(/^YNER-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Saisie souple : minuscules, espaces, sans tirets
    const res = await redeem(alice, ` ${code.toLowerCase().replaceAll('-', ' ')} `);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ kind: 'premium', itemId: null });
    const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({
      premium: true,
      premiumSource: 'code',
      premiumUntil: body.expiresAt,
      subscription: null,
    });
    expect((await t.rights(alice.id)).at(-1)).toMatchObject({ premium: true });
    expect(await status(alice, code)).toEqual([409, 'code_already_redeemed']);

    expect((await redeem(bob, code)).statusCode).toBe(200);
    const carol = await t.user();
    expect(await status(carol, code)).toEqual([409, 'code_exhausted']);
  });

  it('refus sans consommer le code : inconnu, expiré, déjà premium, déjà possédé', async () => {
    expect(await status(alice, 'PAS-UN-CODE')).toEqual([404, 'code_invalid']);
    expect(await status(alice, '---')).toEqual([404, 'code_invalid']);

    const old = await make({
      reward: { kind: 'premium', days: 7 },
      validUntil: new Date(Date.now() - 1000),
    });
    expect(await status(alice, old)).toEqual([409, 'code_expired']);

    const premium = await make({ reward: { kind: 'premium', days: 7 } });
    await grant(t.db!, { userId: alice.id, kind: 'premium', source: 'gift' });
    expect(await status(alice, premium)).toEqual([409, 'already_premium']);

    const skin = await make({ reward: { kind: 'dice_skin', itemId: 'ruby' } });
    await grant(t.db!, { userId: bob.id, kind: 'dice_skin', itemId: 'ruby', source: 'purchase' });
    expect(await status(bob, skin)).toEqual([409, 'already_owned']);

    const [row] = await t
      .db!.select()
      .from(codes)
      .where(eq(codes.code, normalizeCode(premium)));
    expect(row!.uses).toBe(0);
    // Le code refusé sert encore à un autre
    expect((await redeem(bob, premium)).statusCode).toBe(200);
  });

  it('skin et cadre : à vie, publiés, cadre visible dans token-frames', async () => {
    const chosen = `discord-${Date.now()}`;
    const skin = await make({ reward: { kind: 'dice_skin', itemId: 'bismuth' }, code: chosen });
    expect(skin).toBe(chosen);
    expect((await redeem(alice, chosen.toUpperCase().replace('-', ''))).json()).toEqual({
      kind: 'dice_skin',
      itemId: 'bismuth',
      expiresAt: null,
    });
    const frame = await make({ reward: { kind: 'token_frame', itemId: 'Token5' } });
    expect((await redeem(alice, frame)).statusCode).toBe(200);

    expect((await t.rights(alice.id)).at(-1)).toMatchObject({
      premium: false,
      diceSkins: ['bismuth'],
      tokenFrames: ['Token5'],
    });
    const frames = await h.ok<{ frames: { id: string; owned: boolean }[] }>(
      alice,
      'GET',
      '/v1/billing/token-frames',
    );
    expect(frames.frames.find((f) => f.id === 'Token5')?.owned).toBe(true);
  });

  it('création refusée : article inconnu ou gratuit, durée nulle, code déjà pris', async () => {
    await expect(
      createCode(t.db!, { reward: { kind: 'dice_skin', itemId: 'nope' } }),
    ).rejects.toThrow('Article inconnu');
    await expect(
      createCode(t.db!, { reward: { kind: 'dice_skin', itemId: 'gold' } }),
    ).rejects.toThrow('gratuit');
    await expect(createCode(t.db!, { reward: { kind: 'premium', days: 0 } })).rejects.toThrow(
      'Durée',
    );
    const code = await make({ reward: { kind: 'premium', days: 3 } });
    await expect(createCode(t.db!, { reward: { kind: 'premium', days: 3 }, code })).rejects.toThrow(
      'existe déjà',
    );
  });

  it('expiration : premium retiré, droits republiés, une seule fois', async () => {
    const code = await make({ reward: { kind: 'premium', days: 30 } });
    await redeem(alice, code);
    expect(await expireEntitlements(t.db!)).toBe(0);

    const later = new Date(Date.now() + 31 * 86_400_000);
    expect(await expireEntitlements(t.db!, later)).toBeGreaterThanOrEqual(1);
    expect(await expireEntitlements(t.db!, later)).toBe(0);
    const [e] = await t.db!.select().from(entitlements).where(eq(entitlements.userId, alice.id));
    expect(e).toMatchObject({ source: 'code', revokeReason: 'expired' });
    expect((await t.rights(alice.id)).at(-1)).toMatchObject({ premium: false });
    expect((await t.events(alice.id)).map((x) => x.type)).toContain('billing.premium_deactivated');
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
  });

  it('premium d’un code : abonnement et achat d’un skin restent possibles', async () => {
    const code = await make({ reward: { kind: 'premium', days: 30 } });
    await redeem(alice, code);
    expect(
      (await h.request(alice, 'POST', '/v1/billing/subscribe', { plan: 'monthly' })).statusCode,
    ).toBe(200);
    expect(
      (await h.request(alice, 'POST', '/v1/billing/checkout', { itemId: 'ruby' })).statusCode,
    ).toBe(200);
  });
});
