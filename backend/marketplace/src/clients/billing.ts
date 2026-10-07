/**
 * Sessions de vente (Stripe Checkout) demandées à billing, seul service qui parle à Stripe
 * (POST /internal/marketplace/checkout, secret partagé ; docs/marketplace.md § 5.3).
 *
 * Les refus de billing (vendeur pas prêt, vente coupée…) sont rendus tels quels à l'appelant
 * avec leur code ; une panne donne 503 billing_unavailable.
 */
import type { MarketplaceCheckoutRequest } from '@vtt/contracts';
import { HttpError, INTERNAL_SECRET_HEADER } from '@vtt/platform';
import { z } from 'zod';
import { unavailable } from './errors.js';

export interface BillingCheckout {
  checkout(r: MarketplaceCheckoutRequest): Promise<{ url: string }>;
}

const TIMEOUT_MS = 10_000;
const Response = z.object({ url: z.string().url() });
const Problem = z.object({
  title: z.string().optional(),
  code: z.string().optional(),
  detail: z.string().optional(),
});

/** Sans billing configuré : pas de vente. */
export const noBilling: BillingCheckout = {
  checkout: async () => {
    throw unavailable('billing');
  },
};

export function billingCheckout(o: {
  url: string;
  secret: string;
  fetch?: typeof globalThis.fetch;
  onError?: (error: unknown) => void;
}): BillingCheckout {
  const doFetch = o.fetch ?? globalThis.fetch;
  return {
    async checkout(r) {
      let res: globalThis.Response;
      try {
        res = await doFetch(new URL('/internal/marketplace/checkout', o.url), {
          method: 'POST',
          headers: { [INTERNAL_SECRET_HEADER]: o.secret, 'content-type': 'application/json' },
          body: JSON.stringify(r),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        o.onError?.(error);
        throw unavailable('billing');
      }
      const body: unknown = await res.json().catch(() => ({}));
      if (res.ok) {
        const parsed = Response.safeParse(body);
        if (parsed.success) return parsed.data;
        o.onError?.(new Error('réponse de billing illisible'));
        throw unavailable('billing');
      }
      const p = Problem.safeParse(body);
      // Refus métier (4xx avec un code) : transmis ; le reste est une panne
      if (res.status >= 400 && res.status < 500 && res.status !== 401 && p.data?.code)
        throw new HttpError(
          res.status,
          p.data.title ?? 'Vente impossible',
          p.data.code,
          p.data.detail,
        );
      o.onError?.(new Error(`billing a répondu ${res.status}`));
      throw unavailable('billing');
    },
  };
}
