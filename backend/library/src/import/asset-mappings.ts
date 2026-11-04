/**
 * Source `asset-mappings` : les cartes de fond déjà publiées (`frontend/public/asset-mappings.json`,
 * catégories `Map/<lieu>/…`), reprises dans la bibliothèque sans renvoyer de fichier. Même
 * regroupement que l'ancien sélecteur (`background-library.ts`) : une entrée par lieu, ses
 * fichiers (PNG, JPG, WEBP, vidéo ; avec ou sans grille dessinée) en variantes.
 */

export interface MappedAsset {
  name: string;
  path: string;
  category: string;
  type: string;
}

export interface RemoteVariant {
  position: number;
  url: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  kind: 'image' | 'video';
  grid: boolean;
}

export interface RemoteEntry {
  sourceKey: string;
  collection: string;
  hint: string;
  animated: boolean;
  /** Dossier « Illustration » : décor vu de face ; sinon plan de carte vu du dessus. */
  kind: 'map' | 'illustration';
  variants: RemoteVariant[];
  /** Image à décrire : l'image fixe, ou l'affiche de l'animation, réduite par le CDN. */
  describeUrl: string | null;
}

const CDN = 'https://assets.yner.fr/';

/** Noms affichés des dossiers de cartes. */
const COLLECTIONS: Record<string, string> = {
  Bateau: 'Bateau',
  Camp: 'Camp',
  Cave: 'Grotte',
  Chateau: 'Château',
  Cimetiere: 'Cimetière',
  Donjon: 'Donjon',
  Ferme: 'Ferme',
  Foret: 'Forêt',
  Lake: 'Lac',
  Pont: 'Pont',
  Tavern: 'Taverne',
  Village: 'Village',
}; // i18n-ignore

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

export const isGrid = (file: string) => {
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

/** Le plus léger à afficher d'abord. */
const weight = (path: string) => {
  if (/\.webp$/i.test(path)) return 0;
  if (/\.(jpe?g|webm|mp4)$/i.test(path)) return 1;
  return 2;
};
const best = (assets: readonly MappedAsset[]) =>
  [...assets].sort((a, b) => weight(a.path) - weight(b.path))[0] ?? null;

/** Image réduite par le CDN (Cloudflare) ; une adresse hors CDN reste telle quelle. */
export function resized(url: string, width: number): string {
  return url.startsWith(CDN)
    ? `${CDN}cdn-cgi/image/width=${width},format=auto/${url.slice(CDN.length)}`
    : url;
}

/** Variante 1080p (MP4) d'une carte animée : `Map/…/X.webm` → `Map/…/1080p/X.mp4`. */
export function videoVariant(url: string): string | null {
  if (!url.startsWith(CDN)) return null;
  const m = /^(Map\/.+)\/([^/]+)\.(webm|mp4)$/i.exec(url.slice(CDN.length).split(/[?#]/)[0]!);
  return m ? `${CDN}${m[1]}/1080p/${m[2]}.mp4` : null;
}

function variantOf(a: MappedAsset, position: number, grid: boolean): RemoteVariant {
  const video = a.type === 'video';
  const preview = video ? videoVariant(a.path) : null;
  return {
    position,
    url: a.path,
    thumbUrl: video
      ? preview && resized(preview.replace(/\.mp4$/, '.webp'), 480)
      : resized(a.path, 480),
    previewUrl: preview,
    kind: video ? 'video' : 'image',
    grid,
  };
}

/** Lieux des cartes de fond (`Map/…`) d'`asset-mappings.json`. */
export function assetMappingEntries(assets: readonly MappedAsset[]): RemoteEntry[] {
  const groups = new Map<string, MappedAsset[]>();
  for (const raw of assets) {
    if (!raw.category.startsWith('Map/') || (raw.type !== 'image' && raw.type !== 'video'))
      continue;
    // Adresses encodées (espaces → %20), comme l'ancien sélecteur
    const a = { ...raw, path: encodeURI(raw.path) };
    const folder = a.category.split('/')[1] ?? 'others';
    const illustration = /illustration/i.test(a.category) || /illustration/i.test(a.name);
    const key = `${folder}|${a.type}|${illustration ? 'i' : 'm'}|${prettyName(a.name).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const plain = best(group.filter((a) => !isGrid(a.name)));
      const grid = best(group.filter((a) => isGrid(a.name)));
      const main = (plain ?? grid)!;
      const variants = [variantOf(main, 0, main === grid)];
      if (plain && grid) variants.push(variantOf(grid, 1, true));
      const folder = key.split('|')[0]!;
      const first = variants[0]!;
      return {
        sourceKey: key,
        collection: COLLECTIONS[folder] ?? folder,
        hint: prettyName(main.name),
        animated: main.type === 'video',
        kind: key.split('|')[2] === 'i' ? ('illustration' as const) : ('map' as const),
        variants,
        describeUrl:
          first.kind === 'image'
            ? resized(first.url, 1024)
            : first.previewUrl && resized(first.previewUrl.replace(/\.mp4$/, '.webp'), 1024),
      };
    })
    .sort((a, b) => a.collection.localeCompare(b.collection) || a.hint.localeCompare(b.hint));
}
