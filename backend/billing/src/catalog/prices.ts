/**
 * Prix Stripe des articles et formules, retrouvés par leur lookup_key (créés
 * par catalog:sync). Gardés cinq minutes en mémoire : un nouveau prix poussé
 * par catalog:sync est pris en compte sans redémarrage.
 */
import { HttpError } from '@vtt/platform';
import type { StripeApi } from '../stripe/client.js';

const TTL_MS = 5 * 60_000;

export type PriceResolver = (lookupKey: string) => Promise<string>;

export function priceResolver(stripe: StripeApi, now = () => Date.now()): PriceResolver {
  const cache = new Map<string, { id: string; at: number }>();
  return async (lookupKey) => {
    const hit = cache.get(lookupKey);
    if (hit && now() - hit.at < TTL_MS) return hit.id;
    const [price] = await stripe.pricesByLookupKeys([lookupKey]);
    if (!price)
      throw new HttpError(
        503,
        'Paiement indisponible',
        'catalog_not_synced',
        `Prix ${lookupKey} absent chez Stripe : lancer catalog:sync`,
      );
    cache.set(lookupKey, { id: price.id, at: now() });
    return price.id;
  };
}
