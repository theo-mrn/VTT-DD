/**
 * Fichier prêt à l'envoi selon son usage (docs/uploads.md) : une vidéo de fond de carte est
 * réencodée (`video.ts`), une image recadrée, réduite et compressée (`image.ts`), le reste part
 * tel quel.
 */
import type { UploadUsageId } from '@vtt/contracts';
import { MAX_SIDE, prepareImage, type CropArea } from './image';

export interface PrepareOptions {
  crop?: CropArea | null;
  /** Avancement de la conversion d'une vidéo, de 0 à 1. */
  onEncode?: (progress: number) => void;
  signal?: AbortSignal;
}

export async function prepareUpload(
  file: File,
  usage: UploadUsageId,
  o: PrepareOptions = {},
): Promise<File> {
  if (usage === 'map-background' && file.type.startsWith('video/')) {
    // Chargé à la demande : seuls les envois de fonds vidéo en ont besoin
    const { prepareVideo } = await import('./video');
    return prepareVideo(file, {
      ...(o.onEncode ? { onProgress: o.onEncode } : {}),
      ...(o.signal ? { signal: o.signal } : {}),
    });
  }
  return prepareImage(file, { maxSide: MAX_SIDE[usage], crop: o.crop ?? null });
}
