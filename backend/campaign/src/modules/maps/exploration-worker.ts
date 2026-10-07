/**
 * Travailleur de l'exploration (docs/exploration.md § 4) : vide la file des scènes à explorer
 * (`map_exploration_queue`), une scène à la fois, après le `COMMIT` des écritures qui l'ont
 * remplie. Dix murs posés d'un coup, quatre joueurs qui bougent ensemble : un calcul et un
 * événement par scène.
 *
 * - Réveillé 40 ms après une mise en file dans ce processus, puis 250 ms après (la transaction
 *   n'avait peut-être pas fini), et toutes les `pollMs` pour ne rien perdre (autre réplica,
 *   redémarrage).
 * - Une scène prise est retirée de la file (`SKIP LOCKED` : un seul réplica la traite) ; un
 *   échec la remet en file, et le passage s'arrête jusqu'au prochain réveil.
 */
import { uuidv7 } from '@vtt/contracts';
import type { Logger } from '@vtt/platform';
import type { Db } from '../../db/client.js';
import { exploreMap, SYSTEM_ACTOR } from './exploration.js';
import {
  claimQueuedExploration,
  onExplorationQueued,
  requeueExploration,
} from './exploration-queue.js';

type WorkerLogger = Pick<Logger, 'debug' | 'warn'>;

/** Scènes traitées au plus par passage (le suivant reprend). */
const BATCH = 50;
const KICK_DELAYS_MS = [40, 250];
const DEFAULT_POLL_MS = 2_000;

/**
 * Traite la file jusqu'à ce qu'elle soit vide (ou `limit` scènes). Renvoie le nombre de scènes
 * traitées. Les tests l'appellent directement.
 */
export async function processExplorationQueue(
  db: Db,
  opts: { limit?: number; logger?: WorkerLogger; mapId?: string } = {},
): Promise<number> {
  const limit = opts.limit ?? BATCH;
  let done = 0;
  while (done < limit) {
    const map = await claimQueuedExploration(db, opts.mapId);
    if (!map) break;
    const started = performance.now();
    try {
      const version = await exploreMap(db, map, { correlationId: uuidv7() }, SYSTEM_ACTOR);
      opts.logger?.debug(
        { mapId: map.id, version, ms: Math.round(performance.now() - started) },
        'exploration : scène explorée',
      );
    } catch (err) {
      await requeueExploration(db, map).catch(() => undefined);
      throw err;
    }
    done++;
  }
  return done;
}

/** Démarre le travailleur ; renvoie la fonction d'arrêt. */
export function startExplorationWorker(opts: {
  db: Db;
  logger?: WorkerLogger;
  pollMs?: number;
}): () => Promise<void> {
  const { db, logger } = opts;
  let stopped = false;
  let running: Promise<void> | undefined;
  let again = false;
  /** Réveils en attente, un par délai (une rafale d'écritures n'en programme pas plus). */
  const timers = new Map<number, NodeJS.Timeout>();

  const drain = async () => {
    do {
      again = false;
      try {
        const n = await processExplorationQueue(db, { logger });
        // Lot plein : il en reste peut-être
        if (n >= BATCH) again = true;
      } catch (err) {
        logger?.warn(
          { error: err instanceof Error ? err.message : String(err) },
          'exploration : calcul impossible, scène remise en file',
        );
        return;
      }
    } while (again && !stopped);
  };

  const trigger = () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = drain().finally(() => {
      running = undefined;
    });
  };

  const unsubscribe = onExplorationQueued(() => {
    if (stopped) return;
    for (const ms of KICK_DELAYS_MS) {
      if (timers.has(ms)) continue;
      const t = setTimeout(() => {
        timers.delete(ms);
        trigger();
      }, ms);
      t.unref();
      timers.set(ms, t);
    }
  });
  const poll = setInterval(trigger, opts.pollMs ?? DEFAULT_POLL_MS);
  poll.unref();
  trigger();

  return async () => {
    stopped = true;
    unsubscribe();
    clearInterval(poll);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    await running;
  };
}
