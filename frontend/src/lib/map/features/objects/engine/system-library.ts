/**
 * Bibliothèque d'objets du système (docs/carte.md § 10, Objets) : les catégories déclarées par
 * la présentation (`references.objets`), faites de dossiers de l'index public des actifs
 * (`/asset-mappings.json`, `lib/assets.ts`). Aucune liste en dur : un système sans déclaration
 * n'a pas de bibliothèque, la campagne garde ses modèles.
 */
import type { CollectionImages } from '@vtt/rules';

/** Ce que l'index des actifs donne d'une image (sous-ensemble de `Asset`). */
export interface AssetLike {
  name: string;
  path: string;
  category: string;
  type: string;
}

export interface SystemObject {
  /** Identifiant stable dans la bibliothèque. */
  key: string;
  name: string;
  imageUrl: string;
  /** Titre de la catégorie déclarée. */
  category: string;
}

const EXTENSION = /\.[a-z0-9]+$/i;

/** Nom lisible d'un fichier : « escalier1.png » → « Escalier 1 », « coffre_bois-2 » → « Coffre bois 2 ». */
export function objectName(file: string): string {
  const n = file
    .replace(EXTENSION, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-zà-ÿ])(\d)/gi, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return n ? n.charAt(0).toLocaleUpperCase('fr') + n.slice(1) : 'Objet';
}

const inFolder = (category: string, folder: string) =>
  category === folder || category.startsWith(`${folder}/`);

/**
 * Objets du système, dans l'ordre des catégories déclarées puis des noms (numéros dans
 * l'ordre). Une image rangée dans deux catégories n'apparaît que dans la première.
 */
export function systemObjects(
  assets: readonly AssetLike[],
  categories: readonly CollectionImages[],
): SystemObject[] {
  const order = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  const seen = new Set<string>();
  const out: SystemObject[] = [];
  for (const c of categories) {
    const inCategory: SystemObject[] = [];
    for (const a of assets) {
      if (a.type !== 'image' || seen.has(a.path)) continue;
      if (!c.dossiers.some((d) => inFolder(a.category, d))) continue;
      seen.add(a.path);
      inCategory.push({
        key: `system:${a.path}`,
        name: objectName(a.name),
        imageUrl: a.path,
        category: c.titre,
      });
    }
    inCategory.sort((x, y) => order.compare(x.name, y.name));
    out.push(...inCategory);
  }
  return out;
}
