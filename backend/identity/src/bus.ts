/**
 * Bus NATS d'identity : une seule connexion pour le relais d'outbox et le
 * consommateur des titres (identity-titles). Même principe que
 * startOutboxRelayWithBus (@vtt/platform), qui ne partage pas sa connexion :
 * le démarrage n'attend pas NATS, la connexion est retentée en arrière-plan
 * (délai croissant, 1 à 30 s) et les événements attendent dans l'outbox.
 */
import { connectBus, startOutboxRelay, type Bus } from '@vtt/platform';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from './db/client.js';
import { startTitlesConsumer } from './modules/titres/consumer.js';

const MAX_RETRY_MS = 30_000;

/** Journal attendu par @vtt/platform (pino) ; celui de Fastify en est un à l'exécution. */
type BusLogger = NonNullable<Parameters<typeof connectBus>[0]['logger']>;

export interface IdentityBusOptions {
  natsUrl: string;
  /** Nom de la connexion NATS, en général le nom du service. */
  name: string;
  /** Connexion du rôle identity_svc pour le relais (son propre petit pool). */
  connectionString: string;
  /** Connexion directe pour le LISTEN du relais (hors PgBouncer). */
  listenConnectionString?: string;
  /** Base du consommateur des titres. */
  db: Db;
  logger: FastifyBaseLogger;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Démarre bus, relais et consommateur sans bloquer ; renvoie la fonction d'arrêt. */
export function startIdentityBus(opts: IdentityBusOptions): () => Promise<void> {
  const logger = opts.logger as unknown as BusLogger;
  let stopped = false;
  let bus: Bus | undefined;
  let stopRelay: (() => Promise<void>) | undefined;
  let stopTitles: (() => Promise<void>) | undefined;
  let timer: NodeJS.Timeout | undefined;
  let pending: Promise<void>;

  const retry = (failures: number, next: () => Promise<void>) => {
    const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** failures);
    timer = setTimeout(() => void (pending = next()), delay);
    timer.unref();
    return delay;
  };

  // Consommateur des titres : réessayé tant que le durable ne peut pas être créé
  const startTitles = async (failures = 0): Promise<void> => {
    if (stopped || !bus) return;
    try {
      const stop = await startTitlesConsumer({ bus, db: opts.db, logger });
      if (stopped) return void (await stop());
      stopTitles = stop;
      opts.logger.info('consommateur identity-titles démarré');
    } catch (err) {
      if (stopped) return;
      const retryInMs = retry(failures, () => startTitles(failures + 1));
      opts.logger.error(
        { error: message(err), retryInMs },
        'consommateur identity-titles : démarrage impossible, nouvel essai',
      );
    }
  };

  const connect = async (failures = 0): Promise<void> => {
    let connected: Bus;
    try {
      connected = await connectBus({ url: opts.natsUrl, name: opts.name, logger });
    } catch (err) {
      if (stopped) return;
      const retryInMs = retry(failures, () => connect(failures + 1));
      opts.logger.warn(
        { error: message(err), retryInMs },
        'bus NATS injoignable : événements en attente dans l’outbox, nouvel essai',
      );
      return;
    }
    if (stopped) return void (await connected.close().catch(() => undefined));
    bus = connected;
    opts.logger.info({ schema: 'identity' }, 'bus NATS connecté');
    try {
      stopRelay = await startOutboxRelay({
        schema: 'identity',
        bus,
        connectionString: opts.connectionString,
        listenConnectionString: opts.listenConnectionString,
        applicationName: `${opts.name}-outbox-relay`,
        logger,
      });
    } catch (err) {
      opts.logger.error({ error: message(err) }, 'relais d’outbox : démarrage impossible');
    }
    await startTitles();
  };
  pending = connect();

  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
    await stopTitles?.();
    await stopRelay?.();
    await bus?.close().catch(() => undefined);
  };
}
