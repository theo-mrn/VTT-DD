/** Stockage en mémoire pour les tests : mêmes opérations que R2. */
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { ArchiveStore } from '../storage/store.js';

export function memoryStore(publicBase = 'https://files.test') {
  const objects = new Map<string, { data: Buffer; contentType: string }>();
  const missing = (key: string) => new Error(`absent : ${key}`);
  const store: ArchiveStore = {
    publicBase,
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.data.length, contentType: o.contentType } : null;
    },
    async read(key) {
      const o = objects.get(key);
      if (!o) throw missing(key);
      return Readable.from([o.data]);
    },
    async readRange(key, start, end) {
      const o = objects.get(key);
      if (!o) throw missing(key);
      return Readable.from([o.data.subarray(start, end)]);
    },
    async write(key, stream, contentType) {
      objects.set(key, { data: await buffer(stream), contentType });
    },
    async remove(keys) {
      for (const k of keys) objects.delete(k);
    },
    signedPut: async (key, size) => `${publicBase}/signed-put/${key}?size=${size}`,
    signedGet: async (key, fileName) =>
      `${publicBase}/signed-get/${key}?name=${encodeURIComponent(fileName)}`,
  };
  const put = (key: string, data: Buffer | string, contentType = 'application/octet-stream') =>
    objects.set(key, { data: Buffer.from(data), contentType });
  return { store, objects, put };
}
