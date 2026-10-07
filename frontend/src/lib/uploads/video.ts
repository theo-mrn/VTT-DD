/**
 * Vidéo de fond de carte préparée avant l'envoi (docs/uploads.md, docs/performances.md), dans le
 * navigateur : réencodée en H.264 (MP4), 1920 px de large au plus, 30 i/s, sans son (un fond de
 * carte est muet). Le H.264 est décodé par le matériel partout ; les cartes animées du commerce
 * sont souvent en VP8/VP9 4K à 60 i/s, décodées par le processeur.
 *
 * Encodeur matériel du navigateur (WebCodecs) via mediabunny, chargé à la demande. Déjà légère
 * (H.264, assez petite), ou si le navigateur ne sait pas l'encoder : la vidéo part telle quelle.
 */

/** Largeur maximale d'un fond vidéo réencodé. */
export const VIDEO_MAX_WIDTH = 1920;
/** Images par seconde d'un fond vidéo réencodé. */
export const VIDEO_FPS = 30;

export interface PrepareVideoOptions {
  /** Avancement de la conversion, de 0 à 1. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

const webmToMp4 = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'fond'}.mp4`;

/** Vidéo prête à l'envoi : réencodée si utile et possible, sinon le fichier d'origine. */
export async function prepareVideo(file: File, o: PrepareVideoOptions = {}): Promise<File> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return file;
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return file;
    const width = track.displayWidth;
    const height = track.displayHeight;
    // Déjà en H.264 et pas plus large que la cible : rien à gagner
    if (track.codec === 'avc' && width <= VIDEO_MAX_WIDTH) return file;
    const outWidth = Math.min(width, VIDEO_MAX_WIDTH);
    const outHeight = Math.round((height * outWidth) / width / 2) * 2;
    if (!(await mb.canEncodeVideo('avc', { width: outWidth, height: outHeight }))) return file;

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        codec: 'avc',
        width: outWidth,
        frameRate: VIDEO_FPS,
        quality: mb.QUALITY_HIGH,
        hardwareAcceleration: 'prefer-hardware',
      },
      audio: { discard: true },
    });
    if (!conversion.isValid) return file;
    if (o.onProgress) conversion.onProgress = (p) => o.onProgress?.(p);
    const abort = () => void conversion.cancel();
    o.signal?.addEventListener('abort', abort, { once: true });
    try {
      await conversion.execute();
    } finally {
      o.signal?.removeEventListener('abort', abort);
    }
    if (o.signal?.aborted) throw new DOMException('Envoi annulé', 'AbortError'); // i18n-ignore : jamais affiché
    const buffer = output.target.buffer;
    if (!buffer) return file;
    return new File([buffer], webmToMp4(file.name), { type: 'video/mp4' });
  } catch (err) {
    if (o.signal?.aborted) throw err;
    // Format que le navigateur ne sait pas lire ou encoder : l'original
    console.warn('[envoi] vidéo non réencodée', err);
    return file;
  } finally {
    input.dispose();
  }
}
