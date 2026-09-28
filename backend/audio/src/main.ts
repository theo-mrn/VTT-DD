import { loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildAudio } from './app.js';
import { AudioConfig } from './config.js';

const config = loadConfig(AudioConfig);
const stops: Array<() => Promise<void>> = [];
// Relais, consommateur et planificateur s'arrêtent avant la fermeture du pool (onShutdown en premier)
const app = await buildAudio(config, {
  onShutdown: [
    async () => {
      for (const stop of stops.reverse()) await stop().catch(() => undefined);
    },
  ],
});
await start(app, config);

if (config.NATS_URL) {
  // Après le démarrage : NATS injoignable ne bloque pas le service, le relais réessaie
  stops.push(
    startOutboxRelayWithBus({
      natsUrl: config.NATS_URL,
      name: config.SERVICE_NAME,
      schema: 'audio',
      connectionString: config.DATABASE_URL,
      listenConnectionString: config.DATABASE_DIRECT_URL,
      applicationName: `${config.SERVICE_NAME}-outbox-relay`,
      logger: app.log,
    }),
  );
} else {
  app.log.warn('NATS_URL absent : les événements restent dans l’outbox, non publiés');
}
