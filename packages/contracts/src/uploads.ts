/**
 * Envoi de fichiers (docs/uploads.md) : une seule forme de route dans chaque service,
 * `POST …/uploads`, qui signe une URL PUT à durée courte vers R2.
 * Le navigateur y envoie le fichier directement (Uppy), sans passer par nos
 * serveurs ; type et taille sont signés : le stockage refuse tout autre fichier.
 *
 * Chaque usage déclare ses formats, sa taille maximale et son dossier : le serveur s'en sert
 * pour valider, le front pour les limites d'Uppy (mêmes valeurs des deux côtés).
 */
import { z } from 'zod';

const MB = 1024 * 1024;

/** Images fixes acceptées partout. */
export const UPLOAD_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
/** Images de la carte : AVIF en plus (fonds lourds). */
export const UPLOAD_MAP_IMAGE_TYPES = [...UPLOAD_IMAGE_TYPES, 'image/avif'] as const;
export const UPLOAD_VIDEO_TYPES = ['video/webm', 'video/mp4'] as const;

export type UploadContentType =
  (typeof UPLOAD_MAP_IMAGE_TYPES)[number] | (typeof UPLOAD_VIDEO_TYPES)[number];

/** Extension du fichier selon son type (la clé ne reprend jamais le nom envoyé). */
export const UPLOAD_EXTENSIONS: Record<UploadContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

export interface UploadUsage {
  /** Libellé à l'écran (« Portrait »). */
  label: string;
  types: readonly UploadContentType[];
  maxBytes: number;
  /** Dossier du stockage : `<folder>/<propriétaire>/<uuidv7>.<ext>`. */
  folder: 'avatars' | 'banners' | 'campaigns' | 'characters';
  /** Recadrage proposé avant l'envoi : rapport largeur / hauteur (null : libre). */
  aspect: number | null;
}

/** Tous les usages, et le service qui les signe. */
export const UPLOAD_USAGES = {
  // identity : POST /v1/users/me/uploads
  avatar: {
    label: 'Avatar',
    types: UPLOAD_IMAGE_TYPES,
    maxBytes: 5 * MB,
    folder: 'avatars',
    aspect: 1,
  },
  banner: {
    label: 'Bannière',
    types: UPLOAD_IMAGE_TYPES,
    maxBytes: 5 * MB,
    folder: 'banners',
    aspect: 4,
  },
  // campaign : POST /v1/campaigns/:id/uploads
  'campaign-image': {
    label: 'Image de la campagne',
    types: UPLOAD_IMAGE_TYPES,
    maxBytes: 5 * MB,
    folder: 'campaigns',
    aspect: 16 / 9,
  },
  'note-image': {
    label: 'Image de note',
    types: UPLOAD_IMAGE_TYPES,
    maxBytes: 10 * MB,
    folder: 'campaigns',
    aspect: null,
  },
  'map-background': {
    label: 'Fond de carte',
    types: [...UPLOAD_MAP_IMAGE_TYPES, ...UPLOAD_VIDEO_TYPES],
    maxBytes: 100 * MB,
    folder: 'campaigns',
    aspect: null,
  },
  'map-object': {
    label: 'Objet',
    types: UPLOAD_MAP_IMAGE_TYPES,
    maxBytes: 10 * MB,
    folder: 'campaigns',
    aspect: null,
  },
  // Documents projetés ou envoyés aux joueurs (docs/projection.md)
  handout: {
    label: 'Document',
    types: [...UPLOAD_MAP_IMAGE_TYPES, ...UPLOAD_VIDEO_TYPES],
    maxBytes: 100 * MB,
    folder: 'campaigns',
    aspect: null,
  },
  'npc-image': {
    label: 'Image de PNJ',
    types: UPLOAD_IMAGE_TYPES,
    maxBytes: 5 * MB,
    folder: 'campaigns',
    aspect: 1,
  },
  // character : POST /v1/characters/:id/uploads
  portrait: {
    label: 'Portrait',
    types: UPLOAD_IMAGE_TYPES,
    maxBytes: 5 * MB,
    folder: 'characters',
    aspect: 3 / 4,
  },
  token: {
    label: 'Token',
    types: UPLOAD_IMAGE_TYPES,
    maxBytes: 5 * MB,
    folder: 'characters',
    aspect: 1,
  },
} as const satisfies Record<string, UploadUsage>;

