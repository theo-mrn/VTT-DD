import { loadConfig, start } from '@vtt/platform';
import { buildIdentity } from './app.js';
import { startIdentityBus } from './bus.js';
import { IdentityConfig } from './config.js';
import { createDb } from './db/client.js';

const config = loadConfig(IdentityConfig);
let stopBus: (() => Promise<void>) | undefined;
// Le bus (relais, consommateur des titres) s'arrête avant la fermeture du pool du service
// (onShutdown passe en premier)
const app = await buildIdentity(config, { onShutdown: [async () => stopBus?.()] });
await start(app, config);

if (config.NATS_URL) {
  // Après le démarrage : NATS injoignable ne bloque pas le service, la connexion est retentée.
  // Le consommateur des titres a son petit pool (il traite un événement à la fois).
  const titles = createDb(config.DATABASE_URL, {
    max: 2,
    applicationName: `${config.SERVICE_NAME}-titles`,
  });
  const stop = startIdentityBus({
    natsUrl: config.NATS_URL,
    name: config.SERVICE_NAME,
    connectionString: config.DATABASE_URL,
    listenConnectionString: config.DATABASE_DIRECT_URL,
    db: titles.db,
    logger: app.log,
  });
  stopBus = async () => {
    await stop();
    await titles.pool.end().catch(() => undefined);
  };
} else {
  app.log.warn(
    'NATS_URL absent : les événements restent dans l’outbox, non publiés, et les titres ' +
      '« événement » ne sont pas débloqués',
  );
}
