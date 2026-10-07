import { HttpError } from '@vtt/platform';
import { describe, expect, it, vi } from 'vitest';
import { billingCheckout } from './billing.js';
import { campaignRights } from './campaign.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const SECRET = 's'.repeat(32);
const SALE = {
  buyerId: '0192a0e0-0000-7000-8000-000000000001',
  sellerId: '0192a0e0-0000-7000-8000-000000000002',
  listingId: '0192a0e0-0000-7000-8000-000000000003',
  title: 'Tavernes',
  priceCents: 499,
  currency: 'eur' as const,
  returnUrl: '/marketplace/tavernes',
};

describe('droits demandés à campaign', () => {
  it('secret interne, cache court, panne sans droit ouvert', async () => {
    let now = 0;
    const fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['x-internal-secret']).toBe(SECRET);
      return json({ member: true, role: 'gm' });
    });
    const rights = campaignRights({
      url: 'http://campaign.test',
      secret: SECRET,
      cacheMs: 5_000,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => now,
    });
    expect(await rights.role('c1', 'u1')).toBe('gm');
    expect(await rights.role('c1', 'u1')).toBe('gm');
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 6_000;
    await rights.role('c1', 'u1');
    expect(fetch).toHaveBeenCalledTimes(2);

    const down = campaignRights({
      url: 'http://campaign.test',
      secret: SECRET,
      cacheMs: 5_000,
      fetch: (async () => json({}, 500)) as unknown as typeof globalThis.fetch,
    });
    await expect(down.role('c1', 'u1')).rejects.toMatchObject({ code: 'campaign_unavailable' });

    const stranger = campaignRights({
      url: 'http://campaign.test',
      secret: SECRET,
      cacheMs: 0,
      fetch: (async () =>
        json({ member: false, role: null })) as unknown as typeof globalThis.fetch,
    });
    expect(await stranger.role('c1', 'u1')).toBeNull();
  });
});

describe('sessions de vente demandées à billing', () => {
  it('rend l’adresse de Stripe', async () => {
    const fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe('http://billing.test/internal/marketplace/checkout');
      expect(JSON.parse(String(init?.body))).toEqual(SALE);
      return json({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
    });
    const billing = billingCheckout({
      url: 'http://billing.test',
      secret: SECRET,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(await billing.checkout(SALE)).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
  });

  it('transmet un refus métier, change une panne en 503', async () => {
    const refusal = billingCheckout({
      url: 'http://billing.test',
      secret: SECRET,
      fetch: (async () =>
        json(
          { title: 'Vendeur', code: 'seller_not_ready', detail: 'Pas prêt' },
          409,
        )) as unknown as typeof globalThis.fetch,
    });
    const err = await refusal.checkout(SALE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 409, code: 'seller_not_ready' });

    const down = billingCheckout({
      url: 'http://billing.test',
      secret: SECRET,
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof globalThis.fetch,
    });
    await expect(down.checkout(SALE)).rejects.toMatchObject({ code: 'billing_unavailable' });

    const unauthorized = billingCheckout({
      url: 'http://billing.test',
      secret: SECRET,
      fetch: (async () =>
        json({ code: 'unauthorized' }, 401)) as unknown as typeof globalThis.fetch,
    });
    await expect(unauthorized.checkout(SALE)).rejects.toMatchObject({
      code: 'billing_unavailable',
    });
  });
});
