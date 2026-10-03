/**
 * Images de campagne encore sur Firebase Storage : téléchargées puis envoyées
 * dans le stockage S3 à l'import (variables S3_* de l'environnement, comme
 * pour les images envoyées depuis l'app). Nom dérivé du contenu : un import
 * rejoué réécrit le même objet.
 *
 * La carte réutilise le même rapatriement (`mediaRehoster`) avec des limites
 * plus larges (fonds vidéo) et les images en `data:` de l'ancienne app.
 */
import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_SIZE = 5 * 1024 * 1024;

/** Médias de la carte : images, fonds animés (vidéo) et sons. */
export const MAP_MEDIA_TYPES: Record<string, string> = {
  ...TYPES,
  'image/avif': 'avif',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
};

export interface RehostOptions {
  /** Types acceptés (type MIME → extension). */
  types?: Record<string, string>;
  /** Taille maximale en octets. */
  maxSize?: number;
  /** Dossier des objets dans le bucket. */
  folder?: string;
}

export function isFirebaseStorage(url: string | null | undefined): url is string {
  return !!url && url.startsWith('https://firebasestorage.googleapis.com/');
}

/** Image en ligne `data:image/…;base64,…` (champs d'image de l'ancienne carte). */
export function isDataUrl(url: string | null | undefined): url is string {
  return !!url && /^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(url);
}

/** Copie une image distante dans le stockage ; `undefined` si le stockage n'est pas configuré. */
export function imageRehoster(env = process.env): ((url: string) => Promise<string>) | undefined {
  return mediaRehoster(env);
}

/**
 * Copie un média (URL Firebase Storage ou `data:`) dans le stockage ;
 * `undefined` si le stockage n'est pas configuré.
 */
export function mediaRehoster(
  env = process.env,
  options: RehostOptions = {},
): ((url: string) => Promise<string>) | undefined {
  const types = options.types ?? TYPES;
  const maxSize = options.maxSize ?? MAX_SIZE;
  const folder = options.folder ?? 'campaigns/imported';
  const {
    R2_ENDPOINT,
    R2_REGION,
    R2_BUCKET_NAME,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_URL,
  } = env;
  if (
    !R2_ENDPOINT ||
    !R2_BUCKET_NAME ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_PUBLIC_URL
  )
    return undefined;
  const client = new S3Client({
    endpoint: R2_ENDPOINT,
    region: R2_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return async (url) => {
    let type: string;
    let body: Buffer;
    if (isDataUrl(url)) {
      const comma = url.indexOf(',');
      type = url.slice(5, url.indexOf(';')).toLowerCase();
      body = Buffer.from(url.slice(comma + 1), 'base64');
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`téléchargement impossible (${res.status})`);
      type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
      body = Buffer.from(await res.arrayBuffer());
    }
    const ext = types[type];
    if (!ext) throw new Error(`type de média non pris en charge : ${type || 'inconnu'}`);
    if (body.length > maxSize)
      throw new Error(`média de plus de ${Math.round(maxSize / 1024 / 1024)} Mo`);
    const key = `${folder}/${createHash('sha256').update(body).digest('hex').slice(0, 32)}.${ext}`;
    await client.send(
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: body, ContentType: type }),
    );
    return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  };
}
