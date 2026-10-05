import { describe, expect, it } from 'vitest';
import { fakeStripe } from '../test/fake-stripe.js';
import { priceResolver } from './prices.js';

describe('prix Stripe par lookup_key', () => {
  it('garde un prix cinq minutes, puis relit (nouveau prix de catalog:sync)', async () => {
    const stripe = fakeStripe();
    let now = 0;
    const price = priceResolver(stripe.api, () => now);
    expect(await price('dice_ruby')).toBe('price_dice_ruby');

    stripe.prices.set('dice_ruby', { ...stripe.prices.get('dice_ruby')!, id: 'price_nouveau' });
    expect(await price('dice_ruby')).toBe('price_dice_ruby');
    now += 5 * 60_000;
    expect(await price('dice_ruby')).toBe('price_nouveau');
  });

  it('prix absent : 503 catalog_not_synced', async () => {
    const price = priceResolver(fakeStripe().api);
    await expect(price('dice_inconnu')).rejects.toMatchObject({
      status: 503,
      code: 'catalog_not_synced',
    });
  });
});
