/**
 * Catalogue intégré : sons et musiques proposés au MJ sans envoi (ancien
 * « catalogue » du SoundDrawer). Déclaré par le serveur, jamais copié : les
 * fichiers restent à leur origine (AUDIO_CATALOG_ORIGINS, CORS `*` et Range),
 * ou dans le bucket pour les sons Star Wars publiés par scripts/publish-catalog.ts.
 *
 * `library` : la bibliothèque d'objets du système de la campagne
 * (`starwars` pour star-wars-eote), sinon `default`.
 */
import {
  normalizeSourceUrl,
  type AssetKind,
  type CatalogCategory,
  type CatalogEntry,
} from '@vtt/contracts';
import { DEFAULT_MUSICS, DEFAULT_SOUNDS, STARWARS_SOUNDS, type RawEntry } from './data.js';
import { withoutTrailingSlashes } from '@vtt/platform';

export type LibraryId = 'default' | 'starwars';

/** Système de jeu (ou bibliothèque) → bibliothèque du catalogue. */
export function libraryOf(library: string | null | undefined): LibraryId {
  if (!library) return 'default';
  return library === 'starwars' || library.startsWith('star-wars') ? 'starwars' : 'default';
}

const CATEGORIES: Record<LibraryId, CatalogCategory[]> = {
  default: [
    { id: 'ambiance', label: 'Ambiance', kind: 'ambience' },
    { id: 'nature', label: 'Nature', kind: 'ambience' },
    { id: 'foule', label: 'Foule & Ville', kind: 'ambience' },
    { id: 'creatures', label: 'Créatures', kind: 'sfx' },
    { id: 'combat', label: 'Combat', kind: 'sfx' },
    { id: 'magie', label: 'Magie', kind: 'sfx' },
    { id: 'pas', label: 'Pas', kind: 'sfx' },
    { id: 'portes', label: 'Portes', kind: 'sfx' },
    { id: 'actions', label: 'Divers', kind: 'sfx' },
    { id: 'chill', label: 'Chill & Calme', kind: 'music' },
    { id: 'epic', label: 'Épique & Combat', kind: 'music' },
    { id: 'taverne', label: 'Taverne', kind: 'music' },
  ],
  starwars: [
    { id: 'droid', label: 'Droïdes', kind: 'sfx' },
    { id: 'lightsaber', label: 'Sabre Laser', kind: 'sfx' },
    { id: 'lasers', label: 'Blasters', kind: 'sfx' },
    { id: 'creature', label: 'Créatures', kind: 'sfx' },
    { id: 'spaceship', label: 'Vaisseaux', kind: 'sfx' },
  ],
};

/** Identifiant lisible et stable : `<bibliothèque>.<catégorie>.<nom>`. */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Clé du bucket d'un son Star Wars publié : `audio/catalog/starwars/<dossier>/<fichier>.m4a`. */
export function starwarsKey(legacyPath: string): string {
  const parts = decodeURIComponent(legacyPath).split('/').filter(Boolean);
  const file = parts.pop()!.replace(/\.[a-z0-9]+$/i, '');
  const folder = parts.pop() ?? 'misc';
  return `audio/catalog/starwars/${slug(folder)}/${slug(file)}.m4a`;
}

export interface Catalog {
  categories(library: LibraryId): CatalogCategory[];
  entries(library: LibraryId): CatalogEntry[];
  /** Entrée par id, toutes bibliothèques confondues. */
  get(id: string): CatalogEntry | undefined;
  /** Id d'une entrée d'après son URL (import de l'ancienne app). */
  byUrl(url: string): CatalogEntry | undefined;
}

export function createCatalog(o: { publishedBase: string | null }): Catalog {
  const lists: Record<LibraryId, CatalogEntry[]> = { default: [], starwars: [] };
  const kindOf = (library: LibraryId, category: string): AssetKind =>
    CATEGORIES[library].find((c) => c.id === category)?.kind ?? 'sfx';
  const add = (library: LibraryId, rows: readonly RawEntry[], url: (path: string) => string) => {
    for (const [name, path, category] of rows) {
      lists[library].push({
        id: `${library}.${category}.${slug(name)}`,
        name,
        kind: kindOf(library, category),
        category,
        url: url(path),
        durationMs: null,
      });
    }
  };
  add('default', DEFAULT_SOUNDS, (p) => normalizeSourceUrl(p));
  add('default', DEFAULT_MUSICS, (p) => normalizeSourceUrl(p));
  if (o.publishedBase) {
    const base = withoutTrailingSlashes(o.publishedBase);
    // publishedBase = …/audio/catalog : la clé commence par audio/catalog/
    add(
      'starwars',
      STARWARS_SOUNDS,
      (p) => `${base}/${starwarsKey(p).slice('audio/catalog/'.length)}`,
    );
  }

  const all = new Map<string, CatalogEntry>();
  const urls = new Map<string, CatalogEntry>();
  for (const e of [...lists.default, ...lists.starwars]) {
    all.set(e.id, e);
    urls.set(e.url, e);
  }
  return {
    categories: (library) =>
      CATEGORIES[library].filter((c) => lists[library].some((e) => e.category === c.id)),
    entries: (library) => lists[library],
    get: (id) => all.get(id),
    byUrl: (url) => {
      try {
        return urls.get(normalizeSourceUrl(url));
      } catch {
        return undefined;
      }
    },
  };
}
