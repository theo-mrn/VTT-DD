/** Tâches d'archive (table `jobs`) : forme de l'API, file de l'ouvrier, avancement. */
import type { ArchiveJob, ArchiveJobStep } from '@vtt/contracts';
import { and, eq, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { jobs, type JobRow } from '../db/schema.js';

export const toApi = (j: JobRow): ArchiveJob => ({
  id: j.id,
  kind: j.kind,
  status: j.status,
  step: j.step,
  progress: Math.min(1, Math.max(0, j.progress)),
  sourceCampaignId: j.sourceCampaignId,
  campaignId: j.campaignId,
  campaignName: j.campaignName,
  keepProgress: j.keepProgress,
  size: j.size,
  error: j.error,
  createdAt: j.createdAt.toISOString(),
  updatedAt: j.updatedAt.toISOString(),
  expiresAt: j.expiresAt?.toISOString() ?? null,
});

/** Clé R2 d'une archive : `exports/<compte>/<tâche>.yner` ou `imports/…`. */
export const archiveKey = (folder: 'exports' | 'imports', userId: string, jobId: string) =>
  `${folder}/${userId}/${jobId}.yner`;

/** Essais d'une tâche avant l'échec définitif. */
export const MAX_ATTEMPTS = 3;
/** Verrou d'une tâche en cours, prolongé à chaque avancement. */
export const LOCK_MS = 10 * 60_000;

/**
 * Prend la prochaine tâche due (en attente, ou en cours dont l'ouvrier a disparu) ; null s'il
 * n'y en a pas. `SKIP LOCKED` : plusieurs ouvriers ne prennent jamais la même.
 */
export async function claimJob(db: Db, now: Date): Promise<JobRow | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          lte(jobs.runAfter, now),
          or(
            eq(jobs.status, 'pending'),
            and(eq(jobs.status, 'running'), lte(jobs.lockedUntil, now)),
          ),
        ),
      )
      .orderBy(jobs.runAfter)
      .limit(1)
      .for('update', { skipLocked: true });
    if (!next) return null;
    const [row] = await tx
      .update(jobs)
      .set({
        status: 'running',
        attempts: sql`${jobs.attempts} + 1`,
        lockedUntil: new Date(now.getTime() + LOCK_MS),
        updatedAt: now,
      })
      .where(eq(jobs.id, next.id))
      .returning();
    return row ?? null;
  });
}

/** Avancement d'une tâche en cours (et son verrou prolongé). */
export async function setProgress(
  db: Db,
  id: string,
  step: ArchiveJobStep,
  progress: number,
  now: Date,
): Promise<void> {
  await db
    .update(jobs)
    .set({
      step,
      progress: Math.min(1, Math.max(0, progress)),
      lockedUntil: new Date(now.getTime() + LOCK_MS),
      updatedAt: now,
    })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'running')));
}
