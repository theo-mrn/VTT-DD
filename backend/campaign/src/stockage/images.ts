/**
 * Images des salles, envoyées directement au stockage (R2 en prod, SeaweedFS
 * en dev) comme les avatars d'identity : le service signe une URL PUT à durée
 * courte, le navigateur y envoie le fichier sans passer par nous. Type et
 * taille sont signés : le stockage refuse un autre fichier que celui annoncé.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uuidv7 } from '@vtt/contracts';
import type { CampaignConfig } from '../config.js';

/** Durée de validité d'une URL d'envoi, en secondes. */
export const EXPIRATION_ENVOI = 300;

/** Taille maximale d'une image (5 Mo), comme les avatars. */
export const IMAGE_MAX_OCTETS = 5 * 1024 * 1024;

export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type TypeImage = (typeof TYPES_IMAGE)[number];

const EXTENSIONS: Record<TypeImage, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Dossier des images de salle dans le bucket partagé. */
const DOSSIER = 'rooms';

export interface DemandeSignature {
  cle: string;
  contentType: TypeImage;
  taille: number;
  expiresIn: number;
}

/** Produit une URL PUT présignée. Injectable pour les tests. */
export type Signataire = (demande: DemandeSignature) => Promise<string>;

/** Clé de l'objet : rooms/<roomId>/<uuidv7>.<ext> (jamais réutilisée). */
export function cleImage(roomId: string, contentType: TypeImage): string {
  return `${DOSSIER}/${roomId}/${uuidv7()}.${EXTENSIONS[contentType]}`;
}

/** URL publique du stockage sans barre finale, ou null si non configurée. */
export function basePublique(s3PublicUrl: string | undefined): string | null {
  return s3PublicUrl ? s3PublicUrl.replace(/\/+$/, '') : null;
}

/**
 * Une URL d'image est acceptée si elle vaut null, la valeur déjà enregistrée,
 * ou un fichier du dossier de la salle sur notre stockage
 * ({S3_PUBLIC_URL}/rooms/<roomId>/<fichier>). Jamais une URL arbitraire :
 * elle serait affichée aux autres joueurs (pistage, contenu tiers).
 */
export function urlImageAcceptee(
  url: string | null,
  actuelle: string | null,
  base: string | null,
  roomId: string,
): boolean {
  if (url === null || url === actuelle) return true;
  if (!base) return false;
  const prefixe = `${base}/${DOSSIER}/${roomId}/`;
  if (!url.startsWith(prefixe)) return false;
  // Un seul nom de fichier simple : ni sous-dossier, ni « .. », ni requête
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(url.slice(prefixe.length));
}

/** Signataire S3, ou undefined si le stockage n'est pas configuré. */
export function creerSignataireS3(config: CampaignConfig): Signataire | undefined {
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
