/**
 * Stockage objet (R2) par le client S3 : liste par pages (jeton de suite), suppression
 * par lots de 1000 avec les refus signalés, dossier entier, et rien sans configuration.
 */
import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createObjectStore, memoryObjectStore, removePrefix } from './storage.js';

const SETTINGS = {
  R2_ENDPOINT: 'http://s3.test',
  R2_BUCKET_NAME: 'vtt',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
};

afterEach(() => vi.restoreAllMocks());

describe('magasin S3', () => {
  it('sans configuration : aucun magasin', () => {
    expect(createObjectStore({})).toBeUndefined();
    expect(createObjectStore({ ...SETTINGS, R2_BUCKET_NAME: undefined })).toBeUndefined();
  });

  it('liste toutes les pages d’un préfixe (taille et date par défaut si absentes)', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (cmd: {
      input: { ContinuationToken?: string; Prefix: string };
    }) =>
      cmd.input.ContinuationToken
        ? { Contents: [{ Key: 'p/c', Size: 3, LastModified: new Date(5) }], IsTruncated: false }
        : {
            Contents: [{ Key: 'p/a', Size: 1, LastModified: new Date(1) }, { Key: 'p/b' }, {}],
            IsTruncated: true,
            NextContinuationToken: 'suite',
          }) as never);
    const store = createObjectStore(SETTINGS)!;
    const seen = [];
    for await (const o of store.list('p/')) seen.push(o);
    expect(seen).toEqual([
      { key: 'p/a', size: 1, lastModified: new Date(1) },
      { key: 'p/b', size: 0, lastModified: new Date(0) },
      { key: 'p/c', size: 3, lastModified: new Date(5) },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[0]![0] as { input: object }).input).toMatchObject({
      Bucket: 'vtt',
      Prefix: 'p/',
    });
  });

  it('supprime par lots de 1000 ; un refus du stockage fait échouer la passe', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation((async () => ({ Errors: [] })) as never);
    const store = createObjectStore(SETTINGS)!;
    const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
    expect(await store.remove(keys)).toBe(2500);
    expect(send).toHaveBeenCalledTimes(3);
    const first = send.mock.calls[0]![0] as {
      input: { Delete: { Objects: unknown[]; Quiet: boolean } };
    };
    expect(first.input.Delete.Objects).toHaveLength(1000);
    expect(first.input.Delete.Quiet).toBe(true);
    send.mockImplementationOnce((async () => ({
      Errors: [{ Key: 'k1', Code: 'AccessDenied' }],
    })) as never);
    await expect(store.remove(['k1'])).rejects.toThrow('suppression refusée : k1 (AccessDenied)');
    expect(await store.remove([])).toBe(0);
  });
});

describe('dossier entier', () => {
  it('supprime tout le préfixe ; vide : rien ; préfixe sans « / » refusé', async () => {
    const { store, objects } = memoryObjectStore(
      {
        'characters/a/1.webp': new Date(),
        'characters/a/2.webp': new Date(),
        'characters/b/1.webp': new Date(),
      },
      { 'characters/a/1.webp': 10 },
    );
    const sizes = [];
    for await (const o of store.list('characters/a/')) sizes.push(o.size);
    expect(sizes).toEqual([10, 1]);
    expect(await removePrefix(store, 'characters/a/')).toBe(2);
    expect([...objects.keys()]).toEqual(['characters/b/1.webp']);
    expect(await removePrefix(store, 'characters/z/')).toBe(0);
    await expect(removePrefix(store, 'characters')).rejects.toThrow('préfixe sans « / » final');
  });
});
