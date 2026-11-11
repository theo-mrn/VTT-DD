import { connectBus, loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildArchive } from './app.js';
import { ArchiveConfig } from './config.js';
import { startEventsConsumer } from './consumer/events.js';
import { startWorkers } from './worker/loop.js';

const config = loadConfig(ArchiveConfig);
const stops: Array<() => Promise<void>> = [];
// Ouvriers, relais et consommateur s'arrêtent avant la fermeture du pool
const app = await buildArchive(config, {
  onShutdown: [
    async () => {
      for (const stop of stops.toReversed()) await stop().catch(() => undefined);
    },
  ],
});
await start(app, config);

if (app.deps.services && app.deps.store) stops.push(startWorkers(app.deps, app.log));

if (config.NATS_URL) {
  stops.push(
    startOutboxRelayWithBus({
      natsUrl: config.NATS_URL,
      name: config.SERVICE_NAME,
      schema: 'archive',
      connectionString: config.DATABASE_URL,
      listenConnectionString: config.DATABASE_DIRECT_URL,
      applicationName: `${config.SERVICE_NAME}-outbox-relay`,
      logger: app.log,
    }),
  );
  void (async () => {
    // Comptes supprimés : réessai tant que le bus ne répond pas
    for (let attempt = 0; ; attempt++) {
      try {
        const bus = await connectBus({
          url: config.NATS_URL!,
          name: `${config.SERVICE_NAME}-consumer`,
          logger: app.log,
        });
        const stop = await startEventsConsumer({
          bus,
          db: app.deps.db,
          store: app.deps.store,
          durable: config.EVENTS_CONSUMER,
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
  app.log.warn('NATS_URL absent : les événements restent dans l’outbox');
}
