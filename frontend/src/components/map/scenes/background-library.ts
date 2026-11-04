/**
 * Fond importé par le MJ (hors bibliothèque, docs/bibliotheque.md) : nom lisible tiré du fichier,
 * vignette de l'image, aperçu de la vidéo. Les fonds de la bibliothèque viennent du service
 * library (`lib/library.ts`).
 */
import { vignette } from '@/lib/assets';

export interface BackgroundFile {
  url: string;
  name: string;
  animated: boolean;
  /** Vignette (CDN redimensionné) ; null : aucune (icône). */
  poster: string | null;
}

/** Mots techniques des noms de fichiers, jamais montrés. */
const TECHNICAL =
  /^(audio|noaudio|nogrid|grid|grid\d+x\d+|vp8|vp9|uhd|4k|hd|map|png|jpe?g|webp|static|stc|cutout)$/i; // i18n-ignore
const FORMAT_SUFFIX = /(PNG|JPE?G|WEBP)$/; // i18n-ignore

/** « Camp_Day_Fog_Audio_NoGrid » → « Camp Day Fog », « CampCanyonDay » → « Camp Canyon Day ». */
export function prettyName(file: string): string {
  const name = file
    .replace(/\.[^.]+$/, '')
    .split(/[_\-\s]+/)
    .map((w) => w.replace(FORMAT_SUFFIX, ''))
    .filter((w) => w && !TECHNICAL.test(w))
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : file;
}

export function fileItem(url: string): BackgroundFile {
  const animated = /\.(mp4|webm|mov)(\?|$)/i.test(url);
  return {
    url,
    name: prettyName(decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? url)),
    animated,
    poster: animated ? null : vignette(url, 480),
  };
}
