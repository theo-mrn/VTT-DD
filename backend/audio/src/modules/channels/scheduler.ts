/**
 * Planificateur des enchaînements (§ 3.5) : chaque réplica passe toutes les
 * SCHEDULER_INTERVAL_MS et traite les canaux échus en
 * `FOR UPDATE SKIP LOCKED` : pas d'élection de chef, jamais deux transitions
 * pour la même échéance. Une piste en retard (panne) est rattrapée en une
 * seule transition (`advanceUntil`, `skipped` dans l'événement).
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { channels } from '../../db/schema.js';
import type { AudioStorage } from '../../storage/s3.js';
import { advanceUntil } from './machine.js';
import { loadAssets, saveTransition, SYSTEM_ACTOR, toMachine } from './repository.js';

export interface SchedulerDeps {
  db: Db;
  storage: AudioStorage | undefined;
  now: () => number;
}

/** Un passage : canaux échus à `now`, 50 au plus. Renvoie le nombre de canaux avancés. */
export async function runSchedulerOnce(deps: SchedulerDeps, limit = 50): Promise<number> {
  return deps.db.transaction(async (tx) => {
    const now = deps.now();
    const due = await tx
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.status, 'playing'),
          isNotNull(channels.endsAt),
          lte(channels.endsAt, new Date(now)),
        ),
      )
      .orderBy(asc(channels.endsAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    let advanced = 0;
    for (const row of due) {
      const { rows, infos } = await loadAssets(tx, row.queue.concat(row.assetId ?? []));
      const { state, steps } = advanceUntil(toMachine(row), now, { assets: infos });
      if (!steps) continue;
      const r = await saveTransition(tx, {
        row,
        next: state,
        rows,
        infos,
        storage: deps.storage,
        cause: 'auto_advance',
        actor: SYSTEM_ACTOR,
        ctx: { correlationId: `scheduler:${randomUUID()}` },
        nowMs: now,
        ...(steps > 1 ? { skipped: steps - 1 } : {}),
      });
      if (r.changed) advanced += 1;
    }
    return advanced;
  });
}

/** Boucle du planificateur ; renvoie la fonction d'arrêt. */
export function startScheduler(
  deps: SchedulerDeps & {
    intervalMs: number;
    logger: { warn: (o: object, m: string) => void };
  },
): () => Promise<void> {
  let stopped = false;
  let running: Promise<unknown> = Promise.resolve();
  const tick = () => {
    if (stopped) return;
    running = runSchedulerOnce(deps)
      .catch((error: unknown) =>
        deps.logger.warn({ error: (error as Error).message }, 'planificateur : passage en échec'),
      )
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, deps.intervalMs);
      });
  };
  let timer = setTimeout(tick, deps.intervalMs);
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
