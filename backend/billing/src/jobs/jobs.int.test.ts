/** Tâches planifiées, sur un vrai PostgreSQL (rôle billing_svc) et un faux Stripe. */
import type { EventEnvelope } from '@vtt/contracts';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobRuns, renewalReminders, subscriptions } from '../db/schema.js';
import { mailFor } from '../mails/messages.js';
import { signedEvent } from '../test/fake-stripe.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../test/test-app.js';
import { claimDaily, reconcile, remindRenewals } from './jobs.js';

describe.skipIf(!TEST_DATABASE_URL)('tâches planifiées', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let alice: TestUser;
  const subs: string[] = [];

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    alice = await t.user();
  });

  afterEach(async () => {
    if (subs.length)
      await t.db!.delete(renewalReminders).where(inArray(renewalReminders.subscriptionId, subs));
    subs.length = 0;
    await t.close();
  });

  async function subscribed(plan: 'monthly' | 'annual') {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/subscribe', { plan });
    const session = t.stripe.pay(h.sessionIdOf(url));
    await t.deliver(signedEvent('checkout.session.completed', session));
    subs.push(session.subscription as string);
    return session.subscription as string;
  }

  it('une tâche quotidienne ne tourne qu’une fois par jour', async () => {
    const name = `test-${crypto.randomUUID()}`;
    try {
      expect(await claimDaily(t.db!, name)).toBe(true);
      expect(await claimDaily(t.db!, name)).toBe(false);
      // Dernier passage hier : de nouveau disponible
      await t
        .db!.update(jobRuns)
        .set({ lastRunAt: new Date(Date.now() - 2 * 86_400_000) })
        .where(eq(jobRuns.name, name));
      expect(await claimDaily(t.db!, name)).toBe(true);
    } finally {
      await t.db!.delete(jobRuns).where(eq(jobRuns.name, name));
    }
  });

  it('réconciliation : un abonnement terminé sans webhook est rattrapé', async () => {
    const id = await subscribed('monthly');
    // Fin chez Stripe, webhook perdu
    t.stripe.updateSubscription(id, { status: 'canceled' });
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(true);

    const r = await reconcile({ db: t.db!, stripe: t.stripe.api });
    expect(r.failed).toBe(0);
    expect(r.checked).toBeGreaterThanOrEqual(1);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
    expect((await t.events(alice.id)).map((e) => e.type)).toContain('billing.subscription_ended');
  });

  it('rappel de reconduction : annuel seulement, dans la fenêtre, une fois par échéance', async () => {
    const annual = await subscribed('annual');
    const in40Days = new Date(Date.now() + 40 * 86_400_000);
    await t
      .db!.update(subscriptions)
      .set({ currentPeriodEnd: in40Days })
      .where(eq(subscriptions.id, annual));

    expect(await remindRenewals(t.db!)).toBeGreaterThanOrEqual(1);
    expect(await remindRenewals(t.db!)).toBe(0);
    const due = (await t.events(alice.id)).filter((e) => e.type === 'billing.renewal_reminder_due');
    expect(due).toHaveLength(1);
    expect(due[0]!.payload).toMatchObject({
      subscriptionId: annual,
      renewalDate: in40Days.toISOString(),
      amountCents: 4990,
    });

    const mail = await mailFor(t.db!, 'http://front.test', due[0] as unknown as EventEnvelope);
    expect(mail).toMatchObject({
      template: 'rappel-reconduction',
      data: { montant: '49,90 €', lien_abonnement: 'http://front.test/profil/abonnement' },
    });

    // Résilié : plus de rappel à la prochaine échéance
    await h.ok(alice, 'POST', '/v1/billing/subscription/cancel');
    await t
      .db!.update(subscriptions)
      .set({ currentPeriodEnd: new Date(Date.now() + 35 * 86_400_000) })
      .where(eq(subscriptions.id, annual));
    await remindRenewals(t.db!);
    expect(
      (await t.events(alice.id)).filter((e) => e.type === 'billing.renewal_reminder_due'),
    ).toHaveLength(1);
  });
});
