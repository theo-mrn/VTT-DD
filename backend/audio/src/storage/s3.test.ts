/**
 * Stockage S3 du son, sans stockage réel (le test de bout en bout tourne contre SeaweedFS en
 * local) : adresses publiques, URL d'envoi signée sur le type et la taille, en-tête (objet absent :
 * null), début d'un objet, téléchargement et dépôt de fichiers, suppression par lots, liste des
 * objets anciens par pages.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetFolder, createS3Storage, incomingKey } from './s3.js';

const CONFIG = {
  S3_ENDPOINT: 'http://s3.test/',
  S3_REGION: 'auto',
  S3_BUCKET: 'vtt',
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secret',
};
type Cmd = { constructor: { name: string }; input: Record<string, unknown> };
const send = (impl: (cmd: Cmd) => unknown) =>
  vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (cmd: Cmd) => impl(cmd)) as never);

afterEach(() => vi.restoreAllMocks());

describe('stockage S3 du son', () => {
  it('sans configuration : indisponible ; dossiers et adresses publiques', () => {
    expect(createS3Storage({ ...CONFIG, S3_BUCKET: undefined } as never)).toBeUndefined();
    const s = createS3Storage(CONFIG as never)!;
    expect(incomingKey('c', 'a')).toBe('audio/incoming/c/a');
    expect(assetFolder('c', 'a')).toBe('audio/assets/c/a/');
    expect(s.publicUrl('audio/assets/c/a/mon son.mp3')).toBe(
      'http://s3.test/vtt/audio/assets/c/a/mon%20son.mp3',
    );
    const cdn = createS3Storage({ ...CONFIG, S3_PUBLIC_URL: 'https://cdn.test/' } as never)!;
    expect(cdn.publicUrl('x')).toBe('https://cdn.test/x');
  });

  it('URL d’envoi signée sur le type et la taille', async () => {
    const url = await createS3Storage(CONFIG as never)!.signUpload({
      key: 'audio/incoming/c/a',
      contentType: 'audio/mpeg',
      size: 42,
      expiresIn: 60,
    });
    expect(url).toContain('/vtt/audio/incoming/c/a');
    expect(url).toContain('X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost');
  });

  it('en-tête d’un objet ; absent (404 ou NotFound) : null ; autre erreur : remontée', async () => {
    const s = createS3Storage(CONFIG as never)!;
    send(() => ({ ContentLength: 10, ContentType: 'audio/ogg' }));
    expect(await s.head('k')).toEqual({ size: 10, contentType: 'audio/ogg' });
    send(() => ({}));
    expect(await s.head('k')).toEqual({ size: 0, contentType: null });
    send(() => {
      throw Object.assign(new Error('x'), { name: 'NotFound' });
    });
    expect(await s.head('k')).toBeNull();
    send(() => {
      throw Object.assign(new Error('x'), { $metadata: { httpStatusCode: 404 } });
    });
    expect(await s.head('k')).toBeNull();
    send(() => {
      throw new Error('panne');
    });
    await expect(s.head('k')).rejects.toThrow('panne');
  });

  it('début d’un objet (plage demandée), téléchargement et dépôt d’un fichier', async () => {
    const s = createS3Storage(CONFIG as never)!;
    const dir = mkdtempSync(join(tmpdir(), 's3-'));
    const seen: Cmd[] = [];
    send((cmd) => {
      seen.push(cmd);
      if (cmd.constructor.name === 'GetObjectCommand')
        return cmd.input.Range
          ? { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3, 4, 5]) } }
          : { Body: Readable.from([Buffer.from('contenu')]) };
      return {};
    });
    expect([...(await s.readStart('k', 3))]).toEqual([1, 2, 3]);
    expect(seen[0]!.input.Range).toBe('bytes=0-2');
    await s.download('k', join(dir, 'f'));
    expect(readFileSync(join(dir, 'f'), 'utf8')).toBe('contenu');
    writeFileSync(join(dir, 'g'), 'abcd');
    await s.upload('audio/assets/c/a/playback.mp3', join(dir, 'g'), 'audio/mpeg');
    expect(seen.at(-1)!.input).toMatchObject({
      ContentLength: 4,
      ContentType: 'audio/mpeg',
      CacheControl: expect.stringContaining('immutable'),
    });
  });

  it('suppression par lots de 1000 ; liste des objets plus anciens, par pages, bornée', async () => {
    const s = createS3Storage(CONFIG as never)!;
    const deletes: number[] = [];
    send((cmd) => {
      if (cmd.constructor.name === 'DeleteObjectsCommand')
        deletes.push((cmd.input.Delete as { Objects: unknown[] }).Objects.length);
      return {};
    });
    await s.remove(Array.from({ length: 1500 }, (_, i) => `k${i}`));
    await s.remove([]);
    expect(deletes).toEqual([1000, 500]);
    const old = new Date(1_000);
    const recent = new Date(9_000);
    send((cmd) =>
      cmd.input.ContinuationToken
        ? { Contents: [{ Key: 'c', LastModified: old }], IsTruncated: false }
        : {
            Contents: [
              { Key: 'a', LastModified: old },
              { Key: 'b', LastModified: recent },
              { LastModified: old },
            ],
            IsTruncated: true,
            NextContinuationToken: 't',
          },
    );
    expect(await s.listOlderThan('audio/incoming/', new Date(5_000))).toEqual(['a', 'c']);
    expect(await s.listOlderThan('audio/incoming/', new Date(5_000), 1)).toEqual(['a']);
  });
});