export type UploadUsageId = keyof typeof UPLOAD_USAGES;
export const UploadUsageId = z.enum(
  Object.keys(UPLOAD_USAGES) as [UploadUsageId, ...UploadUsageId[]],
);

/** Taille maximale d'une vidéo de fond (les images d'un fond restent à 10 Mo). */
export const UPLOAD_IMAGE_MAX_BYTES_MAP = 10 * MB;

/** Taille maximale d'un fichier pour cet usage et ce type. */
export function uploadMaxBytes(usage: UploadUsageId, contentType: string): number {
  const u: UploadUsage = UPLOAD_USAGES[usage];
  // Fond de carte, document : 100 Mo pour une vidéo, 10 Mo pour une image
  if ((usage === 'map-background' || usage === 'handout') && contentType.startsWith('image/'))
    return UPLOAD_IMAGE_MAX_BYTES_MAP;
  return u.maxBytes;
}

/** `POST …/uploads` : ce qu'on veut envoyer. */
export const FileUploadRequest = z.strictObject({
  usage: UploadUsageId,
  contentType: z.string().min(1).max(100),
  size: z.number().int().min(1),
  /** Nom d'origine, pour les journaux seulement (jamais dans la clé). */
  name: z.string().max(255).optional(),
});
export type FileUploadRequest = z.input<typeof FileUploadRequest>;

/** Réponse : où et comment envoyer le fichier, et son adresse une fois envoyé. */
export const FileUploadTicket = z.object({
  method: z.literal('PUT'),
  url: z.string(),
  /** En-têtes à envoyer tels quels (type signé). */
  headers: z.record(z.string(), z.string()),
  /** Adresse publique du fichier une fois envoyé. */
  publicUrl: z.string(),
  key: z.string(),
  /** Fin de validité de l'URL (ISO 8601). */
  expiresAt: z.string(),
});
export type FileUploadTicket = z.infer<typeof FileUploadTicket>;

/**
 * `POST …/uploads/import` : une image d'un autre site (Pinterest…), que le navigateur ne peut
 * pas lire (CORS). Le service la télécharge (adresses publiques seulement), vérifie son format
 * d'après son contenu et la range sur notre stockage, comme un envoi.
 */
export const FileImportRequest = z.strictObject({
  usage: UploadUsageId,
  url: z.url({ protocol: /^https?$/ }).max(2048),
});
export type FileImportRequest = z.input<typeof FileImportRequest>;

/** Réponse : la copie rangée sur notre stockage. */
export const FileImport = z.object({
  publicUrl: z.string(),
  key: z.string(),
  contentType: z.string(),
  size: z.number().int(),
});
export type FileImport = z.infer<typeof FileImport>;

/** Refus de validation : le code dit quoi corriger. */
export const UPLOAD_ERRORS = {
  unsupportedType: 'unsupported_media_type',
  tooLarge: 'file_too_large',
  usageNotAllowed: 'usage_not_allowed',
  storageUnavailable: 'storage_unavailable',
  /** Import : adresse privée, locale ou port inhabituel. */
  addressNotAllowed: 'address_not_allowed',
  /** Import : image introuvable, illisible ou trop lente. */
  importFailed: 'import_failed',
} as const;

/**
 * Vérifie une demande pour un usage : null si elle est acceptable, sinon le code d'erreur et
 * un message à montrer. Même règle au serveur (qui refuse) et au front (qui prévient).
 */
export function checkUpload(
  req: Pick<FileUploadRequest, 'usage' | 'contentType' | 'size'>,
): { code: string; message: string } | null {
  const u: UploadUsage = UPLOAD_USAGES[req.usage];
  if (!(u.types as readonly string[]).includes(req.contentType))
    return {
      code: UPLOAD_ERRORS.unsupportedType,
      message: `Format non accepté pour ${u.label.toLowerCase()} (${u.types
        .map((t) => UPLOAD_EXTENSIONS[t].toUpperCase())
        .join(', ')})`,
    };
  const max = uploadMaxBytes(req.usage, req.contentType);
  if (req.size > max)
    return {
      code: UPLOAD_ERRORS.tooLarge,
      message: `Fichier trop lourd : ${Math.round(max / MB)} Mo au plus`,
    };
  return null;
}
