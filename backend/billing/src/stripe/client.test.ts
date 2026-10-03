import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { signedEvent, subscriptionObject, WEBHOOK_SECRET } from '../test/fake-stripe.js';
import { cancellationDate, idOf, periodEnd, verifyWebhook } from './client.js';

describe('signature du webhook (sans réseau)', () => {
  it('accepte le corps brut signé, refuse le reste', () => {
    const e = signedEvent('checkout.session.completed', { id: 'cs_test_1' });
    const sig = e.headers['stripe-signature'];
    const event = verifyWebhook(Buffer.from(e.payload), sig, WEBHOOK_SECRET);
    expect(event).toMatchObject({ id: e.id, type: 'checkout.session.completed' });

    expect(() => verifyWebhook(Buffer.from(e.payload), sig, 'whsec_autre')).toThrow();
    expect(() =>
      verifyWebhook(Buffer.from(e.payload.replace('cs_test_1', 'cs_test_2')), sig, WEBHOOK_SECRET),
    ).toThrow();
    expect(() => verifyWebhook(Buffer.from(e.payload), 't=1,v1=abc', WEBHOOK_SECRET)).toThrow();
  });

  it('refuse une signature trop ancienne (rejeu au-delà de 5 minutes)', () => {
    const payload = JSON.stringify({ id: 'evt_test_vieux', object: 'event', type: 'x' });
    const old = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(() => verifyWebhook(Buffer.from(payload), old, WEBHOOK_SECRET)).toThrow();
  });
});

describe('lecture des objets Stripe', () => {
  it('fin de période et date de résiliation', () => {
    const sub = subscriptionObject('sub_1', 'cus_1');
    expect(periodEnd(sub)).toBeGreaterThan(Date.now() / 1000);
    expect(cancellationDate(sub)).toBeNull();
    const end = periodEnd(sub)!;
    expect(cancellationDate({ ...sub, cancel_at_period_end: true })).toEqual(new Date(end * 1000));
    expect(cancellationDate({ ...sub, cancel_at: 1_800_000_000 })).toEqual(
      new Date(1_800_000_000_000),
    );
    // Ancienne forme (current_period_end sur l'abonnement)
    const legacy = { ...sub, items: { data: [] }, current_period_end: 1_700_000_000 } as never;
    expect(periodEnd(legacy)).toBe(1_700_000_000);
  });

  it('identifiant d’un objet développé ou non', () => {
    expect(idOf('cus_1')).toBe('cus_1');
    expect(idOf({ id: 'cus_2' })).toBe('cus_2');
    expect(idOf(null)).toBeNull();
  });
});
