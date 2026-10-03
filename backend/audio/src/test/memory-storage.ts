/** Stockage en mémoire pour les tests (même interface que S3). */
import { readFile, writeFile } from 'node:fs/promises';
import type { AudioStorage } from '../storage/s3.js';

export function memoryStorage(base = 'https://files.test/vtt') {
  const objects = new Map<string, { body: Buffer; contentType: string; at: Date }>();
  const storage: AudioStorage = {
    publicUrl: (key) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`,
    signUpload: async (r) =>
      `${base}/${r.key}?signed=1&type=${encodeURIComponent(r.contentType)}&size=${r.size}`,
    head: async (key) => {
      const o = objects.get(key);
      return o ? { size: o.body.length, contentType: o.contentType } : null;
    },
    readStart: async (key, bytes) => {
      const o = objects.get(key);
      if (!o) throw new Error(`objet absent : ${key}`);
      return o.body.subarray(0, bytes);
    },
    download: async (key, file) => {
      const o = objects.get(key);
      if (!o) throw Object.assign(new Error(`objet absent : ${key}`), { name: 'NoSuchKey' });
      await writeFile(file, o.body);
    },
    upload: async (key, file, contentType) => {
      objects.set(key, { body: await readFile(file), contentType, at: new Date() });
    },
    remove: async (keys) => {
      for (const k of keys) objects.delete(k);
    },
    listOlderThan: async (prefix, before) =>
      [...objects.entries()]
        .filter(([k, o]) => k.startsWith(prefix) && o.at < before)
        .map(([k]) => k),
  };
  return {
    storage,
    objects,
    /** Dépose un objet (le navigateur qui envoie sur l'URL signée). */
    put(key: string, body: Buffer, contentType = 'application/octet-stream', at = new Date()) {
      objects.set(key, { body, contentType, at });
    },
  };
}
