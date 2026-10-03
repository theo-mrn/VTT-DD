import { createService, registerStorageReferences, type ServiceOptions } from '@vtt/platform';
import type pg from 'pg';
import { aleatoireCrypto } from '@vtt/rules';
import { sql } from 'drizzle-orm';
import { campaignRights, noCampaigns } from './clients/campaign.js';
import { characterClient, noCharacters } from './clients/character.js';
import { noProfiles, profilesClient } from './clients/profiles.js';
import type { DiceConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as internal } from './modules/internal/index.js';
import { register as preferences } from './modules/preferences/index.js';
import { register as rolls } from './modules/rolls/index.js';
import { register as stats } from './modules/stats/index.js';
import { referenceCatalog, type Catalog } from './systems/catalog.js';

export async function buildDice(
  config: DiceConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'campaigns' | 'characters' | 'profiles' | 'random'>> & {
      db?: Db;
      catalog?: Catalog;
    } = {},
) {
  const { db: providedDb, catalog, campaigns, characters, profiles, random, ...options } = extra;
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
  const warn = (service: string) => (e: unknown) =>
    app.log.warn({ error: (e as Error).message }, `${service} injoignable`);
  if (!secret || !config.CAMPAIGN_URL)
    app.log.warn('CAMPAIGN_URL ou INTERNAL_API_SECRET absent : jets de campagne indisponibles');
  if (!secret || !config.CHARACTER_URL)
    app.log.warn('CHARACTER_URL ou INTERNAL_API_SECRET absent : jets de personnage indisponibles');

  const deps: Deps = {
    config,
    db,
    catalog: catalog ?? referenceCatalog(),
    campaigns:
      campaigns ??
      (secret && config.CAMPAIGN_URL
        ? campaignRights({
            url: config.CAMPAIGN_URL,
            secret,
            cacheMs: config.RIGHTS_CACHE_MS,
            onError: warn('campaign'),
          })
        : noCampaigns),
    characters:
      characters ??
      (secret && config.CHARACTER_URL
        ? characterClient({ url: config.CHARACTER_URL, secret, onError: warn('character') })
        : noCharacters),
    profiles:
      profiles ??
      (config.IDENTITY_URL
        ? profilesClient({
            url: config.IDENTITY_URL,
            cache: app.cache,
            onError: (e) => app.log.warn({ error: (e as Error).message }, 'profil indisponible'),
          })
        : noProfiles),
    random: random ?? aleatoireCrypto,
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [rolls, stats, preferences, internal]) {
    await module(app, deps);
  }

  // Fichiers encore référencés par ce service : le balayage des orphelins le demande à chacun
  registerStorageReferences(app, {
    pool: (db as Db & { $client: pg.Pool }).$client,
    schema: 'dice',
    secret: config.INTERNAL_API_SECRET,
  });

  return app;
}
