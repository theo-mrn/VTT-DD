/**
 * Relais d'outbox : publie sur NATS JetStream les événements que le service a
 * écrits dans `<schéma>.outbox`, dans la même transaction que la donnée.
 *
 * - Sonnette : le trigger `outbox_notify` fait `pg_notify('<schéma>_outbox', id)` ;
 *   un client pg dédié écoute ce canal (connexion directe : LISTEN ne traverse
 *   pas PgBouncer en mode transaction) et se reconnecte seul.
 * - Filet de sécurité : relecture toutes les `pollMs` même sans notification.
 * - Lot : `FOR UPDATE SKIP LOCKED` dans une transaction, sous un verrou
 *   consultatif : un seul réplica publie à la fois, l'ordre est préservé.
 * - Au moins une fois : une ligne publiée mais pas marquée (coupure avant le
 *   COMMIT) est republiée ; JetStream l'écarte grâce à `Nats-Msg-Id = event.id`.
 * - Échec : `attempts + 1`, `last_error`, fin du lot (les suivantes attendent,
 *   pour garder l'ordre) et pause jusqu'au prochain passage : pas de boucle folle.
 */
import type { EventEnvelope } from '@vtt/contracts';
import pg from 'pg';
import type { Logger } from 'pino';
import { connectBus, publishEvent, type Bus } from './bus.js';
import { lazyInstruments } from './metrics.js';

/** Identifiant SQL non quoté : seul ce format est interpolé dans les requêtes. */
const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]{0,54}$/;

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_POLL_MS = 5_000;
/** Lignes publiées conservées 7 jours (même durée que le rejeu JetStream). */
const DEFAULT_RETENTION_MS = 7 * 24 * 3600 * 1000;
const CLEANUP_EVERY_MS = 3600 * 1000;
const CLEANUP_LIMIT = 10_000;
/** Au-delà, le lot s'arrête et on committe (reste loin d'idle_in_transaction_session_timeout). */
const BATCH_BUDGET_MS = 10_000;
const MAX_RETRY_MS = 30_000;

type RelayLogger = Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;

const relayMetrics = lazyInstruments((m) => ({
  pending: m.createObservableGauge('vtt.outbox.pending', {
    description: 'Événements écrits dans l’outbox et pas encore publiés',
  }),
}));

export interface OutboxRelayOptions {
  /** Schéma SQL du service (`dice`, `characters`…) : table `<schéma>.outbox`, canal `<schéma>_outbox`. */
  schema: string;
  bus: Pick<Bus, 'js'>;
  logger?: RelayLogger;
  /** Connexion du rôle `<svc>_svc` (le relais ouvre alors son propre petit pool). */
  connectionString?: string;
  /** Ou un pool existant (non fermé à l'arrêt). */
  pool?: pg.Pool;
  /** Connexion directe pour LISTEN (hors PgBouncer) ; par défaut `connectionString`. */
  listenConnectionString?: string;
  batchSize?: number;
  pollMs?: number;
  /** Suppression des lignes publiées depuis plus longtemps ; `false` pour ne rien supprimer. */
  retentionMs?: number | false;
  /** Nom de la connexion côté Postgres (pg_stat_activity). */
  applicationName?: string;
}

interface OutboxRow {
  id: string;
  subject: string;
  envelope: EventEnvelope;
}

/**
 * Démarre le relais ; la promesse est tenue après la première tentative de
 * LISTEN (réussie ou non : les reconnexions continuent en arrière-plan).
 * Renvoie la fonction d'arrêt.
 */
