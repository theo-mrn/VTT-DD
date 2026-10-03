/**
 * Entretien du stockage (docs/nettoyage.md) : lister les fichiers d'un dossier et les supprimer.
 * Mêmes variables `S3_*` que les envois (R2 en prod, SeaweedFS en dev).
 */
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client, type StorageSettings } from './uploads.js';

export interface StoredObject {
  key: string;
  size: number;
  lastModified: Date;
}

export interface ObjectStore {
  /** Fichiers sous le préfixe, par pages de 1000. */
  list(prefix: string): AsyncIterable<StoredObject>;
  /** Supprime ces clés (par lots de 1000) ; renvoie le nombre supprimé. */
  remove(keys: readonly string[]): Promise<number>;
}

/** Magasin S3, ou undefined si le stockage n'est pas configuré. */
export function createObjectStore(s: StorageSettings): ObjectStore | undefined {
  const s3 = s3Client(s);
  if (!s3) return undefined;
  const { client, bucket } = s3;
  return {
    async *list(prefix) {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const o of page.Contents ?? [])
          if (o.Key)
            yield { key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) };
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
    async remove(keys) {
      let removed = 0;
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        const r = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (r.Errors?.length)
          throw new Error(`suppression refusée : ${r.Errors[0]!.Key} (${r.Errors[0]!.Code})`);
        removed += batch.length;
      }
      return removed;
    },
  };
}

/** Supprime tout un dossier (`characters/<id>/`) ; renvoie le nombre de fichiers supprimés. */
export async function removePrefix(store: ObjectStore, prefix: string): Promise<number> {
  if (!prefix.endsWith('/')) throw new Error(`préfixe sans « / » final : ${prefix}`);
  const keys: string[] = [];
  for await (const o of store.list(prefix)) keys.push(o.key);
  return keys.length ? store.remove(keys) : 0;
}

/** Magasin en mémoire, pour les tests (taille 1 par défaut, ou `sizes[clé]`). */
export function memoryObjectStore(
  initial: Record<string, Date> = {},
  sizes: Record<string, number> = {},
) {
  const objects = new Map(Object.entries(initial));
  const store: ObjectStore = {
    async *list(prefix) {
      for (const [key, lastModified] of [...objects].sort(([a], [b]) => a.localeCompare(b)))
        if (key.startsWith(prefix)) yield { key, size: sizes[key] ?? 1, lastModified };
    },
    async remove(keys) {
      let n = 0;
      for (const k of keys) if (objects.delete(k)) n += 1;
      return n;
    },
  };
  return { store, objects };
}
