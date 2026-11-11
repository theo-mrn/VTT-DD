/**
 * Ouvrier des tâches d'archive (docs/export-campagne.md § 5) : prend une tâche due, la mène
 * (export, import, duplication), note l'avancement, puis son issue. Une panne passagère (réseau,
 * service indisponible) est réessayée ; une erreur de l'archive ou un refus d'un service est
 * définitive. Passe d'entretien : archives expirées et envois abandonnés effacés.
 */
import type { Actor } from '@vtt/contracts';
import { and, eq, isNotNull, lt, or } from 'drizzle-orm';
import { ServiceError } from '../clients/services.js';
import { appendEvent } from '../db/outbox.js';
import { jobs, type JobRow } from '../db/schema.js';
import type { Deps } from '../deps.js';
import { archiveKey, claimJob, MAX_ATTEMPTS, setProgress } from '../jobs/repository.js';
import { ArchiveError } from '../zip/read.js';
import { exportCampaign } from './export.js';
import { importArchive } from './import.js';

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

const SYSTEM: Actor = { userId: null, role: 'system', characterId: null };
const userActor = (userId: string): Actor => ({ userId, role: 'user', characterId: null });
const ctx = (jobId: string) => ({ correlationId: `archive-job-${jobId}`, traceparent: null });

/** Écart minimal entre deux écritures d'avancement. */
const PROGRESS_EVERY_MS = 1_000;
/** Conservation d'une tâche échouée dans le centre. */
const FAILED_KEEP_MS = 7 * 24 * 3600_000;
const COPY_SUFFIX = ' (copie)';

/** Erreur définitive : rejouer ne changerait rien. */
function permanent(error: unknown): string | null {
  if (error instanceof ArchiveError) return error.code;
  if (error instanceof ServiceError && error.status >= 400 && error.status < 500) return error.code;
  return null;
}