export async function startOutboxRelay(opts: OutboxRelayOptions): Promise<() => Promise<void>> {
  const { schema, bus, logger } = opts;
  const listenUrl = checkOptions(opts);
  const table = `"${schema}".outbox`;
  const channel = `${schema}_outbox`;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const retentionMs = opts.retentionMs ?? DEFAULT_RETENTION_MS;
  const applicationName = opts.applicationName ?? `${schema}-outbox-relay`;

  const ownPool = !opts.pool;
  const pool =
    opts.pool ??
    new pg.Pool({
      connectionString: opts.connectionString,
      max: 2,
      statement_timeout: 10_000,
      connectionTimeoutMillis: 10_000,
      application_name: applicationName,
    });
  if (ownPool) {
    pool.on('error', (err) =>
      logger?.warn({ error: err.message, schema }, 'relais d’outbox : erreur pg'),
    );
  }

  let stopped = false;
  let running: Promise<void> | undefined;
  let again = false;
  /** Après un échec, les notifications sont ignorées jusqu'au prochain passage du poll. */
  let pausedUntil = 0;
  let lastCleanup = 0;
  let canDelete: boolean | undefined;

  /** Un lot : `selected` lignes lues, `published` publiées, `failed` si une a échoué. */
  async function runBatch(): Promise<{ selected: number; published: number; failed: boolean }> {
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      // Un seul réplica publie à la fois : les autres passent leur tour (ordre préservé)
      const lock = await client.query<{ ok: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok',
        [channel],
      );
      if (!lock.rows[0]?.ok) {
        await client.query('COMMIT');
        return { selected: 0, published: 0, failed: false };
      }
      const { rows } = await client.query<OutboxRow>(
        `SELECT id, subject, envelope FROM ${table}
          WHERE published_at IS NULL
          ORDER BY created_at, id
          LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );
      const published: string[] = [];
      let failure: { id: string; error: string } | undefined;
      const started = Date.now();
      for (const row of rows) {
        try {
          await publishEvent(bus, row.envelope, row.subject);
          published.push(row.id);
        } catch (err) {
          failure = { id: row.id, error: errorMessage(err) };
          break;
        }
        if (Date.now() - started > BATCH_BUDGET_MS) break;
      }
      if (published.length > 0) {
        await client.query(`UPDATE ${table} SET published_at = now() WHERE id = ANY($1::uuid[])`, [
          published,
        ]);
      }
      if (failure) {
        const { rows: failed } = await client.query<{ attempts: number }>(
          `UPDATE ${table} SET attempts = attempts + 1, last_error = $2 WHERE id = $1
           RETURNING attempts`,
          [failure.id, failure.error.slice(0, 2000)],
        );
        logger?.warn(
          { schema, outboxId: failure.id, attempts: failed[0]?.attempts, error: failure.error },
          'relais d’outbox : publication impossible, nouvel essai au prochain passage',
        );
      }
      await client.query('COMMIT');
      return { selected: rows.length, published: published.length, failed: !!failure };
    } catch (err) {
      // ROLLBACK impossible : connexion cassée, le pool la remplace
      await client.query('ROLLBACK').catch(() => {
        broken = true;
      });
      throw err;
    } finally {
      client.release(broken);
    }
  }

  /** Supprime les lignes publiées anciennes, au plus une fois par heure, si le rôle en a le droit. */
  async function cleanup(): Promise<void> {
    if (retentionMs === false || Date.now() - lastCleanup < CLEANUP_EVERY_MS) return;
    lastCleanup = Date.now();
    if (canDelete === undefined) {
      const { rows } = await pool.query<{ ok: boolean }>(
        "SELECT has_table_privilege($1, 'DELETE') AS ok",
        [`${schema}.outbox`],
      );
      canDelete = !!rows[0]?.ok;
      if (!canDelete) {
        logger?.info({ schema }, 'relais d’outbox : pas de droit DELETE, pas de nettoyage');
      }
    }
    if (!canDelete) return;
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE id IN (
         SELECT id FROM ${table}
          WHERE published_at < now() - make_interval(secs => $1)
          LIMIT ${CLEANUP_LIMIT})`,
      [retentionMs / 1000],
    );
    if (rowCount) logger?.info({ schema, deleted: rowCount }, 'relais d’outbox : lignes purgées');
  }

  async function drain(): Promise<void> {
    do {
      again = false;
      let result;
      try {
        result = await runBatch();
      } catch (err) {
        pausedUntil = Date.now() + pollMs;
        logger?.warn(
          { schema, error: errorMessage(err) },
          'relais d’outbox : lecture de l’outbox impossible',
        );
        return;
      }
      if (result.published > 0) {
        logger?.debug({ schema, published: result.published }, 'relais d’outbox : lot publié');
      }
      if (result.failed) {
        pausedUntil = Date.now() + pollMs;
        return;
      }
      // Lot plein, ou coupé par le budget de temps : il en reste sans doute
      if (result.selected === batchSize || result.published < result.selected) again = true;
    } while (again && !stopped);
    await cleanup().catch((err) =>
      logger?.warn({ schema, error: errorMessage(err) }, 'relais d’outbox : nettoyage impossible'),
    );
  }

  function trigger(source: 'notify' | 'poll' | 'start'): void {
    if (stopped) return;
    if (source === 'notify' && Date.now() < pausedUntil) return;
    if (running) {
      // Demande pendant un passage : on relira juste après
      again = true;
      return;
    }
    again = false;
    running = drain().finally(() => {
      running = undefined;
      // Demande arrivée après le dernier lot (pendant le nettoyage) : pas perdue
      if (again && Date.now() >= pausedUntil) trigger('poll');
    });
  }

  // Sonnette : client LISTEN dédié, reconnecté avec un délai croissant
  let listenClient: pg.Client | undefined;
  let listenTimer: NodeJS.Timeout | undefined;
  let listenFailures = 0;

  function scheduleListen(): void {
    if (stopped) return;
    const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** listenFailures);
    listenFailures += 1;
    listenTimer = setTimeout(() => void listen(), delay);
    listenTimer.unref();
  }

  async function listen(): Promise<void> {
    if (stopped) return;
    const client = new pg.Client({
      connectionString: listenUrl,
      application_name: applicationName,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
    let lost = false;
    const onLost = (err?: unknown) => {
      if (lost) return;
      lost = true;
      if (listenClient === client) listenClient = undefined;
      void client.end().catch(() => undefined);
      if (stopped) return;
      logger?.warn(
        { schema, error: err ? errorMessage(err) : 'connexion fermée' },
        'relais d’outbox : LISTEN indisponible, nouvelle tentative',
      );
      scheduleListen();
    };
    client.on('error', onLost);
    client.on('end', () => onLost());
    client.on('notification', () => trigger('notify'));
    try {
      await client.connect();
      await client.query(`LISTEN "${channel}"`);
    } catch (err) {
      onLost(err);
      return;
    }
    if (stopped) {
      lost = true;
      await client.end().catch(() => undefined);
      return;
    }
    listenClient = client;
    listenFailures = 0;
    logger?.info({ schema, channel }, 'relais d’outbox : à l’écoute');
    // Rattrape ce qui a été écrit pendant la coupure
    trigger('start');
  }

  const pollTimer = setInterval(() => trigger('poll'), pollMs);
  pollTimer.unref();

  // Retard de publication, lu à chaque export des métriques
  const pending = relayMetrics().pending;
  const observePending = async (result: { observe(v: number, a: { schema: string }): void }) => {
    if (stopped) return;
    const { rows } = await pool
      .query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE published_at IS NULL`)
      .catch(() => ({ rows: [] as { n: string }[] }));
    if (rows[0]) result.observe(Number(rows[0].n), { schema });
  };
  pending.addCallback(observePending);
  await listen();
  // Sans LISTEN, premier passage tout de suite (sinon listen() l'a déjà lancé)
  if (!listenClient) trigger('start');

  return async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(pollTimer);
    clearTimeout(listenTimer);
    pending.removeCallback(observePending);
    const client = listenClient;
    listenClient = undefined;
    await client?.end().catch(() => undefined);
    await running;
    if (ownPool) await pool.end().catch(() => undefined);
  };
}

export interface OutboxRelayServiceOptions extends Omit<OutboxRelayOptions, 'bus'> {
  natsUrl: string;
  /** Nom de la connexion NATS (monitoring), en général le nom du service. */
  name: string;
}

/**
 * Pour `main.ts` : connecte le bus puis démarre le relais, sans bloquer ni
 * faire échouer le démarrage. Si NATS est injoignable, on réessaie en
 * arrière-plan (délai croissant) ; les événements attendent dans l'outbox.
 * Renvoie la fonction d'arrêt (relais puis bus).
 */
export function startOutboxRelayWithBus(opts: OutboxRelayServiceOptions): () => Promise<void> {
  const { natsUrl, name, logger, ...relay } = opts;
  // Erreur de configuration : on échoue tout de suite, pas dans la boucle de reconnexion
  checkOptions(relay);
  let stopped = false;
  let bus: Bus | undefined;
  let stopRelay: (() => Promise<void>) | undefined;
  let timer: NodeJS.Timeout | undefined;
  let failures = 0;

  const attempt = async (): Promise<void> => {
    let connected: Bus;
    try {
      // bus.ts ne se sert que de warn ; le logger de Fastify est un pino à l'exécution
      connected = await connectBus({ url: natsUrl, name, logger: logger as Logger });
    } catch (err) {
      if (stopped) return;
      const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** failures);
      failures += 1;
      logger?.warn(
        { error: errorMessage(err), retryInMs: delay },
        'bus NATS injoignable : événements en attente dans l’outbox, nouvel essai',
      );
      timer = setTimeout(() => void (pending = attempt()), delay);
      timer.unref();
      return;
    }
    if (stopped) {
      await connected.close().catch(() => undefined);
      return;
    }
    bus = connected;
    logger?.info({ schema: relay.schema }, 'bus NATS connecté');
    try {
      stopRelay = await startOutboxRelay({ ...relay, logger, bus });
    } catch (err) {
      logger?.error({ error: errorMessage(err) }, 'relais d’outbox : démarrage impossible');
    }
  };
  let pending = attempt();

  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
    await stopRelay?.();
    await bus?.close().catch(() => undefined);
  };
}

/** Valide les options ; renvoie la connexion à utiliser pour LISTEN. */
function checkOptions(opts: Omit<OutboxRelayOptions, 'bus'>): string {
  if (!SQL_IDENTIFIER.test(opts.schema)) {
    throw new Error(`Schéma d'outbox invalide : ${JSON.stringify(opts.schema)}`);
  }
  if (!opts.pool && !opts.connectionString) {
    throw new Error('Relais d’outbox : connectionString ou pool requis');
  }
  const listenUrl = opts.listenConnectionString ?? opts.connectionString;
  if (!listenUrl) {
    throw new Error('Relais d’outbox : listenConnectionString requis avec un pool fourni');
  }
  return listenUrl;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
