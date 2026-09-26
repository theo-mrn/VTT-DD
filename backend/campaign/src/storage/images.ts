/**
 * Images des campagnes, envoyées directement au stockage (R2 en prod,
 * SeaweedFS en dev) comme les avatars d'identity : le service signe une URL
 * PUT à durée courte, le navigateur y envoie le fichier sans passer par nous.
 * Type et taille sont signés : le stockage refuse un autre fichier que celui annoncé.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uuidv7 } from '@vtt/contracts';
import type { CampaignConfig } from '../config.js';

/** Durée de validité d'une URL d'envoi, en secondes. */
export const UPLOAD_EXPIRY = 300;

/** Taille maximale d'une image (5 Mo), comme les avatars. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const EXTENSIONS: Record<ImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Dossier des images de campagne dans le bucket partagé. */
const FOLDER = 'campaigns';

export interface SignatureRequest {
  key: string;
  contentType: ImageType;
  size: number;
  expiresIn: number;
}

/** Produit une URL PUT présignée. Injectable pour les tests. */
export type UploadSigner = (request: SignatureRequest) => Promise<string>;

/** Clé de l'objet : campaigns/<campaignId>/<uuidv7>.<ext> (jamais réutilisée). */
export function imageKey(campaignId: string, contentType: ImageType): string {
  return `${FOLDER}/${campaignId}/${uuidv7()}.${EXTENSIONS[contentType]}`;
}

/** URL publique du stockage sans barre finale, ou null si non configurée. */
export function publicBase(s3PublicUrl: string | undefined): string | null {
  return s3PublicUrl ? s3PublicUrl.replace(/\/+$/, '') : null;
}

/**
 * Une URL d'image est acceptée si elle vaut null, la valeur déjà enregistrée,
 * ou un fichier du dossier de la campagne sur notre stockage
 * ({S3_PUBLIC_URL}/campaigns/<campaignId>/<fichier>). Jamais une URL arbitraire :
 * elle serait affichée aux autres joueurs (pistage, contenu tiers).
 */
export function isAcceptedImageUrl(
  url: string | null,
  current: string | null,
  base: string | null,
  campaignId: string,
): boolean {
  if (url === null || url === current) return true;
  if (!base) return false;
  const prefix = `${base}/${FOLDER}/${campaignId}/`;
  if (!url.startsWith(prefix)) return false;
  // Un seul nom de fichier simple : ni sous-dossier, ni « .. », ni requête
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(url.slice(prefix.length));
}

/** Signataire S3, ou undefined si le stockage n'est pas configuré. */
export function createS3Signer(config: CampaignConfig): UploadSigner | undefined {
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

  return (r) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: r.key,
        ContentType: r.contentType,
        ContentLength: r.size,
      }),
      {
        expiresIn: r.expiresIn,
        // Le présigneur ne signe pas content-type par défaut
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
}
