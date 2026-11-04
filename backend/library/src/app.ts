import { createDatabaseService, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import type { LibraryConfig } from './config.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { register as backgrounds } from './modules/backgrounds/index.js';

export async function buildLibrary(
  config: LibraryConfig,
  extra: Omit<ServiceOptions, 'config'> & { db?: Db } = {},
) {
  const { db: providedDb, ...options } = extra;
  const connection = providedDb ? null : createDb(config.DATABASE_URL);
  const db = providedDb ?? connection!.db;
  const app = await createDatabaseService(
    { config, ...options },
    { ping: () => db.execute(sql`select 1`), close: async () => connection?.pool.end() },
  );

  const deps: Deps = { config, db };
  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [backgrounds]) {
    await module(app, deps);
  }
  return app;
}
