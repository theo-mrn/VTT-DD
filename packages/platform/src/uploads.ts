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
  UPLOAD_ERRORS,
  UPLOAD_EXTENSIONS,
  UPLOAD_USAGES,
  uuidv7,
  type FileUploadRequest,
  type FileUploadTicket,
  type UploadContentType,
  type UploadUsageId,
} from '@vtt/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { HttpError } from './middleware/error-handler.js';

/** Variables du stockage, communes aux services. */
export interface StorageSettings {
  S3_ENDPOINT?: string | undefined;
  S3_REGION?: string | undefined;
  S3_BUCKET?: string | undefined;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
  /** Adresse publique des fichiers (domaine R2 en prod). */
  S3_PUBLIC_URL?: string | undefined;
}

export interface PutSignature {
  key: string;
  contentType: UploadContentType;
  size: number;
  expiresIn: number;
}

/** Produit une URL PUT présignée. Injectable pour les tests. */
export type PutSigner = (s: PutSignature) => Promise<string>;

/** Signataire S3 (R2, SeaweedFS), ou undefined si le stockage n'est pas configuré. */
export function createPutSigner(s: StorageSettings): PutSigner | undefined {
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
  return (x) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: x.key,
        ContentType: x.contentType,
        ContentLength: x.size,
      }),
      { expiresIn: x.expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
    );
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

export class Uploads {
  readonly publicBase: string | null;

  constructor(
    private readonly signer: PutSigner | undefined,
    publicUrl: string | undefined,
    private readonly expiresIn = UPLOAD_EXPIRY_SECONDS,
  ) {
    this.publicBase = publicUrl ? publicUrl.replace(/\/+$/, '') : null;
  }

  static fromSettings(s: StorageSettings): Uploads {
    return new Uploads(createPutSigner(s), s.S3_PUBLIC_URL);
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
  ): Promise<FileUploadTicket> {
    if (!allowed.includes(req.usage)) throw uploadErrors.usageNotAllowed(req.usage);
    const refus = checkUpload(req);
    if (refus)
      throw new HttpError(
        refus.code === UPLOAD_ERRORS.tooLarge ? 413 : 415,
        refus.code === UPLOAD_ERRORS.tooLarge ? 'Fichier trop lourd' : 'Format refusé',
        refus.code,
        refus.message,
      );
    if (!this.signer || !this.publicBase) throw uploadErrors.storageUnavailable();
    const contentType = req.contentType as UploadContentType;
    const key = uploadKey(req.usage, owner, contentType);
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
