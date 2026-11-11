/**
 * Fichiers sur R2 (docs/export-campagne.md § 5) : archives (`exports/<compte>/<tâche>.yner`,
 * `imports/<compte>/<tâche>.yner`) et fichiers des campagnes, lus en flux ou par plages (lecture
 * d'un zip sans le télécharger), écrits en plusieurs parties (jamais tout en mémoire).
 */
import { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  createObjectStore,
  s3Client,
  withoutTrailingSlashes,
  type StorageSettings,
} from '@vtt/platform';

export interface ObjectHead {
  size: number;
  contentType: string | null;
}

export interface ArchiveStore {
  /** Adresse publique des fichiers, sans barre finale. */
  readonly publicBase: string;
  head(key: string): Promise<ObjectHead | null>;
  /** Contenu entier, en flux. */
  read(key: string): Promise<Readable>;
  /** Octets `start` à `end` exclu. */
  readRange(key: string, start: number, end: number): Promise<Readable>;
  /** Écrit un flux (envoi en plusieurs parties au-delà de quelques Mo). */
  write(key: string, body: Readable, contentType: string): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
  /** Envoi direct du navigateur : PUT signé, taille et type imposés. */
  signedPut(key: string, size: number, contentType: string, expiresIn: number): Promise<string>;
  /** Téléchargement : GET signé, enregistré sous `fileName`. */
  signedGet(key: string, fileName: string, expiresIn: number): Promise<string>;
}

const isMissing = (e: unknown) => {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404
  );
};

/** Parties de 16 Mio, 2 en parallèle : ≤ 32 Mio en mémoire par écriture. */
const PART_SIZE = 16 * 1024 ** 2;

export function createS3ArchiveStore(settings: StorageSettings): ArchiveStore | undefined {
  const s3 = s3Client(settings);
  const objects = createObjectStore(settings);
  if (!s3 || !objects || !settings.R2_PUBLIC_URL) return undefined;
  const { client, bucket } = s3;
  const body = (b: unknown) => {
    if (b instanceof Readable) return b;
    throw new Error('Réponse R2 sans flux');
  };
  return {
    publicBase: withoutTrailingSlashes(settings.R2_PUBLIC_URL),
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async read(key) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return body(r.Body);
    },
    async readRange(key, start, end) {
      const r = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end - 1}` }),
      );
      return body(r.Body);
    },
    async write(key, stream, contentType) {
      await new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: stream, ContentType: contentType },
        partSize: PART_SIZE,
        queueSize: 2,
        leavePartsOnError: false,
      }).done();
    },
    async remove(keys) {
      if (keys.length) await objects.remove(keys);
    },
    signedPut: (key, size, contentType, expiresIn) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentLength: size,
          ContentType: contentType,
        }),
        { expiresIn, signableHeaders: new Set(['content-length', 'content-type']) },
      ),
    signedGet: (key, fileName, expiresIn) =>
      getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          ResponseContentType: 'application/zip',
        }),
        { expiresIn },
      ),
  };
}
