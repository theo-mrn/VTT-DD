/** Outils partagés par les routes du service. */
import { HttpError } from '@vtt/platform';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PriceResolver } from '../catalog/prices.js';
import { EffectFailed } from '../clients/effects.js';
import type { BillingConfig } from '../config.js';
import type { Deps } from '../deps.js';
import type { PaymentDeps } from '../payments/common.js';
import type { StripeApi } from '../stripe/client.js';

/**
 * Utilisateur connecté, pris du jeton (jamais du corps). Une clé d'API (rôle
 * « api ») ne touche pas aux paiements : une clé qui fuite ne résilie rien.
 */
export function currentUser(req: FastifyRequest): string {
  if (req.user!.roles.includes('api'))
    throw new HttpError(
      403,
      'Accès refusé',
      'api_key_forbidden',
      'Les paiements exigent une session, pas une clé d’API',
    );
  return req.user!.userId.toLowerCase();
}

export const eventContext = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

/** Stripe configuré, sinon 503 : le service tourne sans clés (dev local), sans paiement. */
export function requireStripe(deps: Deps): StripeApi {
  if (!deps.stripe)
    throw new HttpError(
      503,
      'Paiement indisponible',
      'billing_unconfigured',
      'Les paiements ne sont pas configurés sur ce serveur',
    );
  return deps.stripe;
}

/**
 * Page du front où revenir après Stripe : chemin relatif seulement (jamais
 * `//hôte` ni URL absolue), pour qu'aucun lien de paiement ne redirige ailleurs.
 */
export const ReturnUrl = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\s\\]*$/, 'Chemin relatif attendu (/…)')
  .default('/');

/** Achats et abonnements : quelques requêtes par minute et par IP suffisent. */
export const PAYMENT_RATE_LIMIT = {
  rateLimit: { max: 20, timeWindow: '1 minute' },
} as FastifyContextConfig;

/** Identifiant Stripe d'une ressource absente (session inconnue…). */
export const isMissing = (e: unknown) => (e as { code?: unknown })?.code === 'resource_missing';

/**
 * Appel à Stripe : une panne ou un refus de Stripe devient un 502 lisible,
 * journalisé sans données de paiement (le message d'erreur de Stripe seul).
 */
export async function callStripe<T>(req: FastifyRequest, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    // Refus déjà lisible, ou droits non appliqués (traité par l'appelant)
    if (e instanceof HttpError || e instanceof EffectFailed) throw e;
    req.log.warn(
      { stripe: { type: (e as { type?: string }).type, code: (e as { code?: string }).code } },
      'appel Stripe en échec',
    );
    throw new HttpError(
      502,
      'Paiement indisponible',
      'stripe_error',
      'Stripe ne répond pas, réessayez',
    );
  }
}

/** Date en secondes Unix (format de l'ancienne app pour cancelAt). */
export const unixSeconds = (d: Date | null | undefined) => (d ? Math.floor(d.getTime() / 1000) : 0);

/** Prix Stripe configurés, sinon 503 comme requireStripe. */
export function requirePrices(deps: Deps): PriceResolver {
  requireStripe(deps);
  return deps.prices!;
}

/** Ce dont les traitements de paiement ont besoin, Stripe compris (sinon 503). */
export function paymentDeps(deps: Deps): PaymentDeps {
  return { db: deps.db, stripe: requireStripe(deps), effects: deps.effects };
}

/** Pages du front au retour de Checkout (lot 4 : à ajouter à PAGES_FRONT). */
export const CHECKOUT_PAGES = { success: '/paiement/succes', cancel: '/paiement/annule' } as const;

/** URLs de retour de Checkout ; `returnUrl` : page où renvoyer ensuite l'utilisateur. */
export function checkoutUrls(config: BillingConfig, returnUrl: string) {
  const ret = encodeURIComponent(returnUrl);
  return {
    success_url: `${config.APP_URL}${CHECKOUT_PAGES.success}?session_id={CHECKOUT_SESSION_ID}&retour=${ret}`,
    cancel_url: `${config.APP_URL}${CHECKOUT_PAGES.cancel}?retour=${ret}`,
  };
}

/**
 * Réglages communs des sessions Checkout : adresse de facturation demandée si
 * nécessaire, TVA par Stripe Tax si STRIPE_TAX=on (l'adresse d'un client
 * existant est alors mise à jour depuis la session, exigé par Stripe).
 */
export function taxParams(config: BillingConfig, existingCustomer: boolean) {
  return {
    billing_address_collection: 'auto' as const,
    ...(config.STRIPE_TAX === 'on'
      ? {
          automatic_tax: { enabled: true },
          ...(existingCustomer
            ? { customer_update: { address: 'auto' as const, name: 'auto' as const } }
            : {}),
        }
      : {}),
  };
}

/**
 * Droits non appliqués dans dice ou identity (service en panne) : la base est
 * à jour, l'événement Stripe qui suit les réappliquera. La route répond quand même.
 */
export async function tolerateEffects(req: FastifyRequest, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (e) {
    if (!(e instanceof EffectFailed)) throw e;
    req.log.warn({ error: e.message }, 'droits non appliqués, repris au prochain événement Stripe');
  }
}
