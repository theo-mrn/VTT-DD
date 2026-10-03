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
  'image/vnd.microsoft.icon': 'ico',
  'image/x-icon': 'ico',
};
const TAILLE_MAX = 5 * 1024 * 1024;

export type EnvoiImage = (dataUrl: string) => Promise<string>;

/** Image hébergée sur Firebase Storage (à rapatrier avant la fermeture du projet). */
export function estFirebaseStorage(url: string | null | undefined): url is string {
  return !!url && url.startsWith('https://firebasestorage.googleapis.com/');
}

/** L'image n'existe plus à son adresse (404) : le lien est mort. */
export class ImageDisparue extends Error {
  constructor() {
    super('image disparue (404)');
  }
}

/** Télécharge une image distante et la rend en `data:` (type vérifié, 5 Mo au plus). */
export async function telechargerImage(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) throw new ImageDisparue();
  if (!res.ok) throw new Error(`téléchargement impossible (${res.status})`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!TYPES[type]) throw new Error(`type d'image non pris en charge : ${type || 'inconnu'}`);
  const corps = Buffer.from(await res.arrayBuffer());
  if (corps.length > TAILLE_MAX) throw new Error('image de plus de 5 Mo');
  return `data:${type};base64,${corps.toString('base64')}`;
}

/** Envoyeur d'images embarquées, ou `undefined` si le stockage n'est pas configuré. */
export function envoyeurImages(env = process.env): EnvoiImage | undefined {
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
  return async (dataUrl) => {
    const m = /^data:(image\/[a-z.+-]+);base64,(.+)$/s.exec(dataUrl);
    const ext = m && TYPES[m[1]!];
    if (!m || !ext) throw new Error('image embarquée illisible ou de type non pris en charge');
    const corps = Buffer.from(m[2]!, 'base64');
    if (corps.length > TAILLE_MAX) throw new Error('image embarquée de plus de 5 Mo');
    // Nom dérivé du contenu : un import rejoué réécrit le même objet
    const cle = `characters/imported/${createHash('sha256').update(corps).digest('hex').slice(0, 32)}.${ext}`;
    await client.send(
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: cle, Body: corps, ContentType: m[1] }),
    );
    return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${cle}`;
  };
}
