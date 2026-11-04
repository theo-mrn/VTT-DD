/**
 * Fichiers d'une image sur R2 (docs/bibliotheque.md § Fichiers sur R2) : clés fixes, déduites
 * de la source, pour qu'un import relancé retrouve ce qui est déjà envoyé ; conversions sharp.
 */
import { HeadObjectCommand, NotFound, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, type StorageSettings } from '@vtt/platform';
import sharp from 'sharp';
import type { SourceId } from './sources.js';

export const keysOf = (source: SourceId, id: string) => ({
  original: `library/originals/${source}/${id}.png`,
  full: `library/backgrounds/${id}.webp`,
  thumb: `library/backgrounds/thumbs/${id}.webp`,
});

/** Les clés ne changent jamais de contenu : cache d'un an. */
const CACHE = 'public, max-age=31536000, immutable';

export interface Bucket {
  /** Taille de l'objet, ou null s'il n'existe pas. */
  size(key: string): Promise<number | null>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

export function r2Bucket(settings: StorageSettings): Bucket {
  const s3 = s3Client(settings);
  if (!s3)
    throw new Error('R2 non configuré : R2_ENDPOINT, R2_BUCKET_NAME et les clés sont requis');
  const { client, bucket } = s3;
  return {
    async size(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return r.ContentLength ?? 0;
      } catch (e) {
        if (e instanceof NotFound || (e as { name?: string }).name === 'NotFound') return null;
        throw e;
      }
    },
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: CACHE,
        }),
      );
    },
  };
}

/** Image pleine taille servie (WebP qualité 82). */
export const fullWebp = (png: Buffer) => sharp(png).webp({ quality: 82, effort: 6 }).toBuffer();

/** Plan de carte servi : 2048 px au plus de côté, WebP qualité 80 (la place sur R2 est comptée). */
export const mapWebp = (image: Buffer) =>
  sharp(image)
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 })
    .toBuffer({ resolveWithObject: true });

/** Vignette de 480 px de large. */
export const thumbWebp = (png: Buffer) =>
  sharp(png).resize({ width: 480 }).webp({ quality: 78 }).toBuffer();

/** Image envoyée au modèle pour la description : 1024 px de large suffisent à la lire. */
export const describeImage = (png: Buffer) =>
  sharp(png).resize({ width: 1024, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();

export async function dimensions(png: Buffer) {
  const m = await sharp(png).metadata();
  return { width: m.width ?? null, height: m.height ?? null };
}
