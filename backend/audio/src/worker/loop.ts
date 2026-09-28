/**
 * Boucle du worker : `WORKER_CONCURRENCY` jobs à la fois, réveil immédiat par
 * NOTIFY `audio_jobs` (connexion LISTEN dédiée, reconnectée), relecture
 * périodique en filet de sécurité. Entretien toutes les heures : envois
 * abandonnés (audio/incoming/ de plus de 24 h) et effets de plus de 24 h.
 */
import { lt } from 'drizzle-orm';
import pg from 'pg';
import { cues } from '../db/schema.js';
import { INCOMING_PREFIX } from '../storage/s3.js';
import { claimJob, runJob, type WorkerDeps } from './jobs.js';

const POLL_MS = 5_000;
const MAINTENANCE_MS = 3_600_000;
const DAY = 86_400_000;

export async function maintenance(deps: WorkerDeps, nowMs = Date.now()) {
  const old = await deps.storage.listOlderThan(INCOMING_PREFIX, new Date(nowMs - DAY));
  if (old.length) await deps.storage.remove(old);
  await deps.db.delete(cues).where(lt(cues.startAt, new Date(nowMs - DAY)));
  return { incoming: old.length };
}

/** Traite les jobs échus jusqu'à épuisement ; renvoie le nombre traité. */
export async function drain(
  deps: WorkerDeps,
  max = Infinity,
  onlyCampaign?: string,
): Promise<number> {
  let n = 0;
  while (n < max) {
    const job = await claimJob(deps.db, onlyCampaign);
    if (!job) break;
    await runJob(deps, job);
    n += 1;
  }
  return n;
}

export function startWorker(
  deps: WorkerDeps & {
    concurrency: number;
    listenUrl: string;
    logger: NonNullable<WorkerDeps['logger']> & { error: (o: object, m: string) => void };
  },
): () => Promise<void> {
  let stopped = false;
  let wake: (() => void) | null = null;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(t);
        wake = null;
        resolve();
      };
    });
  const bell = () => wake?.();

  // Connexion LISTEN, reconnectée après une coupure
  let listener: pg.Client | null = null;
  const listen = async () => {
    while (!stopped) {
      try {
        const client = new pg.Client({
          connectionString: deps.listenUrl,
          application_name: 'audio-worker-listen',
        });
        await client.connect();
        await client.query('LISTEN audio_jobs');
        client.on('notification', bell);
        listener = client;
        await new Promise<void>((resolve) => {
          client.on('error', () => resolve());
          client.on('end', () => resolve());
        });
        listener = null;
      } catch (error) {
        deps.logger.warn({ error: (error as Error).message }, 'worker : LISTEN indisponible');
      }
      if (!stopped) await new Promise((r) => setTimeout(r, 2_000));
    }
  };
  void listen();

  const lanes = Array.from({ length: deps.concurrency }, async () => {
    while (!stopped) {
      try {
        const n = await drain(deps, 10);
        if (n) continue;
      } catch (error) {
        deps.logger.error({ error: (error as Error).message }, 'worker : passage en échec');
      }
      await sleep(POLL_MS);
    }
  });

  const tidy = async () => {
    try {
      const r = await maintenance(deps);
      if (r.incoming) deps.logger.info(r, 'worker : envois abandonnés supprimés');
    } catch (error) {
      deps.logger.warn({ error: (error as Error).message }, 'worker : entretien en échec');
    }
  };
  void tidy();
  const timer = setInterval(() => void tidy(), MAINTENANCE_MS);

  return async () => {
    stopped = true;
    clearInterval(timer);
    bell();
    await Promise.all(lanes);
    await listener?.end().catch(() => undefined);
  };
}
