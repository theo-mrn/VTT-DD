/**
 * Point d'entrée du worker audio (`audio-worker`, même paquet que le service) :
 * analyse des envois avec ffmpeg, purge des fichiers. Un réplica suffit.
 * Pas de route métier : seulement les sondes /healthz et /readyz de la
 * plateforme, sur WORKER_PORT.
 */
import { createService, loadConfig, start } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import { AudioConfig } from './config.js';
import { createDb } from './db/client.js';
import { createS3Storage } from './storage/s3.js';
import { startWorker } from './worker/loop.js';

const config = loadConfig(AudioConfig, { SERVICE_NAME: 'audio-worker', ...process.env });
const { db, pool } = createDb(config.DATABASE_URL, 'audio-worker');
let stop: (() => Promise<void>) | undefined;
const app = await createService({
  config,
  auth: false,
  readiness: {
    postgres: async () => {
      await db.execute(sql`select 1`);
      return true;
    },
  },
  onShutdown: [async () => stop?.(), async () => pool.end()],
});
const storage = createS3Storage(config);
if (!storage) {
  app.log.error('Stockage S3 non configuré : le worker ne peut rien traiter');
  process.exit(1);
}
await start(app, { HOST: config.HOST, PORT: config.WORKER_PORT });
stop = startWorker({
  db,
  storage,
  config,
  logger: app.log,
  concurrency: config.WORKER_CONCURRENCY,
  listenUrl: config.DATABASE_DIRECT_URL ?? config.DATABASE_URL,
});
app.log.info({ concurrency: config.WORKER_CONCURRENCY }, 'worker audio démarré');
