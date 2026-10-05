import { loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildDice } from './app.js';
import { DiceConfig } from './config.js';
import { createDb } from './db/client.js';
import { RIGHTS_CONSUMER, startRightsConsumer } from './modules/rights/consumer.js';

const config = loadConfig(DiceConfig);
// Pool à part pour le consommateur des droits, fermé après le relais et lui
const rightsDb = createDb(config.DATABASE_URL);
let stopRelay: (() => Promise<void>) | undefined;
// Le relais s'arrête avant la fermeture du pool du service (onShutdown passe en premier)
const app = await buildDice(config, {
  onShutdown: [async () => stopRelay?.(), async () => rightsDb.pool.end()],
});
await start(app, config);

if (config.NATS_URL) {
  // Après le démarrage : NATS injoignable ne bloque pas le service, le relais réessaie
  stopRelay = startOutboxRelayWithBus({
    natsUrl: config.NATS_URL,
    name: config.SERVICE_NAME,
    schema: 'dice',
    connectionString: config.DATABASE_URL,
    listenConnectionString: config.DATABASE_DIRECT_URL,
    applicationName: `${config.SERVICE_NAME}-outbox-relay`,
    logger: app.log,
    // Droits publiés par billing : premium et skins achetés
    consumers: [
      {
        name: RIGHTS_CONSUMER,
        start: (bus) => startRightsConsumer({ bus, db: rightsDb.db, logger: app.log as never }),
      },
    ],
  });
} else {
  app.log.warn('NATS_URL absent : les événements restent dans l’outbox, non publiés');
}
