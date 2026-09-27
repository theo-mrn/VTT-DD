import { describe, expect, it } from 'vitest';
import { transformCustomer } from './transform.js';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const doc = (data: Record<string, unknown>) => ({ path: 'users/u1', id: 'u1', data });

describe('transformCustomer (users/{uid} de l’ancienne app)', () => {
  it('abonné Stripe : client, abonnement, date de début', () => {
    expect(
      transformCustomer(
        doc({
          premium: true,
          stripeCustomerId: 'cus_ABC123',
          stripeSubscriptionId: 'sub_XYZ789',
          premiumSince: '2026-01-15T10:00:00.000Z',
          name: 'ignoré',
        }),
        NOW,
      ),
    ).toEqual({
      uid: 'u1',
      stripeCustomerId: 'cus_ABC123',
      subscriptionId: 'sub_XYZ789',
      premium: true,
      premiumSince: new Date('2026-01-15T10:00:00.000Z'),
      cancelAtPeriodEnd: false,
      premiumEndDate: null,
      warnings: [],
    });
  });

  it('premium accordé à la main (sans Stripe) ; échéance 0 : sans échéance', () => {
    expect(transformCustomer(doc({ premium: true, premiumEndDate: 0 }), NOW)).toMatchObject({
      stripeCustomerId: null,
      subscriptionId: null,
      premium: true,
      premiumSince: null,
    });
  });

  it('résilié en fin de période : échéance en secondes reprise', () => {
    const end = Math.floor(NOW / 1000) + 3600;
    expect(
      transformCustomer(
        doc({
          premium: true,
          stripeCustomerId: 'cus_A',
          cancelAtPeriodEnd: true,
          premiumEndDate: end,
        }),
        NOW,
      ),
    ).toMatchObject({
      premium: true,
      cancelAtPeriodEnd: true,
      premiumEndDate: new Date(end * 1000),
    });
    // Drapeau de résiliation sans date : ignoré (la table exige la date)
    expect(transformCustomer(doc({ premium: true, cancelAtPeriodEnd: true }), NOW)).toMatchObject({
      cancelAtPeriodEnd: false,
      warnings: ['Résiliation sans date de fin : ignorée'],
    });
  });

  it('premium échu : client gardé sans premium ; ni premium ni client : rien', () => {
    const past = Math.floor(NOW / 1000) - 60;
    expect(
      transformCustomer(
        doc({
          premium: true,
          stripeCustomerId: 'cus_A',
          stripeSubscriptionId: 'sub_A',
          premiumEndDate: past,
        }),
        NOW,
      ),
    ).toMatchObject({ premium: false, subscriptionId: null, stripeCustomerId: 'cus_A' });
    expect(transformCustomer(doc({ premium: true, premiumEndDate: past }), NOW)).toBeNull();
    expect(transformCustomer(doc({ premium: false }), NOW)).toBeNull();
    expect(transformCustomer(doc({}), NOW)).toBeNull();
  });

  it('identifiants Stripe illisibles : ignorés avec un avertissement', () => {
    const c = transformCustomer(
      doc({ premium: true, stripeCustomerId: 'pas-un-client', stripeSubscriptionId: 42 }),
      NOW,
    );
    expect(c).toMatchObject({ stripeCustomerId: null, subscriptionId: null, premium: true });
    expect(c!.warnings).toEqual(['Client Stripe illisible : ignoré']);
    expect(
      transformCustomer(doc({ premium: true, stripeSubscriptionId: 'x' }), NOW)!.warnings,
    ).toEqual(['Abonnement Stripe illisible : ignoré']);
  });
});
