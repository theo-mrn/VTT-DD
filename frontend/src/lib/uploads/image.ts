/**
 * Préparation d'une image avant l'envoi, dans le navigateur : recadrage éventuel, taille
 * maximale selon l'usage, compression en WebP. Les GIF (animés) et les vidéos partent tels
 * quels ; une image déjà plus légère que sa version compressée aussi.
 */
import type { UploadUsageId } from '@vtt/contracts';

/** Côté le plus long d'une image, selon son usage (au-delà : réduite). */
export const MAX_SIDE: Record<UploadUsageId, number> = {
  avatar: 512,
  banner: 2400,
  'campaign-image': 1920,
  'note-image': 2400,
  'map-background': 4096,
  'map-object': 2048,
  'npc-image': 1024,
  portrait: 1200,
};

/** Zone gardée, en pixels de l'image d'origine (sortie de react-easy-crop). */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const QUALITY = 0.85;

/** L'image se prépare ici (image fixe) ; sinon elle part telle quelle. */
export const isProcessable = (type: string) =>
  type === 'image/png' || type === 'image/jpeg' || type === 'image/webp' || type === 'image/avif';

function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas)
    return canvas.convertToBlob({ type: 'image/webp', quality: QUALITY }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Nom WebP du fichier (« dragon.png » → « dragon.webp »). */
const webpName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'image'}.webp`;

/**
 * Image prête à l'envoi : recadrée si demandé, réduite à `maxSide`, en WebP. Échec du
 * navigateur (format qu'il ne sait pas lire) : le fichier d'origine.
 */
export async function prepareImage(
  file: File,
  o: { maxSide: number; crop?: CropArea | null },
): Promise<File> {
  if (!isProcessable(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const area = o.crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, o.maxSide / Math.max(area.width, area.height));
  const w = Math.max(1, Math.round(area.width * scale));
  const h = Math.max(1, Math.round(area.height * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, w, h);
  bitmap.close();
  const blob = await toBlob(canvas);
  // Sans recadrage, la version compressée n'est gardée que si elle est plus légère
  if (!blob || (!o.crop && scale === 1 && blob.size >= file.size)) return file;
  return new File([blob], webpName(file.name), { type: 'image/webp', lastModified: Date.now() });
}

/**
 * Image tirée d'une adresse web (coller une URL), si le site l'autorise (CORS) ; null sinon :
 * l'adresse est alors gardée telle quelle par l'appelant.
 */
export async function fetchImage(url: string): Promise<File | null> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') && !blob.type.startsWith('video/')) return null;
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}
