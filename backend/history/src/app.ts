import { connectBus, createService, type Bus, type ServiceOptions } from '@vtt/platform';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { campaignRights, noCampaigns } from './clients/campaign.js';
import type { HistoryConfig } from './config.js';
import { startConsumer, type Logger } from './consumer/index.js';
import { createDb, type Db } from './db/client.js';
import type { Deps } from './deps.js';
import { ensurePartitions } from './journal/partitions.js';
import { register as history } from './modules/history/index.js';
import { register as internal } from './modules/internal/index.js';

const DAY_MS = 24 * 3600 * 1000;

/** Droits lus chez campaign ; sans URL ou secret, historique illisible (503). */
function rightsOf(log: FastifyBaseLogger, config: HistoryConfig): Deps['campaigns'] {
  const secret = config.INTERNAL_API_SECRET;
  if (!secret || !config.CAMPAIGN_URL) return noCampaigns;
  return campaignRights({
    url: config.CAMPAIGN_URL,
    secret,
    cacheMs: config.RIGHTS_CACHE_MS,
    onError: (e) => log.warn({ error: (e as Error).message }, 'campaign injoignable'),
  });
}

/** Consommation du bus (journal des événements) ; renvoie son arrêt. */
async function consumeBus(
  bus: Bus,
  db: Db,
  log: FastifyBaseLogger,
  config: HistoryConfig,
  consume: false | { durable?: string; subjects?: string[] } | undefined,
): Promise<() => Promise<void>> {
  const durable = (consume && consume.durable) || config.HISTORY_CONSUMER;
  const stop = await startConsumer({
    bus,
    db,
    logger: log as unknown as Logger,
    durable,
    subjects: consume ? consume.subjects : undefined,
  });
  log.info({ durable }, 'consommation du bus démarrée');
  return stop;
}

export async function buildHistory(
  config: HistoryConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'campaigns'>> & {
      db?: Db;
      /**
       * Consommation du bus (NATS_URL requis). `false` : aucune (tests sans
       * NATS) ; objet : autre consommateur ou autres sujets (tests).
       */
      consume?: false | { durable?: string; subjects?: string[] };
    } = {},
) {
  const { db: providedDb, campaigns, consume, ...options } = extra;
  if (!config.JWKS_URL && !options.authKeyResolver) {
    throw new Error('Configuration invalide : JWKS_URL est requis pour vérifier les jetons');
  }
  const connection = providedDb ? null : createDb(config.DATABASE_URL);
  const db = providedDb ?? connection!.db;

  // Bus : connexion avant le serveur (le service refuse de démarrer sans lui s'il est configuré)
  const bus: Bus | null =
    consume !== false && config.NATS_URL
      ? await connectBus({ url: config.NATS_URL, name: config.SERVICE_NAME })
      : null;
  let stopConsumer: (() => Promise<void>) | null = null;
  let partitionTimer: NodeJS.Timeout | null = null;

  const app = await createService({
    config,
    ...options,
    readiness: {
      postgres: async () => {
        await db.execute(sql`select 1`);
        return true;
      },
      ...(bus ? { nats: async () => !bus.nc.isClosed() } : {}),
      ...options.readiness,
    },
    onShutdown: [
      ...(options.onShutdown ?? []),
      // Dans l'ordre : plus de nouveaux messages, bus vidé, puis la base
      async () => {
        if (partitionTimer) clearInterval(partitionTimer);
        await stopConsumer?.();
        await bus?.close();
      },
      async () => connection?.pool.end(),
    ],
  });

  const secret = config.INTERNAL_API_SECRET;
  if (!secret || !config.CAMPAIGN_URL)
    app.log.warn('CAMPAIGN_URL ou INTERNAL_API_SECRET absent : historique illisible (503)');

  const deps: Deps = {
    config,
    db,
    campaigns: campaigns ?? rightsOf(app.log, config),
  };

  // Un module par domaine fonctionnel (src/modules/<nom>)
  for (const module of [history, internal]) {
    await module(app, deps);
  }

  // Partitions des mois à venir : au démarrage puis chaque jour. Un échec n'arrête
  // rien (events_default reçoit les événements hors partition).
  const partitions = async () => {
    try {
      const created = await ensurePartitions(db, new Date(), config.PARTITION_MONTHS_AHEAD);
      if (created) app.log.info({ created }, 'partitions mensuelles créées');
    } catch (e) {
      app.log.warn({ error: (e as Error).message }, 'création des partitions impossible');
    }
  };
  if (consume !== false) {
    await partitions();
    partitionTimer = setInterval(() => void partitions(), DAY_MS);
    partitionTimer.unref();
  }

  if (bus) stopConsumer = await consumeBus(bus, db, app.log, config, consume);
  else if (consume !== false) {
    app.log.warn('NATS_URL absent : aucun événement ne sera journalisé');
  }

  return app;
}
