/**
 * Bibliothèque d'images des ressources : collections déclarées par la présentation
 * (`references.images`), prises dans l'index public des actifs (`lib/assets.ts`).
 */
import type { CollectionImages } from '@vtt/rules';
import type { Asset } from '@/lib/assets';

export interface LibraryImage {
  url: string;
  name: string;
  /** Sous-catégorie : dossier suivant (`Map/Foret/Static` → « Foret »), ou nom sans numéro. */
  category: string;
}

const EXTENSION = /\.[a-z0-9]+$/i;

function stem(nom: string): string {
  return nom.replace(EXTENSION, '').trim();
}

/** « Elfe3 » → « Elfe », « Cragwind Castle_Day02 » → « Cragwind Castle ». */
function sansNumero(nom: string): string {
  return stem(nom)
    .replace(/[\s_-]*\(?\d+\)?$/, '')
    .trim();
}

function dossierDe(asset: Asset, dossiers: readonly string[]): string | null {
  return dossiers.find((d) => asset.category === d || asset.category.startsWith(`${d}/`)) ?? null;
}

/** Images d'une collection, triées par catégorie puis par nom (numéros dans l'ordre). */
export function collectionImages(
  assets: readonly Asset[],
  collection: CollectionImages,
): LibraryImage[] {
  const r: LibraryImage[] = [];
  for (const a of assets) {
    if (a.type !== 'image') continue;
    const dossier = dossierDe(a, collection.dossiers);
    if (dossier === null) continue;
    const suite = a.category.slice(dossier.length + 1).split('/')[0];
    r.push({ url: a.path, name: stem(a.name), category: suite || sansNumero(a.name) || dossier });
  }
  const ordre = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  return r.sort((a, b) => ordre.compare(a.category, b.category) || ordre.compare(a.name, b.name));
}

export function categoriesOf(images: readonly LibraryImage[]): string[] {
  return [...new Set(images.map((i) => i.category))];
}