export async function runJob(deps: Deps, job: JobRow, log: Log): Promise<void> {
  const { db, store, services, config } = deps;
  if (!store || !services) throw new Error('stockage ou services absents');
  let last = 0;
  const report = (step: JobRow['step'] & string, progress: number) => {
    const t = Date.now();
    if (t - last < PROGRESS_EVERY_MS && progress < 1) return;
    last = t;
    void setProgress(db, job.id, step as never, progress, deps.now()).catch(() => {});
  };
  const span = (from: number, to: number) => (step: string, p: number) =>
    report(step as never, from + (to - from) * p);
  const exportKey = archiveKey('exports', job.userId, job.id);
  const work = { store, services, now: deps.now };

  try {
    if (job.kind === 'export') {
      const phase = { collect: span(0, 0.1), files: span(0.1, 0.15), write: span(0.15, 1) };
      const r = await exportCampaign(
        work,
        job.sourceCampaignId!,
        { keepProgress: job.keepProgress },
        exportKey,
        (s, p) => phase[s](s, p),
      );
      const now = deps.now();
      await db.transaction(async (tx) => {
        await tx
          .update(jobs)
          .set({
            status: 'ready',
            step: 'done',
            progress: 1,
            objectKey: exportKey,
            size: r.size,
            campaignName: r.name.slice(0, 200),
            error: null,
            lockedUntil: null,
            expiresAt: new Date(now.getTime() + config.ARCHIVE_RETENTION_DAYS * 24 * 3600_000),
            updatedAt: now,
          })
          .where(eq(jobs.id, job.id));
        await appendEvent(tx, ctx(job.id), {
          type: 'archive.export_ready',
          actor: userActor(job.userId),
          aggregate: { type: 'archive_job', id: job.id },
          payload: { jobId: job.id, size: r.size, files: r.manifest.files.length },
          campaignId: job.sourceCampaignId,
        });
      });
      return;
    }

    let source = job.objectKey!;
    let override: Parameters<typeof importArchive>[4];
    let share = { read: span(0, 0.1), files: span(0.1, 0.8), create: span(0.8, 1) };
    if (job.kind === 'duplicate') {
      const phase = { collect: span(0, 0.05), files: span(0.05, 0.1), write: span(0.1, 0.5) };
      await exportCampaign(
        work,
        job.sourceCampaignId!,
        { keepProgress: job.keepProgress },
        exportKey,
        (s, p) => phase[s](s, p),
      );
      source = exportKey;
      override = {
        options: { keepProgress: job.keepProgress },
        name: (n) => `${n.slice(0, 100 - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
      };
      share = { read: span(0.5, 0.55), files: span(0.55, 0.9), create: span(0.9, 1) };
    }
    const r = await importArchive(work, source, job.userId, (s, p) => share[s](s, p), override);
    const now = deps.now();
    await db.transaction(async (tx) => {
      await tx
        .update(jobs)
        .set({
          status: 'ready',
          step: 'done',
          progress: 1,
          campaignId: r.campaignId,
          campaignName: r.name.slice(0, 200),
          objectKey: null,
          error: null,
          lockedUntil: null,
          updatedAt: now,
        })
        .where(eq(jobs.id, job.id));
      await appendEvent(tx, ctx(job.id), {
        type: job.kind === 'import' ? 'archive.import_completed' : 'archive.duplicate_completed',
        actor: { userId: job.userId, role: 'gm', characterId: null },
        aggregate: { type: 'archive_job', id: job.id },
        payload: { jobId: job.id, sourceCampaignId: job.sourceCampaignId },
        campaignId: r.campaignId,
      });
    });
    await store.remove([source]).catch(() => {});
  } catch (error) {
    const code = permanent(error);
    const now = deps.now();
    log.warn(
      { jobId: job.id, kind: job.kind, error: (error as Error).message, code },
      'tâche d’archive en échec',
    );
    if (!code && job.attempts < MAX_ATTEMPTS) {
      await db
        .update(jobs)
        .set({
          status: 'pending',
          lockedUntil: null,
          runAfter: new Date(now.getTime() + job.attempts * 60_000),
          updatedAt: now,
        })
        .where(eq(jobs.id, job.id));
      return;
    }
    // Échec définitif : rien ne reste sur R2 (archive partielle, archive envoyée)
    const leftovers = [exportKey, ...(job.objectKey ? [job.objectKey] : [])];
    await store.remove([...new Set(leftovers)]).catch(() => {});
    await db.transaction(async (tx) => {
      await tx
        .update(jobs)
        .set({
          status: 'failed',
          error: code ?? 'internal',
          objectKey: null,
          lockedUntil: null,
          expiresAt: null,
          updatedAt: now,
        })
        .where(eq(jobs.id, job.id));
      await appendEvent(tx, ctx(job.id), {
        type: 'archive.job_failed',
        actor: userActor(job.userId),
        aggregate: { type: 'archive_job', id: job.id },
        payload: { jobId: job.id, kind: job.kind, code: code ?? 'internal' },
      });
    });
  }
}

/** Efface les archives expirées, les envois abandonnés et les vieux échecs. */
export async function sweep(deps: Pick<Deps, 'db' | 'store' | 'now'>): Promise<number> {
  const { db, store } = deps;
  const now = deps.now();
  const stale = await db
    .select()
    .from(jobs)
    .where(
      or(
        and(isNotNull(jobs.expiresAt), lt(jobs.expiresAt, now)),
        and(
          eq(jobs.status, 'failed'),
          lt(jobs.updatedAt, new Date(now.getTime() - FAILED_KEEP_MS)),
        ),
      ),
    )
    .limit(500);
  for (const job of stale) {
    if (job.objectKey) await store?.remove([job.objectKey]);
    await db.transaction(async (tx) => {
      await tx.delete(jobs).where(eq(jobs.id, job.id));
      await appendEvent(tx, ctx(job.id), {
        type: 'archive.job_expired',
        actor: SYSTEM,
        aggregate: { type: 'archive_job', id: job.id },
        payload: { jobId: job.id, kind: job.kind, status: job.status },
      });
    });
  }
  return stale.length;
}

/** Lance `workers` ouvriers et la passe d'entretien ; rend l'arrêt. */
export function startWorkers(deps: Deps, log: Log): () => Promise<void> {
  let running = true;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const loops = Array.from({ length: deps.config.ARCHIVE_WORKERS }, async () => {
    while (running) {
      const job = await claimJob(deps.db, deps.now()).catch((e: unknown) => {
        log.warn({ error: (e as Error).message }, 'file des archives illisible');
        return null;
      });
      if (!job) {
        await sleep(2_000);
        continue;
      }
      log.info({ jobId: job.id, kind: job.kind, attempt: job.attempts }, 'tâche d’archive');
      await runJob(deps, job, log).catch((e: unknown) =>
        log.warn({ jobId: job.id, error: (e as Error).message }, 'tâche d’archive interrompue'),
      );
    }
  });
  const timer = setInterval(() => {
    void sweep(deps).catch((e: unknown) =>
      log.warn({ error: (e as Error).message }, 'entretien des archives en échec'),
    );
  }, 10 * 60_000);
  return async () => {
    running = false;
    clearInterval(timer);
    await Promise.all(loops);
  };
}
