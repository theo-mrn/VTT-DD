/**
 * Tâches d'entretien des services (docs/nettoyage.md) : une passe périodique, faite par une seule
 * instance à la fois grâce à un verrou consultatif Postgres.
 */
import type pg from 'pg';
import type { Logger } from './logger.js';
import {
  referencedKeys,
  remoteReferences,
  sweepOrphans,
  type ReferenceChecker,
} from './orphans.js';
import { lazyInstruments } from './metrics.js';
import { createObjectStore } from './storage.js';
import { withSpan } from './tracing.js';
import type { StorageSettings } from './uploads.js';

/**
 * Exécute `fn` si le verrou `name` est libre (session dédiée), sinon ne fait rien : une autre
 * instance du service fait déjà la passe. Renvoie false dans ce cas.
 */
export async function withAdvisoryLock(
  pool: pg.Pool,
  name: string,
  fn: () => Promise<void>,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS ok',
      [name],
    );
    if (!rows[0]?.ok) return false;
    try {
      await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [name]);
    }
    return true;
  } finally {
    client.release();
  }
}

const taskMetrics = lazyInstruments((m) => ({
  duration: m.createHistogram('vtt.tasks.duration', {
    description: 'Durée d’une passe de tâche planifiée',
    unit: 'ms',
  }),
}));
const ok = (task: string) => ({ task, outcome: 'ok' });
const failed = (task: string) => ({ task, outcome: 'error' });

/**
 * Lance `run` tout de suite puis toutes les `everyMs` (jamais deux passes à la fois, une erreur
 * est journalisée et n'arrête pas la suivante). Renvoie l'arrêt, qui attend la passe en cours.
 */
export function periodic(o: {
  name: string;
  everyMs: number;
  run: () => Promise<void>;
  logger?: Pick<Logger, 'error'>;
  /** Délai avant la première passe (par défaut : une minute, le service a fini de démarrer). */
  firstInMs?: number;
}): () => Promise<void> {
  let stopped = false;
  let current: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;
  const tick = () => {
    if (stopped) return;
    const started = performance.now();
    current = withSpan(`task ${o.name}`, () => o.run(), { 'vtt.task': o.name })
      .then(() => taskMetrics().duration.record(performance.now() - started, ok(o.name)))
      .catch((err: unknown) => {
        taskMetrics().duration.record(performance.now() - started, failed(o.name));
        o.logger?.error({ err, task: o.name }, 'tâche d’entretien en échec');
      })
      .finally(() => {
        current = undefined;
        if (stopped) return;
        timer = setTimeout(tick, o.everyMs);
        timer.unref();
      });
  };
  timer = setTimeout(tick, o.firstInMs ?? 60_000);
  timer.unref();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await current;
  };
}

/**
 * Balayage périodique des fichiers orphelins d'un service (docs/nettoyage.md § Fichiers) : ses
 * dossiers, vérifiés auprès de sa base et de chaque autre service. Ne démarre pas sans stockage,
 * sans secret interne ou sans la liste des autres services : jamais de suppression à l'aveugle.
 */
export function startOrphanSweep(o: {
  name: string;
  pool: pg.Pool;
  schema: string;
  prefixes: readonly string[];
  settings: StorageSettings & {
    INTERNAL_API_SECRET?: string | undefined;
    ORPHAN_SWEEP: 'off' | 'dry-run' | 'on';
    ORPHAN_MIN_AGE_HOURS: number;
    ORPHAN_SWEEP_EVERY_MINUTES: number;
    STORAGE_REFERENCE_URLS?: string[] | undefined;
  };
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
}): () => Promise<void> {
  const s = o.settings;
  if (s.ORPHAN_SWEEP === 'off') return async () => undefined;
  const store = createObjectStore(s);
  const secret = s.INTERNAL_API_SECRET;
  const others = s.STORAGE_REFERENCE_URLS ?? [];
  if (!store || !secret || !others.length) {
    o.logger.warn(
      { store: Boolean(store), secret: Boolean(secret), services: others.length },
      'fichiers orphelins : balayage désactivé (stockage, secret ou STORAGE_REFERENCE_URLS absent)',
    );
    return async () => undefined;
  }
  const checkers: ReferenceChecker[] = [
    (keys) => referencedKeys(o.pool, o.schema, keys),
    ...others.map((url) => remoteReferences(url, secret)),
  ];
  const dryRun = s.ORPHAN_SWEEP !== 'on';
  return periodic({
    name: o.name,
    everyMs: s.ORPHAN_SWEEP_EVERY_MINUTES * 60_000,
    logger: o.logger,
    run: async () => {
      await withAdvisoryLock(o.pool, o.name, async () => {
        const report = await sweepOrphans({
          store,
          prefixes: o.prefixes,
          checkers,
          minAgeMs: s.ORPHAN_MIN_AGE_HOURS * 3_600_000,
          dryRun,
        });
        o.logger.info(
          { ...report, prefixes: o.prefixes, dryRun },
          dryRun ? 'fichiers orphelins (essai) : rien supprimé' : 'fichiers orphelins supprimés',
        );
      });
    },
  });
}
