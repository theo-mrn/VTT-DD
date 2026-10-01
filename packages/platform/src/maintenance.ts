/**
 * Tâches d'entretien des services (docs/nettoyage.md) : une passe périodique, faite par une seule
 * instance à la fois grâce à un verrou consultatif Postgres.
 */
import type pg from 'pg';
import type { Logger } from './logger.js';

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
    current = o
      .run()
      .catch((err: unknown) => o.logger?.error({ err, task: o.name }, 'tâche d’entretien en échec'))
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
