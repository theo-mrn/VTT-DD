/**
 * Worker avec le vrai ffmpeg sur des fichiers générés : mp3 gardé, wav
 * transcodé en m4a, fichier corrompu refusé, catalogue analysé, purge.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assets, jobs } from '../db/schema.js';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../test/test-app.js';
import type { WorkerDeps } from './jobs.js';
import { drain, maintenance } from './loop.js';

const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const hasFfmpeg = (() => {
  try {
    execFileSync(ffmpeg, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('worker ffmpeg', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-fixtures-'));
  const fixtures: Record<string, Buffer> = {};
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let c: Awaited<ReturnType<TestContext['table']>>;
  let deps: WorkerDeps;

  beforeAll(() => {
    const gen = (name: string, args: string[]) => {
      const out = join(dir, name);
      execFileSync(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:duration=3',
        ...args,
        out,
      ]);
      fixtures[name] = readFileSync(out);
    };
    gen('tone.mp3', ['-c:a', 'libmp3lame', '-b:a', '128k']);
    gen('tone.wav', ['-c:a', 'pcm_s16le']);
    fixtures['broken.mp3'] = Buffer.concat([
      Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'),
      Buffer.alloc(5000, 7),
    ]);
  });

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    c = await t.table();
    deps = {
      db: t.db!,
      storage: t.files.storage,
      config: { ...t.config, WORKER_TMP_DIR: tmpdir() },
    };
  });
  afterEach(async () => t.close());

  async function upload(file: string, contentType: string) {
    const body = fixtures[file]!;
    const ticket = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets/uploads`, {
      fileName: file,
      contentType,
      size: body.length,
      kind: 'music',
    });
    t.files.put(new URL(ticket.uploadUrl).pathname.replace(/^\/vtt\//, ''), body, contentType);
    return h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
      source: 'upload',
      uploadToken: ticket.uploadToken,
      name: file,
      kind: 'music',
    });
  }
  const row = async (id: string) =>
    (await t.db!.select().from(assets).where(eq(assets.id, id)))[0]!;

  it('mp3 gardé tel quel : durée, loudness, gain, URL servie, événement', async () => {
    const a = await upload('tone.mp3', 'audio/mpeg');
    expect(await drain(deps, Infinity, c.id)).toBeGreaterThanOrEqual(1);
    const r = await row(a.id);
    expect(r.status).toBe('ready');
    expect(r.codec).toBe('mp3');
    expect(Math.abs(r.durationMs! - 3000)).toBeLessThan(100);
    expect(r.loudnessLufs).toBeLessThan(0);
    expect(r.gainDb).toBeGreaterThanOrEqual(-12);
    expect(r.gainDb).toBeLessThanOrEqual(6);
    expect(r.playbackKey).toBe(`audio/assets/${c.id}/${a.id}/original.mp3`);
    expect([...t.files.objects.keys()].some((k) => k.startsWith('audio/incoming/'))).toBe(false);
    const ready = (await h.events(c.id)).find((e) => e.type === 'audio.asset_ready')!;
    expect(ready.payload.asset.url).toBe(
      `https://files.test/vtt/audio/assets/${c.id}/${a.id}/original.mp3`,
    );
  });

  it('wav transcodé en AAC (m4a), original gardé', async () => {
    const a = await upload('tone.wav', 'audio/wav');
    await drain(deps, Infinity, c.id);
    const r = await row(a.id);
    expect(r).toMatchObject({
      status: 'ready',
      mimeType: 'audio/mp4',
      playbackKey: `audio/assets/${c.id}/${a.id}/playback.m4a`,
    });
    expect(t.files.objects.has(`audio/assets/${c.id}/${a.id}/original.wav`)).toBe(true);
  });

  it('fichier corrompu : refusé sans nouvelle tentative, événement', async () => {
    const a = await upload('broken.mp3', 'audio/mpeg');
    await drain(deps, Infinity, c.id);
    const r = await row(a.id);
    expect(r.status).toBe('rejected');
    expect(r.rejectReason).toBeTruthy();
    const [job] = await t.db!.select().from(jobs).where(eq(jobs.assetId, a.id));
    expect(job).toMatchObject({ status: 'failed', attempts: 1 });
    expect((await h.events(c.id)).some((e) => e.type === 'audio.asset_rejected')).toBe(true);
  });

  it('catalogue : durée et loudness relevées, URL d’origine gardée', async () => {
    deps.fetch = (async () => new Response(fixtures['tone.mp3'])) as unknown as typeof fetch;
    const a = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
      source: 'catalog',
      catalogId: 'default.nature.pluie',
    });
    await drain(deps, Infinity, c.id);
    const r = await row(a.id);
    expect(r.status).toBe('ready');
    expect(r.playbackKey).toBeNull();
    expect(r.playbackUrl).toBe('https://assets.yner.fr/Audio/pluit.mp3');
    expect(r.durationMs).toBeGreaterThan(2900);
  });

  it('erreur passagère : nouvelle tentative plus tard', async () => {
    const a = await upload('tone.mp3', 'audio/mpeg');
    const storage = {
      ...deps.storage,
      download: async () => {
        throw new Error('réseau');
      },
    };
    await drain({ ...deps, storage }, Infinity, c.id);
    const [job] = await t.db!.select().from(jobs).where(eq(jobs.assetId, a.id));
    expect(job).toMatchObject({ status: 'pending', attempts: 1, lastError: 'réseau' });
    expect(job!.runAfter.getTime()).toBeGreaterThan(Date.now() + 5_000);
    expect((await row(a.id)).status).toBe('processing');
  });

  it('purge après suppression ; envois abandonnés effacés par l’entretien', async () => {
    const a = await upload('tone.mp3', 'audio/mpeg');
    await drain(deps, Infinity, c.id);
    await h.ok(c.gm, 'DELETE', `/v1/audio/campaigns/${c.id}/assets/${a.id}`);
    // Horloge de Postgres (conteneur) légèrement décalée de celle du test : échéance passée
    await t
      .db!.update(jobs)
      .set({ runAfter: new Date(Date.now() - 60_000) })
      .where(eq(jobs.assetId, a.id));
    await drain(deps, Infinity, c.id);
    expect([...t.files.objects.keys()].some((k) => k.includes(a.id))).toBe(false);
    t.files.put(
      `audio/incoming/${c.id}/vieux`,
      Buffer.from('x'),
      'audio/mpeg',
      new Date(Date.now() - 2 * 86_400_000),
    );
    t.files.put(`audio/incoming/${c.id}/recent`, Buffer.from('x'));
    expect((await maintenance(deps)).incoming).toBe(1);
    expect(t.files.objects.has(`audio/incoming/${c.id}/recent`)).toBe(true);
  });
});
