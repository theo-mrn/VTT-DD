import { loadConfig, start, startOutboxRelayWithBus } from '@vtt/platform';
import { buildBilling } from './app.js';
import { BillingConfig } from './config.js';
import { createDb } from './db/client.js';
import { ACCOUNTS_CONSUMER, startAccountsConsumer } from './accounts/consumer.js';
import { MAILS_CONSUMER, startMailsConsumer } from './mails/consumer.js';
import { kourrierMailer } from './mails/kourrier.js';
import { startJobs } from './jobs/jobs.js';
import { stripeApi } from './stripe/client.js';

const config = loadConfig(BillingConfig);
// Pool à part pour le travail de fond (e-mails, tâches planifiées), fermé après eux
const background = createDb(config.DATABASE_URL);
let stopRelay: (() => Promise<void>) | undefined;
let stopJobs: (() => Promise<void>) | undefined;
// Relais et tâches s'arrêtent avant la fermeture des pools (onShutdown passe en premier)
const app = await buildBilling(config, {
  onShutdown: [
    async () => stopRelay?.(),
    async () => stopJobs?.(),
    async () => background.pool.end(),
  ],
});
await start(app, config);

// Réconciliation avec Stripe et rappels de reconduction, une fois par jour
if (config.STRIPE_SECRET_KEY) {
  stopJobs = startJobs({ db: background.db, stripe: stripeApi(config.STRIPE_SECRET_KEY) }, app.log);
}

if (config.NATS_URL) {
  const mailer = kourrierMailer({
    url: config.KOURRIER_URL,
    apiKey: config.KOURRIER_API_KEY,
    from: config.MAIL_FROM,
    log: app.log,
  });
  // Après le démarrage : NATS injoignable ne bloque pas le service, le relais réessaie
  stopRelay = startOutboxRelayWithBus({
    natsUrl: config.NATS_URL,
    name: config.SERVICE_NAME,
    schema: 'billing',
    connectionString: config.DATABASE_URL,
    listenConnectionString: config.DATABASE_DIRECT_URL,
    applicationName: `${config.SERVICE_NAME}-outbox-relay`,
    logger: app.log,
    // E-mails de paiement (achat, facture, échec, résiliation…), à partir des événements
    consumers: [
      {
        // Comptes supprimés (docs/legal.md) : client Stripe et données de paiement
        name: ACCOUNTS_CONSUMER,
        start: (bus) =>
          startAccountsConsumer({
            bus,
            db: background.db,
            stripe: config.STRIPE_SECRET_KEY ? stripeApi(config.STRIPE_SECRET_KEY) : null,
            logger: app.log as never,
          }),
      },
      {
        name: MAILS_CONSUMER,
        start: (bus) =>
          startMailsConsumer({
            bus,
            db: background.db,
            mailer,
            appUrl: config.APP_URL,
            log: app.log,
            logger: app.log as never,
          }),
      },
    ],
  });
} else {
  app.log.warn('NATS_URL absent : droits et e-mails restent dans l’outbox, non publiés');
}
