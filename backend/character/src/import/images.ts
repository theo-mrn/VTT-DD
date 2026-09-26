/**
 * Images embarquées (`data:image/...;base64,`) : l'ancienne app stockait
 * parfois l'avatar directement dans la fiche. Elles sont envoyées dans le
 * stockage S3 et remplacées par leur adresse publique. Configuration lue
 * dans l'environnement (mêmes variables `S3_*` qu'identity et campaign).
 */
import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const TAILLE_MAX = 5 * 1024 * 1024;

export type EnvoiImage = (dataUrl: string) => Promise<string>;

/** Envoyeur d'images embarquées, ou `undefined` si le stockage n'est pas configuré. */
export function envoyeurImages(env = process.env): EnvoiImage | undefined {
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
  return async (dataUrl) => {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl);
    const ext = m && TYPES[m[1]!];
    if (!m || !ext) throw new Error('image embarquée illisible ou de type non pris en charge');
    const corps = Buffer.from(m[2]!, 'base64');
    if (corps.length > TAILLE_MAX) throw new Error('image embarquée de plus de 5 Mo');
    // Nom dérivé du contenu : un import rejoué réécrit le même objet
    const cle = `characters/imported/${createHash('sha256').update(corps).digest('hex').slice(0, 32)}.${ext}`;
    await client.send(
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: cle, Body: corps, ContentType: m[1] }),
    );
    return `${S3_PUBLIC_URL.replace(/\/$/, '')}/${cle}`;
  };
}
