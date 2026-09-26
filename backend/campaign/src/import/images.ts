/**
 * Images de campagne encore sur Firebase Storage : téléchargées puis envoyées
 * dans le stockage S3 à l'import (variables S3_* de l'environnement, comme
 * pour les images envoyées depuis l'app). Nom dérivé du contenu : un import
 * rejoué réécrit le même objet.
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

export function isFirebaseStorage(url: string | null | undefined): url is string {
  return !!url && url.startsWith('https://firebasestorage.googleapis.com/');
}

/** Copie une image distante dans le stockage ; `undefined` si le stockage n'est pas configuré. */
export function imageRehoster(env = process.env): ((url: string) => Promise<string>) | undefined {
  const {
    S3_ENDPOINT,
    S3_REGION,
    S3_BUCKET,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
    S3_PUBLIC_URL,
  } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_PUBLIC_URL)
    return undefined;
  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`téléchargement impossible (${res.status})`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    const ext = TYPES[type];
    if (!ext) throw new Error(`type d'image non pris en charge : ${type || 'inconnu'}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_SIZE) throw new Error('image de plus de 5 Mo');
    const key = `campaigns/imported/${createHash('sha256').update(body).digest('hex').slice(0, 32)}.${ext}`;
    await client.send(
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: type }),
    );
    return `${S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  };
}
