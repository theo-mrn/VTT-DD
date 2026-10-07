import { createService, Uploads, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { billingCheckout, noBilling, type BillingCheckout } from './clients/billing.js';
import { campaignRights, noCampaigns, type CampaignRights } from './clients/campaign.js';
import type { MarketplaceConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as catalog } from './modules/catalog/index.js';
import { register as community } from './modules/community/index.js';
import { register as creators } from './modules/creators/index.js';
import { register as library } from './modules/library/index.js';
import { register as moderation } from './modules/moderation/index.js';
import { register as studio } from './modules/studio/index.js';
import { createS3PackStorage, type PackStorage } from './storage/storage.js';

export async function buildMarketplace(
  config: MarketplaceConfig,
  extra: Omit<ServiceOptions, 'config'> & {
    db?: Db;
    campaigns?: CampaignRights;
    billing?: BillingCheckout;
    /** Stockage simulé (tests) ; null : comme sans R2. */
    storage?: PackStorage | null;
    uploads?: Uploads;
    now?: () => Date;
  } = {},
) {
  const { db: providedDb, campaigns, billing, storage, uploads, now, ...options } = extra;
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

  const secret = config.INTERNAL_API_SECRET;
  if (!secret || !config.CAMPAIGN_URL)
    app.log.warn(
      'CAMPAIGN_URL ou INTERNAL_API_SECRET absent : installation des packs indisponible',
    );
  if (!secret || !config.BILLING_URL)
    app.log.warn('BILLING_URL ou INTERNAL_API_SECRET absent : vente des packs indisponible');
  const packs = storage === null ? undefined : (storage ?? createS3PackStorage(config));
  if (!packs) app.log.warn('Stockage R2 non configuré : contenu des packs indisponible');

  const deps: Deps = {
    config,
    db,
    campaigns:
      campaigns ??
      (secret && config.CAMPAIGN_URL
        ? campaignRights({
            url: config.CAMPAIGN_URL,
            secret,
            cacheMs: config.RIGHTS_CACHE_MS,
            onError: (e) => app.log.warn({ error: (e as Error).message }, 'campaign injoignable'),
          })
        : noCampaigns),
    billing:
      billing ??
      (secret && config.BILLING_URL
        ? billingCheckout({
            url: config.BILLING_URL,
            secret,
            onError: (e) => app.log.warn({ error: (e as Error).message }, 'billing injoignable'),
          })
        : noBilling),
    storage: packs,
    uploads: uploads ?? Uploads.fromSettings(config),
    now: now ?? (() => new Date()),
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [creators, catalog, studio, library, community, moderation]) {
    await module(app, deps);
  }

  return Object.assign(app, { deps });
}
