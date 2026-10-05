/**
 * Pousse le catalogue du dépôt dans Stripe : un produit par article et pour
 * le premium (identifiant fixe yner_…), un prix par article et par formule,
 * retrouvé par sa lookup_key. Rejouable : seul ce qui diffère est écrit.
 *
 * Commande : sync-cli.ts (pnpm --filter @vtt/billing catalog:sync [--apply]).
 *
 * Un prix Stripe est immuable : un montant changé crée un nouveau prix qui
 * reprend la lookup_key (transfer_lookup_key) ; l'ancien est archivé, les
 * abonnés existants le gardent. Tous les prix sont TTC (tax_behavior inclusive).
 */
import type Stripe from 'stripe';
import {
  CURRENCY,
  lineName,
  lookupKeyOf,
  PLANS,
  PREMIUM,
  productIdOf,
  SOLD_ITEMS,
} from './catalog.js';

export interface ProductSpec {
  id: string;
  name: string;
  description?: string;
  images?: string[];
}

export interface PriceSpec {
  lookupKey: string;
  productId: string;
  amount: number;
  interval?: 'month' | 'year';
  nickname: string;
}

/** Ce que Stripe doit contenir, d'après le catalogue du dépôt. */
export function desiredCatalog(): { products: ProductSpec[]; prices: PriceSpec[] } {
  const products: ProductSpec[] = [
    { id: PREMIUM.productId, name: PREMIUM.name, description: PREMIUM.description },
  ];
  const prices: PriceSpec[] = Object.values(PLANS).map((p) => ({
    lookupKey: p.lookupKey,
    productId: PREMIUM.productId,
    amount: p.amount,
    interval: p.interval,
    nickname: `Premium ${p.name.toLowerCase()}`,
  }));
  for (const item of SOLD_ITEMS) {
    products.push({
      id: productIdOf(item),
      name: lineName(item),
      ...(item.description ? { description: item.description } : {}),
      ...(item.image ? { images: [item.image] } : {}),
    });
    prices.push({
      lookupKey: lookupKeyOf(item),
      productId: productIdOf(item),
      amount: item.price,
      nickname: lineName(item),
    });
  }
  return { products, prices };
}

/** Le prix existant correspond-il à la spécification ? */
export function priceMatches(price: Stripe.Price, spec: PriceSpec): boolean {
  const product = typeof price.product === 'string' ? price.product : price.product.id;
  return (
    price.active &&
    product === spec.productId &&
    price.unit_amount === spec.amount &&
    price.currency === CURRENCY &&
    price.tax_behavior === 'inclusive' &&
    (price.recurring?.interval ?? undefined) === spec.interval
  );
}

/** Le produit existant a-t-il besoin d'une mise à jour ? */
export function productDiffers(product: Stripe.Product, spec: ProductSpec): boolean {
  return (
    !product.active ||
    product.name !== spec.name ||
    (product.description ?? undefined) !== spec.description ||
    JSON.stringify(product.images ?? []) !== JSON.stringify(spec.images ?? [])
  );
}
