/**
 * Centre des exports (docs/export-campagne.md § 6) : lancer un export, une duplication ou un
 * import, suivre ses tâches, télécharger une archive, effacer. Le travail lui-même est fait par
 * l'ouvrier (src/worker/loop.ts).
 *
 *   POST   /v1/archives/exports           export d'une campagne (MJ)
 *   POST   /v1/archives/duplicates        duplication d'une campagne (MJ)
 *   POST   /v1/archives/imports           import : tâche en attente de son fichier, URL d'envoi
 *   POST   /v1/archives/jobs/:id/start    import : fichier envoyé, tâche lancée
 *   GET    /v1/archives/jobs              mes tâches, récentes d'abord
 *   GET    /v1/archives/jobs/:id/download URL de téléchargement d'une archive prête
 *   DELETE /v1/archives/jobs/:id          efface la tâche et son archive
 */
import {
  ARCHIVE_CONTENT_TYPE,
  ARCHIVE_ERRORS,
  ArchiveDownloadTicket,
  ArchiveImportUploadRequest,
  ArchiveImportUploadTicket,
  ArchiveJob,
  ArchiveJobList,
  CreateArchiveDuplicate,
  CreateArchiveExport,
  uuidv7,
  type ArchiveJobKind,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, count, desc, eq, gte } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { appendEvent } from '../../db/outbox.js';
import { jobs, type JobRow } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { archiveKey, toApi } from '../../jobs/repository.js';
import {
  IdParams,
  eventContext,
  gmActor,
  perMinute,
  sessionUser,
  unavailable,
  userActor,
} from '../common.js';

/** Validité d'une URL signée d'envoi ou de téléchargement, en secondes. */
const UPLOAD_EXPIRY = 60 * 60;
const DOWNLOAD_EXPIRY = 5 * 60;
/** Tâches listées dans le centre. */
const LIST_LIMIT = 50;

const notFound = () =>
  new HttpError(404, 'Ressource introuvable', 'archive_job_not_found', 'Tâche introuvable');
const busy = () =>
  new HttpError(
    409,
    'Conflit',
    ARCHIVE_ERRORS.busy,
    'Un export de cette campagne est déjà en cours',
  );

