/**
 * Fichiers audio sur le stockage objet (R2) :
 * - envoi direct par le navigateur sur une URL PUT signée (type et longueur signés) ;
 * - lecture de l'en-tête et du début d'un objet (vérification du type réel) ;
 * - téléchargement, dépôt, copie et suppression pour le worker.
 *
 * Dossiers :
 *   audio/incoming/<campaignId>/<assetId>        envoi brut, supprimé après traitement (24 h au plus)
 *   audio/assets/<campaignId>/<assetId>/…        original.<ext> et playback.<ext>
 *   audio/catalog/…                              catalogue publié (scripts/publish-catalog.ts)
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AudioConfig } from '../config.js';
import { withoutTrailingSlashes } from '@vtt/platform';

export const INCOMING_PREFIX = 'audio/incoming/';

export const incomingKey = (campaignId: string, assetId: string) =>
  `${INCOMING_PREFIX}${campaignId}/${assetId}`;
export const assetFolder = (campaignId: string, assetId: string) =>
  `audio/assets/${campaignId}/${assetId}/`;

export interface ObjectHead {
  size: number;
  contentType: string | null;
}

export interface AudioStorage {
  /** URL publique d'un objet. */
  publicUrl(key: string): string;
  signUpload(r: {
    key: string;
    contentType: string;
    size: number;
    expiresIn: number;
  }): Promise<string>;
  head(key: string): Promise<ObjectHead | null>;
  /** Premiers octets d'un objet (au plus `bytes`). */
  readStart(key: string, bytes: number): Promise<Buffer>;
  download(key: string, file: string): Promise<void>;
  upload(key: string, file: string, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Objets d'un préfixe modifiés avant `before`. */
  listOlderThan(prefix: string, before: Date, limit?: number): Promise<string[]>;
}

/** Stockage S3, ou undefined si non configuré (envoi et worker indisponibles). */
export function createS3Storage(
  config: Pick<
    AudioConfig,
    | 'R2_ENDPOINT'
    | 'R2_REGION'
    | 'R2_BUCKET_NAME'
    | 'R2_ACCESS_KEY_ID'
    | 'R2_SECRET_ACCESS_KEY'
    | 'R2_PUBLIC_URL'
  >,
): AudioStorage | undefined {
  const { R2_ENDPOINT, R2_REGION, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = config;
  if (!R2_ENDPOINT || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)
    return undefined;
  const bucket = R2_BUCKET_NAME;
  const base = withoutTrailingSlashes(
    config.R2_PUBLIC_URL ?? `${withoutTrailingSlashes(R2_ENDPOINT)}/${bucket}`,
  );

  const client = new S3Client({
    endpoint: R2_ENDPOINT,
    region: R2_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    // Sans cela, le SDK signe une somme CRC32 du corps vide : tout envoi réel serait refusé
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const missing = (e: unknown) => {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    return (
      err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404
    );
  };

  return {
    publicUrl: (key) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`,

    signUpload: (r) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: r.key,
          ContentType: r.contentType,
          ContentLength: r.size,
        }),
        { expiresIn: r.expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
      ),

    async head(key) {
      try {
        const h = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: h.ContentLength ?? 0, contentType: h.ContentType ?? null };
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },

    async readStart(key, bytes) {
      const r = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      );
      const body = await r.Body!.transformToByteArray();
      return Buffer.from(body.subarray(0, bytes));
    },

    async download(key, file) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      await pipeline(r.Body as Readable, createWriteStream(file));
    },

    async upload(key, file, contentType) {
      const { size } = await stat(file);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: createReadStream(file),
          ContentLength: size,
          ContentType: contentType,
          // Clé jamais réutilisée (id de l'asset) : cache long
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },

    async remove(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        if (!batch.length) continue;
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },

    async listOlderThan(prefix, before, limit = 1000) {
      const out: string[] = [];
      let token: string | undefined;
      do {
        const r = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const o of r.Contents ?? [])
          if (o.Key && o.LastModified && o.LastModified < before) out.push(o.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token && out.length < limit);
      return out.slice(0, limit);
    },
  };
}
