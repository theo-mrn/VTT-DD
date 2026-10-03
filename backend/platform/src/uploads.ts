/**
 * Envoi de fichiers, brique commune des services (docs/uploads.md) : chaque service expose la
 * même route `POST …/uploads` (contrat `FileUploadRequest` → `FileUploadTicket`), vérifie ses
 * droits, puis confie la demande à `Uploads.ticket` : validation de l'usage (format, taille),
 * clé jamais réutilisée (`<dossier>/<propriétaire>/<uuidv7>.<ext>`), URL PUT signée avec son
 * type et sa taille (le stockage refuse tout autre fichier), adresse publique.
 *
 * Stockage : R2 en prod, SeaweedFS en dev (mêmes variables `S3_*` dans chaque service).
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  checkUpload,
  uploadMaxBytes,
  UPLOAD_ERRORS,
  UPLOAD_EXTENSIONS,
  UPLOAD_USAGES,
  uuidv7,
  type FileImport,
  type FileImportRequest,
  type FileUploadRequest,
  type FileUploadTicket,
  type UploadContentType,
  type UploadUsageId,
} from '@vtt/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { HttpError } from './middleware/error-handler.js';
import {
  fetchRemoteImage,
  RemoteImageError,
  type FetchOptions,
  type RemoteImage,
} from './remote-image.js';
import { withoutTrailingSlashes } from './strings.js';

/** Variables du stockage, communes aux services. */
export interface StorageSettings {
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  /** Adresse publique des fichiers (domaine R2 en prod). */
  S3_PUBLIC_URL?: string;
}

export interface PutSignature {
  key: string;
  contentType: UploadContentType;
  size: number;
  expiresIn: number;
}

/** Produit une URL PUT présignée. Injectable pour les tests. */
export type PutSigner = (s: PutSignature) => Promise<string>;

/** Écrit un objet sur le stockage (import d'une image d'un autre site). Injectable pour les tests. */
export type ObjectWriter = (o: {
  key: string;
  body: Buffer;
  contentType: UploadContentType;
}) => Promise<void>;

/**
 * Réserve la place d'un fichier avant de signer son envoi (quota de la campagne,
 * docs/stockage.md) : lève une erreur HTTP (422 `storage_quota_exceeded`) s'il n'y en a plus.
 */
export type UploadReserve = (f: {
  key: string;
  size: number;
  usage: UploadUsageId;
  contentType: UploadContentType;
}) => Promise<void>;

/** Télécharge une image d'un autre site. Injectable pour les tests. */
export type RemoteFetcher = (url: string, o: FetchOptions) => Promise<RemoteImage>;

/** Client S3 du stockage, ou undefined s'il n'est pas configuré. */
export function s3Client(s: StorageSettings) {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = s;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return undefined;
  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    // Sans cela, le SDK signe une somme CRC32 du corps vide : tout envoi réel serait refusé
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return { client, bucket: S3_BUCKET };
}

/** Signataire S3 (R2, SeaweedFS), ou undefined si le stockage n'est pas configuré. */
export function createPutSigner(s: StorageSettings): PutSigner | undefined {
  const s3 = s3Client(s);
  if (!s3) return undefined;
  return (x) =>
    getSignedUrl(
      s3.client,
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: x.key,
        ContentType: x.contentType,
        ContentLength: x.size,
      }),
      { expiresIn: x.expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
    );
}

/** Écrivain S3, ou undefined si le stockage n'est pas configuré. */
export function createObjectWriter(s: StorageSettings): ObjectWriter | undefined {
  const s3 = s3Client(s);
  if (!s3) return undefined;
  return async (o) => {
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: o.key,
        Body: o.body,
        ContentType: o.contentType,
        ContentLength: o.body.length,
      }),
    );
  };
}

/** Durée de validité d'une URL d'envoi, en secondes. */
export const UPLOAD_EXPIRY_SECONDS = 300;

export const uploadErrors = {
  storageUnavailable: () =>
    new HttpError(
      503,
      'Service indisponible',
      UPLOAD_ERRORS.storageUnavailable,
      'L’envoi de fichiers n’est pas configuré sur ce serveur',
    ),
  usageNotAllowed: (usage: string) =>
    new HttpError(
      422,
      'Usage refusé',
      UPLOAD_ERRORS.usageNotAllowed,
      `« ${usage} » ne s’envoie pas par cette route`,
    ),
};

/** Refus d'un envoi par les règles de son usage : trop lourd (413) ou format refusé (415). */
function uploadRefusal(refus: { code: string; message: string }): HttpError {
  return new HttpError(
    refus.code === UPLOAD_ERRORS.tooLarge ? 413 : 415,
    refus.code === UPLOAD_ERRORS.tooLarge ? 'Fichier trop lourd' : 'Format refusé',
    refus.code,
    refus.message,
  );
}

/** Import refusé : adresse non publique, fichier trop lourd, pas une image, ou échec. */
function importRefusal(err: RemoteImageError): HttpError {
  if (err.reason === 'address')
    return new HttpError(422, 'Adresse refusée', UPLOAD_ERRORS.addressNotAllowed, err.message);
  if (err.reason === 'too_large')
    return new HttpError(413, 'Fichier trop lourd', UPLOAD_ERRORS.tooLarge, err.message);
  if (err.reason === 'not_image')
    return new HttpError(415, 'Format refusé', UPLOAD_ERRORS.unsupportedType, err.message);
  return new HttpError(422, 'Import impossible', UPLOAD_ERRORS.importFailed, err.message);
}

