/**
 * E-mails de paiement, de l'événement Stripe à l'e-mail : le webhook écrit les
 * événements dans l'outbox (vrai PostgreSQL, faux Stripe), le consommateur les
 * transforme en e-mails (boîte aux lettres de test).
 */
import type { EventEnvelope } from '@vtt/contracts';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inbox } from '../db/schema.js';
import { signedEvent } from '../test/fake-stripe.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../test/test-app.js';
import { handleMailEvent } from './consumer.js';
import { testMailer } from './kourrier.js';

describe.skipIf(!TEST_DATABASE_URL)('e-mails de paiement', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let alice: TestUser;
  let mailer: ReturnType<typeof testMailer>;
  const handled: string[] = [];

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    alice = await t.user();
    mailer = testMailer();
  });

  afterEach(async () => {
    if (handled.length) await t.db!.delete(inbox).where(inArray(inbox.eventId, handled));
    handled.length = 0;
    await t.close();
  });

  /** Fait passer tous les événements d'Alice dans le consommateur ; renvoie les e-mails. */
  async function mails() {
    const events = (await t.events(alice.id)) as unknown as EventEnvelope[];
    for (const e of events) {
      handled.push(e.id);
      await handleMailEvent({ db: t.db!, mailer, appUrl: 'http://front.test' }, e);
    }
    return mailer.sent.map((m) => ({ to: m.to, template: m.template, data: m.data }));
  }

  async function subscribed() {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/subscribe', {
      plan: 'annual',
    });
    const session = t.stripe.pay(h.sessionIdOf(url));
    await t.deliver(signedEvent('checkout.session.completed', session));
    const sub = t.stripe.subscriptions.get(session.subscription as string)!;
    return { sub, customer: session.customer as string };
  }

  it('abonnement : bienvenue avec la facture, renouvellement, résiliation, fin', async () => {
    const { sub, customer } = await subscribed();
    const subscription = { subscription_details: { subscription: sub.id, metadata: {} } };
    const first = t.stripe.invoice(customer, {
      parent: subscription,
      billing_reason: 'subscription_create',
      amount_paid: 4990,
    });
    await t.deliver(signedEvent('invoice.paid', first));
    const renewal = t.stripe.invoice(customer, { parent: subscription, amount_paid: 4990 });
    await t.deliver(signedEvent('invoice.paid', renewal));
    await h.ok(alice, 'POST', '/v1/billing/subscription/cancel');
    const ended = t.stripe.updateSubscription(sub.id, { status: 'canceled' });
    await t.deliver(signedEvent('customer.subscription.deleted', ended));

    const sent = await mails();
    expect(sent.map((m) => m.template)).toEqual([
      'premium-active',
      'facture',
      'resiliation-programmee',
      'premium-termine',
    ]);
    expect(sent[0]).toEqual({
      to: 'joueur@yner.test',
      template: 'premium-active',
      data: {
        numero: first.number,
        lien_facture: first.hosted_invoice_url,
        lien_pdf: first.invoice_pdf,
        montant: '49,90 €',
        formule: 'annuel',
        prochaine_echeance: expect.stringMatching(/^\d{1,2} \S+ \d{4}$/),
        lien_abonnement: 'http://front.test/abonnement',
      },
    });
    expect(sent[2]!.data.date_fin).toMatch(/^\d{1,2} \S+ \d{4}$/);
    // Clé d'idempotence = id de l'événement : jamais deux fois le même e-mail
    expect(new Set(mailer.sent.map((m) => m.idempotencyKey)).size).toBe(4);
  });

  it('achat : confirmation avec la facture ; remboursement', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      itemId: 'ruby',
    });
    const session = t.stripe.pay(h.sessionIdOf(url));
    await t.deliver(signedEvent('checkout.session.completed', session));
    const invoice = t.stripe.invoice(session.customer as string, {
      billing_reason: 'manual',
      amount_paid: 250,
      lines: { data: [{ description: 'Dés : Rubis', period: { start: 0, end: 0 } }] },
    });
    await t.deliver(signedEvent('invoice.paid', invoice));
    const charge = t.stripe.chargeOf(session.payment_intent as string);
    t.stripe.charges.set(charge.id, { ...charge, refunded: true });
    await t.deliver(signedEvent('charge.refunded', charge));

    expect(await mails()).toEqual([
      expect.objectContaining({
        template: 'achat-confirme',
        data: expect.objectContaining({
          article: 'Dés : Rubis',
          montant: '2,50 €',
          lien_collection: 'http://front.test/des',
        }),
      }),
      expect.objectContaining({
        template: 'remboursement',
        data: { article: 'Dés : Rubis', montant: '2,50 €' },
      }),
    ]);
  });

  it('paiement échoué : lien pour régler la facture et prochaine tentative', async () => {
    const { sub, customer } = await subscribed();
    const failed = t.stripe.invoice(customer, {
      parent: { subscription_details: { subscription: sub.id, metadata: {} } },
      status: 'open',
      amount_due: 4990,
      amount_paid: 0,
      next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86400,
    });
    await t.deliver(signedEvent('invoice.payment_failed', failed));
    const sent = (await mails()).filter((m) => m.template === 'paiement-echoue');
    expect(sent).toEqual([
      expect.objectContaining({
        data: {
          montant: '49,90 €',
          lien_paiement: failed.hosted_invoice_url,
          prochaine_tentative: expect.stringMatching(/\d{4}$/),
          lien_abonnement: 'http://front.test/abonnement',
        },
      }),
    ]);
  });

  it('une seule fois par événement ; Kourrier en panne : relivré ; refus définitif : abandonné', async () => {
    await subscribed();
    const [event] = ((await t.events(alice.id)) as unknown as EventEnvelope[]).filter(
      (e) => e.type === 'billing.subscription_started',
    );
    // Démarrage sans facture : pas d'e-mail, mais événement consommé
    const deps = { db: t.db!, mailer, appUrl: 'http://front.test' };
    handled.push(event!.id);
    expect(await handleMailEvent(deps, event!)).toBe('none');
    expect(await handleMailEvent(deps, event!)).toBe('duplicate');

    await h.ok(alice, 'POST', '/v1/billing/subscription/cancel');
    const [cancel] = ((await t.events(alice.id)) as unknown as EventEnvelope[]).filter(
      (e) => e.type === 'billing.subscription_cancellation_scheduled',
    );
    handled.push(cancel!.id);
    mailer.fail(503);
    await expect(handleMailEvent(deps, cancel!)).rejects.toMatchObject({ retryable: true });
    expect(await handleMailEvent(deps, cancel!)).toBe('sent');
    expect(await handleMailEvent(deps, cancel!)).toBe('duplicate');
    expect(mailer.sent).toHaveLength(1);

    // Refus définitif (template absent…) : journalisé, abandonné, rien de relivré
    mailer.fail(422);
    const [scheduled] = ((await t.events(alice.id)) as unknown as EventEnvelope[]).filter(
      (e) => e.type === 'billing.subscription_cancellation_scheduled',
    );
    const copy = { ...scheduled!, id: crypto.randomUUID() };
    handled.push(copy.id);
    expect(await handleMailEvent(deps, copy)).toBe('rejected');
    expect(await handleMailEvent(deps, copy)).toBe('duplicate');
  });
});
