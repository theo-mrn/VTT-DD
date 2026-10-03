/**
 * Envoi direct des images au stockage (R2 en prod, SeaweedFS en dev) :
 * le service signe une URL PUT à durée courte, le navigateur y envoie le
 * fichier sans passer par nous. Type et taille sont signés : le stockage
 * refuse un autre fichier que celui annoncé.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uuidv7 } from '@vtt/contracts';
import type { IdentityConfig } from '../../config.js';
import { DOSSIERS, type DemandeEnvoi, type TypeImage } from './validation.js';

/** Durée de validité d'une URL d'envoi, en secondes. */
export const EXPIRATION_ENVOI = 300;

export interface DemandeSignature {
  cle: string;
  contentType: TypeImage;
  taille: number;
  expiresIn: number;
}

/** Produit une URL PUT présignée. Injectable pour les tests. */
export type Signataire = (demande: DemandeSignature) => Promise<string>;

const EXTENSIONS: Record<TypeImage, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Clé de l'objet : avatars|banners/<userId>/<uuidv7>.<ext> (jamais réutilisée). */
export function cleFichier(
  userId: string,
  kind: DemandeEnvoi['kind'],
  contentType: TypeImage,
): string {
  return `${DOSSIERS[kind]}/${userId}/${uuidv7()}.${EXTENSIONS[contentType]}`;
}

/** Signataire S3, ou undefined si le stockage n'est pas configuré. */
export function creerSignataireS3(config: IdentityConfig): Signataire | undefined {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = config;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return undefined;

  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    // Sans cela, le SDK signe une somme CRC32 du corps vide : tout envoi réel serait refusé
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return (d) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: d.cle,
        ContentType: d.contentType,
        ContentLength: d.taille,
      }),
      {
        expiresIn: d.expiresIn,
        // Le présigneur ne signe pas content-type par défaut
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
}
