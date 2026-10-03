/**
 * Médias des campagnes (images, vidéos de fond), envoyés directement au stockage
 * (R2) comme les avatars d'identity : le service signe une
 * URL PUT à durée courte, le navigateur y envoie le fichier sans passer par nous.
 * Type et taille sont signés : le stockage refuse un autre fichier que celui annoncé.
 *
 * Trois portes, une seule signature (`signUpload`) : l'image de la campagne
 * (`/image`, 5 Mo), les images des notes (`/notes/upload`) et les médias de la carte
 * (`/media` : images 10 Mo, vidéos webm ou mp4 100 Mo, contrat @vtt/contracts).
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MEDIA_IMAGE_TYPES, MEDIA_VIDEO_TYPES, uuidv7 } from '@vtt/contracts';
import { HttpError, withoutTrailingSlashes } from '@vtt/platform';
import type { FastifyBaseLogger } from 'fastify';
import type { CampaignConfig } from '../config.js';

/** Durée de validité d'une URL d'envoi, en secondes. */
export const UPLOAD_EXPIRY = 300;

/** Taille maximale d'une image (5 Mo), comme les avatars. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** Tout type de média accepté par l'une des portes d'envoi. */
export type MediaType =
  ImageType | (typeof MEDIA_IMAGE_TYPES)[number] | (typeof MEDIA_VIDEO_TYPES)[number];

const EXTENSIONS: Record<MediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

/** Dossier des images de campagne dans le bucket partagé. */
const FOLDER = 'campaigns';

export interface SignatureRequest {
  key: string;
  contentType: MediaType;
  size: number;
  expiresIn: number;
}

/** Produit une URL PUT présignée. Injectable pour les tests. */
export type UploadSigner = (request: SignatureRequest) => Promise<string>;

/** Clé de l'objet : campaigns/<campaignId>/<uuidv7>.<ext> (jamais réutilisée). */
export function mediaKey(campaignId: string, contentType: MediaType): string {
  return `${FOLDER}/${campaignId}/${uuidv7()}.${EXTENSIONS[contentType]}`;
}

export const storageUnavailable = () =>
  new HttpError(
    503,
    'Service indisponible',
    'storage_unavailable',
    'L’envoi de fichiers n’est pas configuré sur ce serveur',
  );

/**
 * URL d'envoi d'un média de la campagne et son URL publique. Stockage absent ou
 * signature impossible : 503 `storage_unavailable`. Droits vérifiés par l'appelant.
 */
export async function signUpload(
  signer: UploadSigner | undefined,
  s3PublicUrl: string | undefined,
  campaignId: string,
  file: { contentType: MediaType; size: number },
  log: FastifyBaseLogger,
) {
  const base = publicBase(s3PublicUrl);
  if (!signer || !base) throw storageUnavailable();
  const key = mediaKey(campaignId, file.contentType);
  let uploadUrl: string;
  try {
    uploadUrl = await signer({ key, ...file, expiresIn: UPLOAD_EXPIRY });
  } catch (err) {
    log.error({ err }, 'signature de l’URL d’envoi impossible');
    throw storageUnavailable();
  }
  return { uploadUrl, publicUrl: `${base}/${key}`, expiresIn: UPLOAD_EXPIRY };
}

/** URL publique du stockage sans barre finale, ou null si non configurée. */
export function publicBase(s3PublicUrl: string | undefined): string | null {
  return s3PublicUrl ? withoutTrailingSlashes(s3PublicUrl) : null;
}

/**
 * Image de la bibliothèque du produit (couvertures proposées par le front) :
 * https, sous PRESET_IMAGES_URL, sans identifiants, requête, fragment ni
 * segment « .. ».
 */
export function isPresetImageUrl(url: string, presetBase: string | null): boolean {
  if (!presetBase) return false;
  let u: URL;
  let b: URL;
  try {
    u = new URL(url);
    b = new URL(presetBase.endsWith('/') ? presetBase : `${presetBase}/`);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.origin !== b.origin) return false;
  if (u.username || u.password || u.search || u.hash) return false;
  if (!u.pathname.startsWith(b.pathname)) return false;
  // `new URL` résout déjà « .. » ; on refuse aussi sa forme encodée
  return !/(^|\/)(\.|%2e){1,2}(\/|$)/i.test(url.slice(b.origin.length));
}

/**
 * Une URL d'image est acceptée si elle vaut null, la valeur déjà enregistrée,
 * une image de la bibliothèque du produit (PRESET_IMAGES_URL), ou un fichier
 * du dossier de la campagne sur notre stockage
 * ({R2_PUBLIC_URL}/campaigns/<campaignId>/<fichier>). Jamais une URL arbitraire :
 * elle serait affichée aux autres joueurs (pistage, contenu tiers).
 */
export function isAcceptedImageUrl(
  url: string | null,
  current: string | null,
  base: string | null,
  campaignId: string,
  presetBase: string | null = null,
): boolean {
  if (url === null || url === current) return true;
  if (isPresetImageUrl(url, presetBase)) return true;
  if (!base) return false;
  const prefix = `${base}/${FOLDER}/${campaignId}/`;
  if (!url.startsWith(prefix)) return false;
  // Un seul nom de fichier simple : ni sous-dossier, ni « .. », ni requête
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(url.slice(prefix.length));
}

/** Signataire S3, ou undefined si le stockage n'est pas configuré. */
export function createS3Signer(config: CampaignConfig): UploadSigner | undefined {
  const { R2_ENDPOINT, R2_REGION, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = config;
  if (!R2_ENDPOINT || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)
    return undefined;

  const client = new S3Client({
    endpoint: R2_ENDPOINT,
    region: R2_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    // Sans cela, le SDK signe une somme CRC32 du corps vide : tout envoi réel serait refusé
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return (r) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
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