/** Nom de fichier lisible : « La Crypte 2026-11-11.yner ». */
export function archiveFileName(name: string | null, at: Date): string {
  const clean = (name ?? 'campagne').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim();
  return `${clean.slice(0, 80) || 'campagne'} ${at.toISOString().slice(0, 10)}.yner`;
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };

  async function dailyQuota(userId: string) {
    const since = new Date(deps.now().getTime() - 24 * 3600_000);
    const [row] = await db
      .select({ n: count() })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), gte(jobs.createdAt, since)));
    if ((row?.n ?? 0) >= config.ARCHIVE_JOBS_PER_DAY)
      throw new HttpError(
        429,
        'Trop de demandes',
        'archive_daily_limit',
        'Limite du jour atteinte',
      );
  }

  async function startFromCampaign(
    kind: Extract<ArchiveJobKind, 'export' | 'duplicate'>,
    userId: string,
    campaignId: string,
    keepProgress: boolean,
    req: Parameters<typeof eventContext>[0],
  ): Promise<JobRow> {
    if (!deps.services || !deps.store) throw unavailable();
    if ((await deps.services.role(campaignId, userId)) !== 'gm')
      throw new HttpError(
        403,
        'Accès refusé',
        'not_gm',
        'Seul un MJ de la campagne peut l’exporter',
      );
    await dailyQuota(userId);
    try {
      return await db.transaction(async (tx) => {
        const now = deps.now();
        const [job] = await tx
          .insert(jobs)
          .values({
            id: uuidv7(),
            kind,
            userId,
            sourceCampaignId: campaignId,
            keepProgress,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            runAfter: now,
          })
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: kind === 'export' ? 'archive.export_requested' : 'archive.duplicate_requested',
          actor: gmActor(userId),
          aggregate: { type: 'archive_job', id: job!.id },
          payload: { jobId: job!.id, keepProgress },
          campaignId,
        });
        return job!;
      });
    } catch (e) {
      if ((e as { cause?: { code?: string } }).cause?.code === '23505') throw busy();
      throw e;
    }
  }

  async function ownJob(id: string, userId: string): Promise<JobRow> {
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
    if (!job) throw notFound();
    return job;
  }

  r.post(
    '/v1/archives/exports',
    {
      ...auth,
      config: perMinute(10),
      schema: { body: CreateArchiveExport, response: { 202: ArchiveJob } },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const job = await startFromCampaign(
        'export',
        userId,
        req.body.campaignId.toLowerCase(),
        req.body.keepProgress,
        req,
      );
      reply.code(202);
      return toApi(job);
    },
  );

  r.post(
    '/v1/archives/duplicates',
    {
      ...auth,
      config: perMinute(10),
      schema: { body: CreateArchiveDuplicate, response: { 202: ArchiveJob } },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const job = await startFromCampaign(
        'duplicate',
        userId,
        req.body.campaignId.toLowerCase(),
        req.body.keepProgress,
        req,
      );
      reply.code(202);
      return toApi(job);
    },
  );

  r.post(
    '/v1/archives/imports',
    {
      ...auth,
      config: perMinute(10),
      schema: { body: ArchiveImportUploadRequest, response: { 201: ArchiveImportUploadTicket } },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const store = deps.store;
      if (!deps.services || !store) throw unavailable();
      await dailyQuota(userId);
      const id = uuidv7();
      const key = archiveKey('imports', userId, id);
      const job = await db.transaction(async (tx) => {
        const now = deps.now();
        const [row] = await tx
          .insert(jobs)
          .values({
            id,
            kind: 'import',
            userId,
            keepProgress: true,
            status: 'uploading',
            objectKey: key,
            size: req.body.size,
            createdAt: now,
            updatedAt: now,
            // Envoi abandonné : effacé par la passe d'entretien
            expiresAt: new Date(now.getTime() + UPLOAD_EXPIRY * 1000),
          })
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: 'archive.import_requested',
          actor: userActor(userId),
          aggregate: { type: 'archive_job', id },
          payload: { jobId: id, size: req.body.size },
        });
        return row!;
      });
      const uploadUrl = await store.signedPut(
        key,
        req.body.size,
        ARCHIVE_CONTENT_TYPE,
        UPLOAD_EXPIRY,
      );
      reply.code(201);
      return { job: toApi(job), uploadUrl, expiresIn: UPLOAD_EXPIRY };
    },
  );

  r.post(
    '/v1/archives/jobs/:id/start',
    {
      ...auth,
      config: perMinute(20),
      schema: { params: IdParams, response: { 202: ArchiveJob } },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const job = await ownJob(req.params.id, userId);
      if (job.kind !== 'import' || job.status !== 'uploading')
        throw HttpError.conflict('Cette tâche est déjà lancée', 'archive_job_started');
      const head = deps.store && job.objectKey ? await deps.store.head(job.objectKey) : null;
      if (!head || head.size !== job.size)
        throw HttpError.badRequest('Archive pas encore envoyée', 'archive_not_uploaded');
      const started = await db.transaction(async (tx) => {
        const now = deps.now();
        const [row] = await tx
          .update(jobs)
          .set({ status: 'pending', runAfter: now, expiresAt: null, updatedAt: now })
          .where(and(eq(jobs.id, job.id), eq(jobs.status, 'uploading')))
          .returning();
        if (!row) throw HttpError.conflict('Cette tâche est déjà lancée', 'archive_job_started');
        await appendEvent(tx, eventContext(req), {
          type: 'archive.import_started',
          actor: userActor(userId),
          aggregate: { type: 'archive_job', id: job.id },
          payload: { jobId: job.id, size: head.size },
        });
        return row;
      });
      reply.code(202);
      return toApi(started);
    },
  );

  r.get(
    '/v1/archives/jobs',
    { ...auth, schema: { response: { 200: ArchiveJobList } } },
    async (req) => {
      const userId = sessionUser(req);
      const rows = await db
        .select()
        .from(jobs)
        .where(eq(jobs.userId, userId))
        .orderBy(desc(jobs.createdAt))
        .limit(LIST_LIMIT);
      return { jobs: rows.map(toApi) };
    },
  );

  r.get(
    '/v1/archives/jobs/:id/download',
    {
      ...auth,
      config: perMinute(30),
      schema: { params: IdParams, response: { 200: ArchiveDownloadTicket } },
    },
    async (req) => {
      const userId = sessionUser(req);
      const job = await ownJob(req.params.id, userId);
      if (job.kind !== 'export' || job.status !== 'ready' || !job.objectKey) throw notFound();
      if (job.expiresAt && job.expiresAt <= deps.now())
        throw new HttpError(410, 'Expirée', ARCHIVE_ERRORS.expired, 'Archive expirée');
      if (!deps.store) throw unavailable();
      const url = await deps.store.signedGet(
        job.objectKey,
        archiveFileName(job.campaignName, job.createdAt),
        DOWNLOAD_EXPIRY,
      );
      return { url, expiresIn: DOWNLOAD_EXPIRY };
    },
  );

  r.delete(
    '/v1/archives/jobs/:id',
    { ...auth, config: perMinute(30), schema: { params: IdParams } },
    async (req, reply) => {
      const userId = sessionUser(req);
      const job = await ownJob(req.params.id, userId);
      if (job.status === 'running')
        throw HttpError.conflict('Tâche en cours : attendez sa fin', 'archive_job_running');
      await db.transaction(async (tx) => {
        await tx.delete(jobs).where(eq(jobs.id, job.id));
        await appendEvent(tx, eventContext(req), {
          type: 'archive.job_deleted',
          actor: userActor(userId),
          aggregate: { type: 'archive_job', id: job.id },
          payload: { jobId: job.id, kind: job.kind, status: job.status },
        });
      });
      if (job.objectKey) await deps.store?.remove([job.objectKey]).catch(() => {});
      reply.code(204);
    },
  );
};
