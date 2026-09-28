import { createService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { createCatalog, type Catalog } from './catalog/index.js';
import { campaignRights, noCampaigns } from './clients/campaign.js';
import type { AudioConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as catalog } from './modules/catalog/index.js';
import { register as clock } from './modules/clock/index.js';
import { createS3Storage, type AudioStorage } from './storage/s3.js';

/** URL publique du catalogue publié dans le bucket (sons Star Wars). */
export function publishedCatalogBase(config: AudioConfig): string | null {
  if (config.AUDIO_CATALOG_PUBLISHED_URL) return config.AUDIO_CATALOG_PUBLISHED_URL;
  return config.S3_PUBLIC_URL ? `${config.S3_PUBLIC_URL.replace(/\/+$/, '')}/audio/catalog` : null;
}

export async function buildAudio(
  config: AudioConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'campaigns' | 'now' | 'random'>> & {
      db?: Db;
      catalog?: Catalog;
      storage?: AudioStorage | null;
    } = {},
) {
  const {
    db: providedDb,
    catalog: providedCatalog,
    campaigns,
    storage,
    now,
    random,
    ...options
  } = extra;
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
    app.log.warn('CAMPAIGN_URL ou INTERNAL_API_SECRET absent : aucune campagne accessible');
  const s3 = storage === null ? undefined : (storage ?? createS3Storage(config));
  if (!s3) app.log.warn('Stockage S3 non configuré : envoi de fichiers indisponible');
  if (!config.AUDIO_UPLOAD_SECRET)
    app.log.warn('AUDIO_UPLOAD_SECRET absent : envoi de fichiers indisponible');

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
    storage: s3,
    catalog: providedCatalog ?? createCatalog({ publishedBase: publishedCatalogBase(config) }),
    now: now ?? Date.now,
    random: random ?? Math.random,
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [clock, catalog]) {
    await module(app, deps);
  }

  return Object.assign(app, { deps });
}
