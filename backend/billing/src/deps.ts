/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { PriceResolver } from './catalog/prices.js';
import type { BillingConfig } from './config.js';
import type { Db } from './db/client.js';
import type { StripeApi } from './stripe/client.js';
import type { ConnectApi } from './stripe/connect.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: BillingConfig;
  db: Db;
  /** API Stripe ; null sans STRIPE_SECRET_KEY (routes de paiement : 503 billing_unconfigured). */
  stripe: StripeApi | null;
  /** Prix Stripe par lookup_key ; null sans Stripe. */
  prices: PriceResolver | null;
  /** Stripe Connect (comptes des créateurs de la marketplace) ; null sans Stripe. */
  connect: ConnectApi | null;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