export class Uploads {
  readonly publicBase: string | null;

  constructor(
    private readonly signer: PutSigner | undefined,
    publicUrl: string | undefined,
    private readonly expiresIn = UPLOAD_EXPIRY_SECONDS,
    private readonly writer?: ObjectWriter,
    private readonly fetchRemote: RemoteFetcher = fetchRemoteImage,
  ) {
    this.publicBase = publicUrl ? withoutTrailingSlashes(publicUrl) : null;
  }

  static fromSettings(s: StorageSettings): Uploads {
    return new Uploads(
      createPutSigner(s),
      s.S3_PUBLIC_URL,
      UPLOAD_EXPIRY_SECONDS,
      createObjectWriter(s),
    );
  }

  /** Le stockage est configuré (sinon la route répond 503). */
  get available(): boolean {
    return Boolean(this.signer && this.publicBase);
  }

  /**
   * Billet d'envoi pour `owner` (utilisateur, campagne, personnage : les droits sont déjà
   * vérifiés par la route), si l'usage fait partie de ceux que cette route signe.
   */
  async ticket(
    req: FileUploadRequest,
    owner: string,
    allowed: readonly UploadUsageId[],
    log: FastifyBaseLogger,
    reserve?: UploadReserve,
  ): Promise<FileUploadTicket> {
    if (!allowed.includes(req.usage)) throw uploadErrors.usageNotAllowed(req.usage);
    const refus = checkUpload(req);
    if (refus) throw uploadRefusal(refus);
    if (!this.signer || !this.publicBase) throw uploadErrors.storageUnavailable();
    const contentType = req.contentType as UploadContentType;
    const key = uploadKey(req.usage, owner, contentType);
    await reserve?.({ key, size: req.size, usage: req.usage, contentType });
    let url: string;
    try {
      url = await this.signer({ key, contentType, size: req.size, expiresIn: this.expiresIn });
    } catch (err) {
      log.error({ err, usage: req.usage }, 'signature de l’URL d’envoi impossible');
      throw uploadErrors.storageUnavailable();
    }
    log.info({ usage: req.usage, key, size: req.size, name: req.name }, 'envoi signé');
    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': contentType },
      publicUrl: `${this.publicBase}/${key}`,
      key,
      expiresAt: new Date(Date.now() + this.expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Import d'une image d'un autre site pour `owner` (droits vérifiés par la route) : téléchargée
   * par le service (adresses publiques seulement, voir remote-image.ts), format lu dans son
   * contenu, rangée comme un envoi (`<dossier>/<propriétaire>/<uuidv7>.<ext>`).
   */
  async importFromUrl(
    req: FileImportRequest,
    owner: string,
    allowed: readonly UploadUsageId[],
    log: FastifyBaseLogger,
    reserve?: UploadReserve,
  ): Promise<FileImport> {
    if (!allowed.includes(req.usage)) throw uploadErrors.usageNotAllowed(req.usage);
    if (!this.writer || !this.publicBase) throw uploadErrors.storageUnavailable();
    const maxBytes = Math.max(
      ...UPLOAD_USAGES[req.usage].types.map((t) => uploadMaxBytes(req.usage, t)),
    );
    let image: RemoteImage;
    try {
      image = await this.fetchRemote(req.url, { maxBytes });
    } catch (err) {
      if (!(err instanceof RemoteImageError)) throw err;
      log.info({ usage: req.usage, reason: err.reason }, 'import refusé');
      throw importRefusal(err);
    }
    const refus = checkUpload({
      usage: req.usage,
      contentType: image.contentType,
      size: image.body.length,
    });
    if (refus) throw uploadRefusal(refus);
    const key = uploadKey(req.usage, owner, image.contentType);
    await reserve?.({
      key,
      size: image.body.length,
      usage: req.usage,
      contentType: image.contentType,
    });
    try {
      await this.writer({ key, body: image.body, contentType: image.contentType });
    } catch (err) {
      log.error({ err, usage: req.usage }, 'écriture de l’image importée impossible');
      throw uploadErrors.storageUnavailable();
    }
    log.info({ usage: req.usage, key, size: image.body.length }, 'image importée');
    return {
      publicUrl: `${this.publicBase}/${key}`,
      key,
      contentType: image.contentType,
      size: image.body.length,
    };
  }

  /**
   * L'adresse désigne un fichier de ce dossier et de ce propriétaire sur notre stockage (un
   * seul nom simple : ni sous-dossier, ni « .. », ni requête).
   */
  isOwnFile(url: string, folder: string, owner: string): boolean {
    if (!this.publicBase) return false;
    const prefix = `${this.publicBase}/${folder}/${owner}/`;
    return (
      url.startsWith(prefix) && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(url.slice(prefix.length))
    );
  }
}

/** Clé de l'objet : `<dossier>/<propriétaire>/<uuidv7>.<ext>` (jamais réutilisée). */
export function uploadKey(
  usage: UploadUsageId,
  owner: string,
  contentType: UploadContentType,
): string {
  return `${UPLOAD_USAGES[usage].folder}/${owner}/${uuidv7()}.${UPLOAD_EXTENSIONS[contentType]}`;
}
