import { connectBus, loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildAudio } from './app.js';
import { AudioConfig } from './config.js';
import { startCampaignConsumer } from './consumer/campaigns.js';
import { startScheduler } from './modules/channels/scheduler.js';

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

// Enchaînements automatiques : chaque réplica, SKIP LOCKED
stops.push(
  startScheduler({
    db: app.deps.db,
    storage: app.deps.storage,
    now: app.deps.now,
    intervalMs: config.SCHEDULER_INTERVAL_MS,
    logger: app.log,
  }),
);

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
  void (async () => {
    // Suppressions de campagne : réessai tant que le bus ne répond pas
    for (let attempt = 0; ; attempt++) {
      try {
        const bus = await connectBus({
          url: config.NATS_URL!,
          name: `${config.SERVICE_NAME}-consumer`,
          logger: app.log,
        });
        const stop = await startCampaignConsumer({
          bus,
          db: app.deps.db,
          durable: config.CAMPAIGN_CONSUMER,
          purgeAfterDays: config.PURGE_AFTER_DAYS,
          now: app.deps.now,
          logger: app.log,
        });
        stops.push(async () => {
          await stop();
          await bus.close();
        });
        return;
      } catch (error) {
        app.log.warn(
          { error: (error as Error).message },
          'bus NATS injoignable : consommateur en attente',
        );
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1_000 * 2 ** attempt)));
      }
    }
  })();
} else {
  app.log.warn('NATS_URL absent : les événements restent dans l’outbox, non publiés');
}
