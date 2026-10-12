/**
 * Bibliothèque des fonds de scène : les cartes de `asset-mappings.json` (catégorie `Map/…`),
 * une carte par lieu. Les fichiers d'une même carte (PNG, JPG, WEBP ; avec ou sans son ; avec
 * ou sans grille dessinée) sont regroupés : la version sans grille est choisie par défaut, la
 * version avec grille reste proposée à côté.
 */
import type { Asset } from '@/lib/assets';
import { vignette } from '@/lib/assets';
import { videoVariant } from '@/lib/map/engine/background-prefs';

export interface BackgroundItem {
  /** Clé du regroupement (dossier, type, nom normalisé). */
  id: string;
  /** Version par défaut (sans grille si elle existe). */
  url: string;
  /** Version avec la grille dessinée, s'il y en a une à part. */
  gridUrl: string | null;
  /** Tous les fichiers de la carte (fond actuel reconnu quelle que soit sa version). */
  urls: readonly string[];
  name: string;
  folder: string;
  animated: boolean;
  illustration: boolean;
  /** Vignette (CDN redimensionné) ; null : aucune (icône). */
  poster: string | null;
  /** Aperçu animé au survol (variante 1080p). */
  preview: string | null;
}

/** Mots techniques des noms de fichiers, jamais montrés ni pris en compte pour regrouper. */
const TECHNICAL =
  /^(audio|noaudio|nogrid|grid|grid\d+x\d+|vp8|vp9|uhd|4k|hd|map|png|jpe?g|webp|static|stc|cutout)$/i; // i18n-ignore
const FORMAT_SUFFIX = /(PNG|JPE?G|WEBP)$/; // i18n-ignore

function words(file: string): string[] {
  return file
    .replace(/\.[^.]+$/, '')
    .split(/[_\-\s]+/)
    .map((w) => w.replace(FORMAT_SUFFIX, ''))
    .filter((w) => w && !TECHNICAL.test(w));
}

const isGrid = (file: string) => {
  const base = file.replace(/\.[^.]+$/, '');
  return /(^|[_\s-])grid(\d+x\d+)?([_\s-]|$|PNG|JPE?G|WEBP)/i.test(base) && !/nogrid/i.test(base);
};

/** « Camp_Day_Fog_Audio_NoGrid » → « Camp Day Fog », « CampCanyonDay » → « Camp Canyon Day ». */
export function prettyName(file: string): string {
  const name = words(file)
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : file;
}

/** Ordre de préférence d'un fichier : le plus léger à afficher d'abord. */
const weight = (path: string) => {
  if (/\.webp$/i.test(path)) return 0;
  if (/\.jpe?g$/i.test(path)) return 1;
  if (/\.(webm|mp4)$/i.test(path)) return 1;
  return 2;
};
const best = (assets: readonly Asset[]) =>
  [...assets].sort((a, b) => weight(a.path) - weight(b.path))[0] ?? null;

/** Vignette d'un fond : l'aperçu webp d'une animation, sinon l'image elle-même. */
export function posterOf(animated: boolean, path: string): string | null {
  if (!animated) return vignette(path, 480);
  const variant = videoVariant(path);
  return variant ? vignette(variant.replace(/\.mp4$/, '.webp'), 480) : null;
}

export function groupBackgrounds(assets: readonly Asset[]): BackgroundItem[] {
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    if (!a.category.startsWith('Map/') || (a.type !== 'image' && a.type !== 'video')) continue;
    const folder = a.category.split('/')[1] ?? 'others';
    const illustration = /illustration/i.test(a.category) || /illustration/i.test(a.name);
    const key = `${folder}|${a.type}|${illustration ? 'i' : 'm'}|${prettyName(a.name).toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push(a);
    else groups.set(key, [a]);
  }
  return [...groups.entries()].map(([id, group]) => {
    const plain = best(group.filter((a) => !isGrid(a.name)));
    const grid = best(group.filter((a) => isGrid(a.name)));
    const main = (plain ?? grid)!;
    const animated = main.type === 'video';
    return {
      id,
      url: main.path,
      gridUrl: plain && grid ? grid.path : null,
      urls: group.map((a) => a.path),
      name: prettyName(main.name),
      folder: id.split('|')[0]!,
      animated,
      illustration: id.split('|')[2] === 'i',
      poster: posterOf(animated, main.path),
      preview: animated ? videoVariant(main.path) : null,
    };
  });
}

/** Fond importé (hors bibliothèque) : vignette de l'image, aperçu de la vidéo. */
export function fileItem(url: string): BackgroundItem {
  const animated = /\.(mp4|webm|mov)(\?|$)/i.test(url);
  return {
    id: url,
    url,
    gridUrl: null,
    urls: [url],
    name: prettyName(decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? url)),
    folder: '',
    animated,
    illustration: false,
    poster: animated ? null : vignette(url, 480),
    preview: animated ? url : null,
  };
}
