import { loadConfig, start, startOrphanSweep, startOutboxRelayWithBus } from '@vtt/platform';
import { buildCampaign } from './app.js';
import { CampaignConfig } from './config.js';
import { createDb } from './db/client.js';

const config = loadConfig(CampaignConfig);
let stopRelay: (() => Promise<void>) | undefined;
let stopSweep: (() => Promise<void>) | undefined;
// Relais et balayage s'arrêtent avant la fermeture du pool du service (onShutdown passe en premier)
const app = await buildCampaign(config, {
  onShutdown: [async () => stopRelay?.(), async () => stopSweep?.()],
});
await start(app, config);

if (config.ORPHAN_SWEEP !== 'off') {
  // Fichiers orphelins de campaigns/ (docs/nettoyage.md) : petit pool à part, essai par défaut
  const { pool } = createDb(config.DATABASE_URL);
  const stop = startOrphanSweep({
    name: 'campaign-orphans',
    pool,
    schema: 'campaign',
    prefixes: ['campaigns/'],
    settings: config,
    logger: app.log,
  });
  stopSweep = async () => {
    await stop();
    await pool.end().catch(() => undefined);
  };
}

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
