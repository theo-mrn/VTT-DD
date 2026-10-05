import { loadConfig, periodic, start, startOrphanSweep, withAdvisoryLock } from '@vtt/platform';
import { buildIdentity } from './app.js';
import { startIdentityBus } from './bus.js';
import { IdentityConfig } from './config.js';
import { createDb } from './db/client.js';
import { createMailer } from './mail/mailer.js';
import { purgeExpired, runAccountLifecycle } from './maintenance/retention.js';

const config = loadConfig(IdentityConfig);
let stopBus: (() => Promise<void>) | undefined;
let stopSweep: (() => Promise<void>) | undefined;
let stopRetention: (() => Promise<void>) | undefined;
// Le bus (relais, consommateur des titres), le balayage et la purge s'arrêtent avant la fermeture
// du pool du service (onShutdown passe en premier)
const app = await buildIdentity(config, {
  onShutdown: [async () => stopBus?.(), async () => stopSweep?.(), async () => stopRetention?.()],
});
await start(app, config);

{
  // Durées de conservation (sessions, jetons d'e-mail) et cycle de vie des comptes (suppressions
  // à échéance, inactivité) : une instance à la fois, toutes les 6 h
  const mailer = createMailer({
    kourrierUrl: config.KOURRIER_URL,
    kourrierApiKey: config.KOURRIER_API_KEY,
    from: config.MAIL_FROM,
    log: app.log,
  });
  const retention = createDb(config.DATABASE_URL, {
    max: 1,
    applicationName: `${config.SERVICE_NAME}-retention`,
  });
  const stop = periodic({
    name: 'identity-retention',
    everyMs: 6 * 3_600_000,
    logger: app.log,
    run: async () => {
      await withAdvisoryLock(retention.pool, 'identity-retention', async () => {
        const purged = await purgeExpired(retention.db);
        if (purged.sessions || purged.emailTokens)
          app.log.info({ purged }, 'sessions et jetons expirés supprimés');
        const accounts = await runAccountLifecycle({
          db: retention.db,
          mailer,
          appUrl: config.APP_URL,
          log: app.log,
        });
        if (accounts.purged || accounts.expired || accounts.warned)
          app.log.info({ accounts }, 'comptes supprimés, mis en suppression ou prévenus');
      });
    },
  });
  stopRetention = async () => {
    await stop();
    await retention.pool.end().catch(() => undefined);
  };
}

if (config.ORPHAN_SWEEP !== 'off') {
  // Fichiers orphelins des avatars et bannières (docs/nettoyage.md) : essai par défaut
  const sweep = createDb(config.DATABASE_URL, {
    max: 2,
    applicationName: `${config.SERVICE_NAME}-orphans`,
  });
  const stop = startOrphanSweep({
    name: 'identity-orphans',
    pool: sweep.pool,
    schema: 'identity',
    prefixes: ['avatars/', 'banners/'],
    settings: config,
    logger: app.log,
  });
  stopSweep = async () => {
    await stop();
    await sweep.pool.end().catch(() => undefined);
  };
}

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
