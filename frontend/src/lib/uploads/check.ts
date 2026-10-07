/**
 * Refus local d'un fichier (format, taille), dans la langue de la page : la règle reste celle
 * de `checkUpload` (@vtt/contracts), seul le message est traduit (docs/i18n.md § 8).
 */
import {
  checkUpload,
  UPLOAD_ERRORS,
  UPLOAD_EXTENSIONS,
  UPLOAD_USAGES,
  uploadMaxBytes,
  type UploadUsageId,
} from '@vtt/contracts';
import { translate } from '@/i18n/runtime';

const MB = 1024 * 1024;

/** Message du refus, ou null si le fichier est accepté. */
export function uploadRefusal(
  usage: UploadUsageId,
  file: Pick<File, 'type' | 'size'>,
): string | null {
  const refus = checkUpload({ usage, contentType: file.type, size: file.size });
  if (!refus) return null;
  if (refus.code === UPLOAD_ERRORS.tooLarge)
    return translate('errors.upload.tooLarge', {
      max: Math.round(uploadMaxBytes(usage, file.type) / MB),
    });
  const formats = UPLOAD_USAGES[usage].types.map((t) => UPLOAD_EXTENSIONS[t].toUpperCase());
  return translate('errors.upload.unsupportedType', { formats: formats.join(', ') });
}
