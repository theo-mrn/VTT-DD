/** Stockage des packs en mémoire, pour les tests (même contrat que R2). */
import type { PackStorage } from '../storage/storage.js';

export const PUBLIC_BASE = 'https://files.test';

interface StoredObject {
  body: Buffer;
  contentType: string;
  size: number;
}

export function memoryStorage() {
  const objects = new Map<string, StoredObject>();
  const copies: { from: string; to: string }[] = [];
  const storage: PackStorage = {
    publicBase: PUBLIC_BASE,
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.size, contentType: o.contentType } : null;
    },
    async copy(sourceKey, targetKey, contentType) {
      const o = objects.get(sourceKey);
      if (!o) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
      objects.set(targetKey, { ...o, contentType });
      copies.push({ from: sourceKey, to: targetKey });
    },
    async putJson(key, body) {
      objects.set(key, { body, contentType: 'application/json', size: body.length });
    },
    async getText(key) {
      const o = objects.get(key);
      if (!o) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
      return o.body.toString('utf8');
    },
    async removePrefix(prefix) {
      let n = 0;
      for (const key of [...objects.keys()])
        if (key.startsWith(prefix)) {
          objects.delete(key);
          n += 1;
        }
      return n;
    },
  };
  return {
    storage,
    objects,
    copies,
    /** Dépose un fichier « envoyé » ; rend son adresse publique. */
    seed(key: string, contentType = 'image/webp', size = 1000) {
      objects.set(key, { body: Buffer.alloc(0), contentType, size });
      return `${PUBLIC_BASE}/${key}`;
    },
  };
}
