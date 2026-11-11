/**
 * Centre des exports, de bout en bout dans le service (docs/export-campagne.md § 5 et 6) :
 * routes, file de l'ouvrier, issues, entretien et compte supprimé. campaign, character et
 * audio sont simulés ; la base est réelle.
 */
import { uuidv7, type ArchiveJob, type EventEnvelope } from '@vtt/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleEvent } from '../../consumer/events.js';
import { claimJob } from '../../jobs/repository.js';
import { fakeServices } from '../../test/fake-services.js';
import {
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import { runJob, sweep } from '../../worker/loop.js';

const C = uuidv7();
const log = { info: () => {}, warn: () => {} };

describe.skipIf(!TEST_DATABASE_URL)('centre des exports', () => {
  let t: TestContext;
  let gm: TestUser;
  let player: TestUser;
  let fake: ReturnType<typeof fakeServices>;

  beforeEach(async () => {
    fake = fakeServices({
      campaign: {
        schemaVersion: '0040',
        gmIds: [],
        files: [],
        tables: {
          campaigns: [{ id: C, name: 'La Crypte', systemId: 'dnd-classic', systemVersion: '1' }],
        },
      },
    });
    t = await testApp(fake.services);
    gm = await t.user();
    player = await t.user();
    fake.services.role = async (_c, userId) =>
      userId === gm.id ? 'gm' : userId === player.id ? 'player' : null;
  });

  afterEach(async () => {
    await t.close();
  });

  const call = (u: TestUser, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    t.app.inject({ method, url, headers: u.auth, ...(payload ? { payload } : {}) });

  /** L'ouvrier mène la prochaine tâche due. */
  async function work() {
    const job = await claimJob(t.deps.db, t.deps.now());
    expect(job).not.toBeNull();
    await runJob(t.deps, job!, log);
  }

  async function jobOf(u: TestUser, id: string): Promise<ArchiveJob> {
    const list = (await call(u, 'GET', '/v1/archives/jobs')).json() as { jobs: ArchiveJob[] };
    return list.jobs.find((j) => j.id === id)!;
  }

  it('exporte une campagne pour son MJ seulement, une à la fois', async () => {
    expect((await call(player, 'POST', '/v1/archives/exports', { campaignId: C })).statusCode).toBe(
      403,
    );
    const res = await call(gm, 'POST', '/v1/archives/exports', { campaignId: C });
    expect(res.statusCode, res.body).toBe(202);
    const job = res.json() as ArchiveJob;
    expect(job).toMatchObject({ kind: 'export', status: 'pending', keepProgress: true });
    expect((await call(gm, 'POST', '/v1/archives/exports', { campaignId: C })).statusCode).toBe(
      409,
    );

    await work();
    const done = await jobOf(gm, job.id);
    expect(done).toMatchObject({
      status: 'ready',
      step: 'done',
      progress: 1,
      campaignName: 'La Crypte',
    });
    expect(done.size).toBeGreaterThan(0);
    expect(done.expiresAt).not.toBeNull();

    const dl = await call(gm, 'GET', `/v1/archives/jobs/${job.id}/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.json().url).toContain('La%20Crypte');
    expect((await call(player, 'GET', `/v1/archives/jobs/${job.id}/download`)).statusCode).toBe(
      404,
    );
  });

  it('refuse une clé d’API', async () => {
    const bot = await t.user(['user', 'api']);
    fake.services.role = async () => 'gm';
    expect((await call(bot, 'POST', '/v1/archives/exports', { campaignId: C })).statusCode).toBe(
      403,
    );
  });

  it('importe une archive envoyée, puis efface le fichier envoyé', async () => {
    // Une archive réelle, faite par un export
    const exp = (
      await call(gm, 'POST', '/v1/archives/exports', { campaignId: C })
    ).json() as ArchiveJob;
    await work();
    const exportKey = `exports/${gm.id}/${exp.id}.yner`;
    const bytes = t.files.objects.get(exportKey)!.data;

    const ticket = await call(gm, 'POST', '/v1/archives/imports', { size: bytes.length });
    expect(ticket.statusCode, ticket.body).toBe(201);
    const { job, uploadUrl } = ticket.json() as { job: ArchiveJob; uploadUrl: string };
    expect(job.status).toBe('uploading');
    expect(uploadUrl).toContain(`imports/${gm.id}/${job.id}.yner`);
    expect((await call(gm, 'POST', `/v1/archives/jobs/${job.id}/start`)).statusCode).toBe(400);

    t.files.put(`imports/${gm.id}/${job.id}.yner`, bytes, 'application/zip');
    expect((await call(gm, 'POST', `/v1/archives/jobs/${job.id}/start`)).statusCode).toBe(202);
    await work();
    const done = await jobOf(gm, job.id);
    expect(done).toMatchObject({ status: 'ready', campaignName: 'La Crypte' });
    expect(done.campaignId).toBe(fake.imports[0]!.campaignId);
    expect(fake.imports.map((i) => i.body.ownerId)).toEqual([gm.id, gm.id, gm.id]);
    expect(t.files.objects.has(`imports/${gm.id}/${job.id}.yner`)).toBe(false);
  });

  it('échoue net sur une archive invalide et ne garde rien', async () => {
    const { job } = (await call(gm, 'POST', '/v1/archives/imports', { size: 10 })).json() as {
      job: ArchiveJob;
    };
    t.files.put(`imports/${gm.id}/${job.id}.yner`, 'pas un zip', 'application/zip');
    await call(gm, 'POST', `/v1/archives/jobs/${job.id}/start`);
    await work();
    expect(await jobOf(gm, job.id)).toMatchObject({ status: 'failed', error: 'archive_invalid' });
    expect(t.files.objects.size).toBe(0);
    expect(fake.imports).toEqual([]);
  });

  it('duplique une campagne sans archive à télécharger', async () => {
    const res = await call(gm, 'POST', '/v1/archives/duplicates', { campaignId: C });
    const job = res.json() as ArchiveJob;
    expect(job.keepProgress).toBe(false);
    await work();
    const done = await jobOf(gm, job.id);
    expect(done).toMatchObject({ status: 'ready', campaignName: 'La Crypte (copie)' });
    expect(t.files.objects.size).toBe(0);
    expect((await call(gm, 'GET', `/v1/archives/jobs/${job.id}/download`)).statusCode).toBe(404);
  });

  it('efface une tâche et son archive, puis les archives expirées', async () => {
    const a = (
      await call(gm, 'POST', '/v1/archives/exports', { campaignId: C })
    ).json() as ArchiveJob;
    await work();
    expect((await call(gm, 'DELETE', `/v1/archives/jobs/${a.id}`)).statusCode).toBe(204);
    expect(t.files.objects.size).toBe(0);

    const b = (
      await call(gm, 'POST', '/v1/archives/exports', { campaignId: C })
    ).json() as ArchiveJob;
    await work();
    expect(t.files.objects.size).toBe(1);
    t.advance(8 * 24 * 3600_000);
    expect((await call(gm, 'GET', `/v1/archives/jobs/${b.id}/download`)).statusCode).toBe(410);
    await sweep(t.deps);
    expect(await jobOf(gm, b.id)).toBeUndefined();
    expect(t.files.objects.size).toBe(0);
  });

  it('oublie tout d’un compte supprimé', async () => {
    const a = (
      await call(gm, 'POST', '/v1/archives/exports', { campaignId: C })
    ).json() as ArchiveJob;
    await work();
    const event = {
      id: uuidv7(),
      type: 'identity.user_deleted',
      aggregate: { type: 'user', id: gm.id },
      payload: {},
      correlationId: 'test',
      traceparent: null,
    } as unknown as EventEnvelope;
    const deps = { db: t.deps.db, store: t.deps.store };
    expect(await handleEvent(deps, 'test-archive', event)).toBe('applied');
    expect(await handleEvent(deps, 'test-archive', event)).toBe('duplicate');
    expect(await jobOf(gm, a.id)).toBeUndefined();
    expect(t.files.objects.size).toBe(0);
  });
});
