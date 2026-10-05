import { createService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { priceResolver } from './catalog/prices.js';
import { httpEffects, type Effects } from './clients/effects.js';
import type { BillingConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as checkout } from './modules/checkout/index.js';
import { register as invoices } from './modules/invoices/index.js';
import { register as plans } from './modules/plans/index.js';
import { register as subscription } from './modules/subscription/index.js';
import { register as webhook } from './modules/webhook/index.js';
import { stripeApi, type StripeApi } from './stripe/client.js';

export async function buildBilling(
  config: BillingConfig,
  extra: Omit<ServiceOptions, 'config'> & {
    db?: Db;
    /** API Stripe simulée (tests) ; null : comme sans STRIPE_SECRET_KEY. */
    stripe?: StripeApi | null;
    effects?: Effects;
  } = {},
) {
  const { db: providedDb, stripe, effects, ...options } = extra;
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
    effects:
      effects ??
      httpEffects({
        diceUrl: config.DICE_URL,
        identityUrl: config.IDENTITY_URL,
        secret: config.INTERNAL_API_SECRET,
      }),
  };
  if (!deps.stripe)
    app.log.warn('STRIPE_SECRET_KEY absent : paiements désactivés (503 billing_unconfigured)');
  if (!config.STRIPE_WEBHOOK_SECRET)
    app.log.warn('STRIPE_WEBHOOK_SECRET absent : webhook Stripe désactivé (503)');
  if (!config.INTERNAL_API_SECRET || !config.DICE_URL || !config.IDENTITY_URL)
    app.log.warn(
      'DICE_URL, IDENTITY_URL ou INTERNAL_API_SECRET absent : les paiements ne pourront pas être livrés',
    );

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [plans, checkout, subscription, invoices, webhook]) {
    await module(app, deps);
  }

  return app;
}

/** Client Stripe de la configuration ; null sans clé (paiements dormants). */
function defaultStripe(key: string | undefined) {
  return key ? stripeApi(key) : null;
}
