/**
 * Stockage réel (SeaweedFS de `pnpm dev`, TEST_S3_ENDPOINT) : envoi par URL
 * signée comme le navigateur, type et taille signés, lecture partielle,
 * dépôt, liste et suppression.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createS3Storage } from './s3.js';

const endpoint = process.env.TEST_S3_ENDPOINT;

describe.skipIf(!endpoint)('stockage S3 (SeaweedFS)', () => {
  const storage = createS3Storage({
    S3_ENDPOINT: endpoint,
    S3_REGION: 'auto',
    S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'vtt-dev',
    S3_ACCESS_KEY_ID: 'dev',
    S3_SECRET_ACCESS_KEY: 'dev-secret',
    S3_PUBLIC_URL: `${endpoint}/${process.env.TEST_S3_BUCKET ?? 'vtt-dev'}`,
  })!;
  const prefix = `audio/test/${crypto.randomUUID()}/`;
  const body = Buffer.concat([Buffer.from('ID3\x04\x00', 'latin1'), Buffer.alloc(10_000, 1)]);
  afterAll(async () =>
    storage.remove(await storage.listOlderThan(prefix, new Date(Date.now() + 60_000))),
  );

  it('envoi signé, lecture du début, téléchargement, dépôt, suppression', async () => {
    const key = `${prefix}incoming`;
    const url = await storage.signUpload({
      key,
      contentType: 'audio/mpeg',
      size: body.length,
      expiresIn: 60,
    });
    const put = await fetch(url, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'audio/mpeg' },
    });
    expect(put.status).toBe(200);
    expect(await storage.head(key)).toEqual({ size: body.length, contentType: 'audio/mpeg' });
    expect((await storage.readStart(key, 4096)).subarray(0, 3).toString()).toBe('ID3');
    const dir = mkdtempSync(join(tmpdir(), 's3-'));
    await storage.download(key, join(dir, 'f'));
    expect(readFileSync(join(dir, 'f')).equals(body)).toBe(true);
    writeFileSync(join(dir, 'g'), 'ok');
    await storage.upload(`${prefix}assets/playback.mp3`, join(dir, 'g'), 'audio/mpeg');
    const pub = await fetch(storage.publicUrl(`${prefix}assets/playback.mp3`), {
      headers: { Origin: 'http://localhost:3000', Range: 'bytes=0-0' },
    });
    expect([200, 206]).toContain(pub.status);
    expect(await storage.listOlderThan(prefix, new Date(Date.now() + 60_000))).toHaveLength(2);
    await storage.remove([key]);
    expect(await storage.head(key)).toBeNull();
  });

  it('type et longueur font partie de la signature (vérifiée par R2 ; SeaweedFS local ne contrôle pas)', async () => {
    const url = new URL(
      await storage.signUpload({
        key: `${prefix}x`,
        contentType: 'audio/mpeg',
        size: 10,
        expiresIn: 60,
      }),
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'host']),
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });
});
