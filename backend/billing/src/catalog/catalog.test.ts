import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { findItem, itemOf, lineName, PLANS, planOfLookupKey, TOKEN_PREFIX } from './catalog.js';
import { DICE_ITEMS, TOKEN_ITEMS } from './items.js';
import { desiredCatalog, priceMatches, productDiffers } from './sync.js';

describe('catalogue de la boutique', () => {
  it('reprend les prix de l’ancienne app', () => {
    expect(findItem('bismuth')).toMatchObject({ kind: 'dice', price: 500 });
    expect(findItem('ruby')).toMatchObject({
      kind: 'dice',
      price: 250,
      image: 'https://assets.yner.fr/textures/rubis_diffuse.jpg',
    });
    expect(findItem(`${TOKEN_PREFIX}Token3`)).toMatchObject({ kind: 'token', price: 399 });
    expect(itemOf('token', 'Token7')).toMatchObject({ name: 'Cadre Céleste', price: 399 });
    expect(lineName(findItem('ruby')!)).toBe('Dés : Rubis');
    expect(lineName(findItem('token_Token4')!)).toBe('Cadre : Cadre Sanguin');
  });

  it('ne vend pas les articles gratuits ni inconnus', () => {
    for (const id of ['gold', 'silver', 'pierre_donjon', 'steampunk_copper'])
      expect(findItem(id)?.price).toBe(0);
    expect(findItem('token_Token1')?.price).toBe(0);
    expect(findItem('Token3')).toBeUndefined();
    expect(findItem('inconnu')).toBeUndefined();
    expect(findItem('token_')).toBeUndefined();
  });

  it('a des identifiants uniques et des prix entiers en centimes', () => {
    for (const list of [DICE_ITEMS, TOKEN_ITEMS]) {
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
      for (const i of list) {
        expect(Number.isInteger(i.price) && i.price >= 0).toBe(true);
        expect(i.id).toMatch(/^[A-Za-z0-9_]{1,64}$/);
      }
    }
    expect(DICE_ITEMS).toHaveLength(71);
  });
});

describe('catalogue chez Stripe', () => {
  it('formules premium : prix TTC et lookup_key', () => {
    expect(PLANS.monthly).toMatchObject({
      amount: 499,
      interval: 'month',
      lookupKey: 'premium_monthly',
    });
    expect(PLANS.annual).toMatchObject({
      amount: 4990,
      interval: 'year',
      lookupKey: 'premium_annual',
    });
    expect(planOfLookupKey('premium_annual')).toBe('annual');
    expect(planOfLookupKey(null)).toBe('legacy');
    expect(planOfLookupKey('dice_ruby')).toBe('legacy');
  });

  it('un produit et un prix par article payant, plus le premium', () => {
    const { products, prices } = desiredCatalog();
    const sold = [...DICE_ITEMS, ...TOKEN_ITEMS].filter((i) => i.price > 0);
    expect(products).toHaveLength(sold.length + 1);
    expect(prices).toHaveLength(sold.length + 2);
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    expect(new Set(prices.map((p) => p.lookupKey)).size).toBe(prices.length);
    expect(prices).toContainEqual({
      lookupKey: 'dice_ruby',
      productId: 'yner_dice_ruby',
      amount: 250,
      nickname: 'Dés : Rubis',
    });
    expect(products).toContainEqual(
      expect.objectContaining({ id: 'yner_token_Token3', name: 'Cadre : Cadre Doré' }),
    );
    expect(prices.find((p) => p.lookupKey === 'premium_annual')).toMatchObject({
      productId: 'yner_premium',
      interval: 'year',
    });
    // Identifiants de produits acceptés par Stripe
    for (const p of products) expect(p.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('écart avec Stripe : montant, archivage, TVA incluse, produit modifié', () => {
    const spec = { lookupKey: 'dice_ruby', productId: 'yner_dice_ruby', amount: 250, nickname: '' };
    const price = {
      active: true,
      product: 'yner_dice_ruby',
      unit_amount: 250,
      currency: 'eur',
      tax_behavior: 'inclusive',
      recurring: null,
    } as never as Stripe.Price;
    expect(priceMatches(price, spec)).toBe(true);
    expect(priceMatches({ ...price, unit_amount: 300 }, spec)).toBe(false);
    expect(priceMatches({ ...price, active: false }, spec)).toBe(false);
    expect(priceMatches({ ...price, tax_behavior: 'exclusive' }, spec)).toBe(false);
    expect(priceMatches({ ...price, recurring: { interval: 'month' } } as never, spec)).toBe(false);

    const product = {
      active: true,
      name: 'Dés : Rubis',
      description: 'x',
      images: [],
    } as never as Stripe.Product;
    expect(productDiffers(product, { id: 'p', name: 'Dés : Rubis', description: 'x' })).toBe(false);
    expect(productDiffers(product, { id: 'p', name: 'Dés : Rubis', description: 'y' })).toBe(true);
    expect(
      productDiffers(
        { ...product, active: false },
        { id: 'p', name: 'Dés : Rubis', description: 'x' },
      ),
    ).toBe(true);
  });
});
