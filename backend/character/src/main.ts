import { loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildCharacter } from './app.js';
import { CharacterConfig } from './config.js';
import { startMaintenance } from './maintenance/index.js';

const config = loadConfig(CharacterConfig);
let stopRelay: (() => Promise<void>) | undefined;
let stopMaintenance: (() => Promise<void>) | undefined;
// Relais et entretien s'arrêtent avant la fermeture du pool du service (onShutdown passe en premier)
const app = await buildCharacter(config, {
  onShutdown: [async () => stopRelay?.(), async () => stopMaintenance?.()],
});
await start(app, config);
stopMaintenance = startMaintenance(config, app.log);

if (config.NATS_URL) {
  // Après le démarrage : NATS injoignable ne bloque pas le service, le relais réessaie
  stopRelay = startOutboxRelayWithBus({
    natsUrl: config.NATS_URL,
    name: config.SERVICE_NAME,
    schema: 'characters',
    connectionString: config.DATABASE_URL,
    listenConnectionString: config.DATABASE_DIRECT_URL,
    applicationName: `${config.SERVICE_NAME}-outbox-relay`,
    logger: app.log,
  });
} else {
  app.log.warn('NATS_URL absent : les événements restent dans l’outbox, non publiés');
}
