/** Outils partagés par les routes du service. */
import { HttpError } from '@vtt/platform';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
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
    if (e instanceof HttpError) throw e;
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
