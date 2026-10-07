import { createService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { priceResolver } from './catalog/prices.js';
import type { BillingConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as checkout } from './modules/checkout/index.js';
import { register as codes } from './modules/codes/index.js';
import { register as connectModule } from './modules/connect/index.js';
import { register as invoices } from './modules/invoices/index.js';
import { register as plans } from './modules/plans/index.js';
import { register as subscription } from './modules/subscription/index.js';
import { register as webhook } from './modules/webhook/index.js';
import { stripeApi, type StripeApi } from './stripe/client.js';
import { connectApi, type ConnectApi } from './stripe/connect.js';

export async function buildBilling(
  config: BillingConfig,
  extra: Omit<ServiceOptions, 'config'> & {
    db?: Db;
    /** API Stripe simulée (tests) ; null : comme sans STRIPE_SECRET_KEY. */
    stripe?: StripeApi | null;
    /** Stripe Connect simulé (tests) ; null : comme sans STRIPE_SECRET_KEY. */
    connect?: ConnectApi | null;
  } = {},
) {
  const { db: providedDb, stripe, connect, ...options } = extra;
  if (!config.JWKS_URL && !options.authKeyResolver) {
    throw new Error('Configuration invalide : JWKS_URL est requis pour vérifier les jetons');
  }
  const connection = providedDb ? null : createDb(config.DATABASE_URL);
  const db = providedDb ?? connection!.db;

  const app = await createService({
    config,
    ...options,
    readiness: {
      postgres: async () => {
        await db.execute(sql`select 1`);
        return true;
      },
      ...options.readiness,
    },
    onShutdown: [...(options.onShutdown ?? []), async () => connection?.pool.end()],
  });

  const stripeApiOrNull = stripe === undefined ? defaultStripe(config.STRIPE_SECRET_KEY) : stripe;
  const deps: Deps = {
    config,
    db,
    stripe: stripeApiOrNull,
    prices: stripeApiOrNull ? priceResolver(stripeApiOrNull) : null,
    connect:
      connect === undefined
        ? config.STRIPE_SECRET_KEY
          ? connectApi(config.STRIPE_SECRET_KEY)
          : null
        : connect,
  };
  if (config.STRIPE_CONNECT === 'on' && !config.STRIPE_CONNECT_WEBHOOK_SECRET)
    app.log.warn('STRIPE_CONNECT_WEBHOOK_SECRET absent : comptes des créateurs non suivis');
  if (!deps.stripe)
    app.log.warn('STRIPE_SECRET_KEY absent : paiements désactivés (503 billing_unconfigured)');
  if (!config.STRIPE_WEBHOOK_SECRET)
    app.log.warn('STRIPE_WEBHOOK_SECRET absent : webhook Stripe désactivé (503)');

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [plans, checkout, subscription, invoices, codes, connectModule, webhook]) {
    await module(app, deps);
  }

  return app;
}

/** Client Stripe de la configuration ; null sans clé (paiements dormants). */
function defaultStripe(key: string | undefined) {
  return key ? stripeApi(key) : null;
}
