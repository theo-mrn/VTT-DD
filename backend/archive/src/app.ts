import { createDatabaseService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { archiveServices, type ArchiveServices } from './clients/services.js';
import type { ArchiveConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as jobs } from './modules/jobs/index.js';
import { createS3ArchiveStore, type ArchiveStore } from './storage/store.js';

export async function buildArchive(
  config: ArchiveConfig,
  extra: Omit<ServiceOptions, 'config'> & {
    db?: Db;
    /** Services simulés (tests) ; null : comme sans configuration. */
    services?: ArchiveServices | null;
    store?: ArchiveStore | null;
    now?: () => Date;
  } = {},
) {
  const { db: providedDb, services, store, now, ...options } = extra;
  const connection = providedDb ? null : createDb(config.DATABASE_URL);
  const db = providedDb ?? connection!.db;
  const app = await createDatabaseService(
    { config, ...options },
    { ping: () => db.execute(sql`select 1`), close: async () => connection?.pool.end() },
  );

  const { INTERNAL_API_SECRET: secret, CAMPAIGN_URL, CHARACTER_URL, AUDIO_URL } = config;
  const configured =
    secret && CAMPAIGN_URL && CHARACTER_URL && AUDIO_URL
      ? archiveServices({
          campaignUrl: CAMPAIGN_URL,
          characterUrl: CHARACTER_URL,
          audioUrl: AUDIO_URL,
          secret,
          cacheMs: config.RIGHTS_CACHE_MS,
        })
      : undefined;
  const deps: Deps = {
    config,
    db,
    services: services === null ? undefined : (services ?? configured),
    store: store === null ? undefined : (store ?? createS3ArchiveStore(config)),
    now: now ?? (() => new Date()),
  };
  if (!deps.services)
    app.log.warn(
      'CAMPAIGN_URL, CHARACTER_URL, AUDIO_URL ou INTERNAL_API_SECRET absent : export indisponible',
    );
  if (!deps.store) app.log.warn('Stockage R2 non configuré : export et import indisponibles');

  for (const module of [jobs]) await module(app, deps);

  return Object.assign(app, { deps });
}
