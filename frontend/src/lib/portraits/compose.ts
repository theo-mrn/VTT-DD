/**
 * Fabrication des images du Studio du portrait (docs/portraits.md), dans le navigateur :
 * - le portrait : la zone 3:4 choisie dans l'image d'origine ;
 * - le token : la zone carrée choisie, en retrait de la marge, découpée à l'arrondi voulu
 *   (0 % carré, 50 % cercle), puis le cadre posé par-dessus, sur toute la surface.
 * Les deux sortent en WebP, prêts à l'envoi.
 */
import type { PortraitStudio, StudioCrop } from '@vtt/contracts';

/** Côté du token fabriqué (pixels) : net sur la carte même zoomée. */
export const TOKEN_SIZE = 512;
/** Hauteur maximale du portrait (pixels). */
export const PORTRAIT_MAX_HEIGHT = 1200;

const QUALITY = 0.88;

/**
 * Octets d'une image distante, lisibles par le canvas. `no-store` : le CDN n'envoie l'en-tête
 * CORS qu'aux requêtes qui portent un `Origin` ; une copie en cache, chargée sans (une simple
 * balise <img>), serait refusée.
 */
async function fetchImage(src: string): Promise<Blob> {
  const res = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error('Image introuvable');
  return res.blob();
}

/** Image chargée pour le dessin (fichier local, ou adresse autorisée par CORS). */
export async function loadBitmap(src: File | Blob | string): Promise<ImageBitmap> {
  return createImageBitmap(typeof src === 'string' ? await fetchImage(src) : src);
}

/** Image d'origine du Studio : copie locale (affichage sans CORS) et image décodée (dessin). */
export interface LoadedImage {
  /** Adresse locale (`blob:`), à libérer avec `URL.revokeObjectURL`. */
  url: string;
  bitmap: ImageBitmap;
}

export async function loadImage(src: File | string): Promise<LoadedImage> {
  const blob = typeof src === 'string' ? await fetchImage(src) : src;
  const bitmap = await createImageBitmap(blob);
  return { url: URL.createObjectURL(blob), bitmap };
}

function canvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function toWebp(c: HTMLCanvasElement | OffscreenCanvas, name: string): Promise<File> {
  const blob =
    'convertToBlob' in c
      ? await c.convertToBlob({ type: 'image/webp', quality: QUALITY })
      : await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', QUALITY));
  if (!blob) throw new Error('Image impossible à fabriquer');
  return new File([blob], name, { type: 'image/webp' });
}

/** Zone en pixels de l'image, d'après les fractions enregistrées. */
export function cropPixels(crop: StudioCrop, w: number, h: number) {
  return {
    x: Math.round(crop.x * w),
    y: Math.round(crop.y * h),
    width: Math.max(1, Math.round(crop.width * w)),
    height: Math.max(1, Math.round(crop.height * h)),
  };
}

/** Chemin arrondi : `radius` en % du côté (50 : cercle). */
function roundedPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radiusPct: number,
) {
  const r = Math.min(size / 2, (size * radiusPct) / 100);
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, r);
  ctx.closePath();
}

/** Portrait : la zone 3:4, réduite à `PORTRAIT_MAX_HEIGHT` au plus. */
export async function composePortrait(source: ImageBitmap, crop: StudioCrop, name: string) {
  const a = cropPixels(crop, source.width, source.height);
  const scale = Math.min(1, PORTRAIT_MAX_HEIGHT / a.height);
  const w = Math.max(1, Math.round(a.width * scale));
  const h = Math.max(1, Math.round(a.height * scale));
  const c = canvas(w, h);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, a.x, a.y, a.width, a.height, 0, 0, w, h);
  return toWebp(c, `${name}-portrait.webp`);
}

/** Token : image découpée à l'arrondi dans sa marge, cadre par-dessus. */
export async function composeToken(
  source: ImageBitmap,
  studio: Pick<PortraitStudio, 'token' | 'radius' | 'inset'>,
  frame: ImageBitmap | null,
  name: string,
) {
  const size = TOKEN_SIZE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  const crop = studio.token ?? centeredSquare(source.width, source.height);
  const a = cropPixels(crop, source.width, source.height);
  const pad = Math.round((size * studio.inset) / 100);
  const inner = size - pad * 2;
  ctx.save();
  roundedPath(ctx, pad, pad, inner, studio.radius);
  ctx.clip();
  ctx.drawImage(source, a.x, a.y, a.width, a.height, pad, pad, inner, inner);
  ctx.restore();
  if (frame) ctx.drawImage(frame, 0, 0, size, size);
  return toWebp(c, `${name}-token.webp`);
}

/** Carré centré, en fractions (cadrage par défaut d'un token). */
export function centeredSquare(w: number, h: number): StudioCrop {
  const side = Math.min(w, h);
  return { x: (w - side) / 2 / w, y: (h - side) / 2 / h, width: side / w, height: side / h };
}

/** Zone 3:4 centrée, en fractions (cadrage par défaut d'un portrait). */
export function centeredPortrait(w: number, h: number): StudioCrop {
  const width = Math.min(w, (h * 3) / 4);
  const height = (width * 4) / 3;
  return { x: (w - width) / 2 / w, y: (h - height) / 2 / h, width: width / w, height: height / h };
}
