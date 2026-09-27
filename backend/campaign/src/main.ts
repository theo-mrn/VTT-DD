import { loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildCampaign } from './app.js';
import { CampaignConfig } from './config.js';

const config = loadConfig(CampaignConfig);
let stopRelay: (() => Promise<void>) | undefined;
// Le relais s'arrête avant la fermeture du pool du service (onShutdown passe en premier)
const app = await buildCampaign(config, { onShutdown: [async () => stopRelay?.()] });
await start(app, config);

if (config.NATS_URL) {
  // Après le démarrage : NATS injoignable ne bloque pas le service, le relais réessaie
  stopRelay = startOutboxRelayWithBus({
    natsUrl: config.NATS_URL,
    name: config.SERVICE_NAME,
    schema: 'campaign',
    connectionString: config.DATABASE_URL,
    listenConnectionString: config.DATABASE_DIRECT_URL,
    applicationName: `${config.SERVICE_NAME}-outbox-relay`,
    logger: app.log,
  });
} else {
  app.log.warn('NATS_URL absent : les événements restent dans l’outbox, non publiés');
}
