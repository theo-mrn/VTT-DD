import { connectBus, loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildMarketplace } from './app.js';
import { MarketplaceConfig } from './config.js';
import { startEventsConsumer } from './consumer/events.js';

const config = loadConfig(MarketplaceConfig);
const stops: Array<() => Promise<void>> = [];
// Relais et consommateur s'arrêtent avant la fermeture du pool (onShutdown en premier)
const app = await buildMarketplace(config, {
  onShutdown: [
    async () => {
      for (const stop of stops.toReversed()) await stop().catch(() => undefined);
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
      schema: 'marketplace',
      connectionString: config.DATABASE_URL,
      listenConnectionString: config.DATABASE_DIRECT_URL,
      applicationName: `${config.SERVICE_NAME}-outbox-relay`,
      logger: app.log,
    }),
  );
  void (async () => {
    // Ventes, comptes des créateurs, comptes supprimés : réessai tant que le bus ne répond pas
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
  app.log.warn('NATS_URL absent : les événements restent dans l’outbox, achats non livrés');
}
