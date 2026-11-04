/**
 * Fichiers source d'un import, regroupés en lieux. Une source par format de noms de fichiers.
 *
 * `dndbackdrop` : images Midjourney de l'export « DndBackdrop Images » (plusieurs auteurs),
 * `<auteur>_<début du prompt>_<uuid>[_<variante>].png`, dans des sous-dossiers parfois nommés
 * (`may/Haunted`) ; les variantes d'un même prompt (même uuid) forment un lieu.
 */

export const SOURCES = ['dndbackdrop', 'asset-mappings', 'mappacks'] as const;
export type SourceId = (typeof SOURCES)[number];

export interface SourceImage {
  /** Nom du fichier dans le dossier importé. */
  file: string;
  /** Identifiant de l'image, dans les clés R2 (`<uuid>-<variante>`). */
  id: string;
  /** Rang de la variante (0 : montrée par défaut). */
  position: number;
}

export interface SourceEntry {
  /** Clé du lieu dans sa source (uuid du prompt). */
  sourceKey: string;
  /** Collection : préfixe connu du prompt, ou dossier qui contient les images ; null sinon. */
  collection: string | null;
  /** Début du prompt, lisible : titre provisoire et indice pour la description. */
  hint: string;
  images: SourceImage[];
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** `<auteur>_<début du prompt>_<uuid>[_<variante>].png` (exports Midjourney). */
const MIDJOURNEY = new RegExp(`^([A-Za-z0-9]+)_(.+)_(${UUID})(?:_([0-9]))?\\.png$`); // i18n-ignore
/** Collections nommées en tête du prompt (premier lot, auteur boldbrushstudio). */
const PROMPT_COLLECTIONS = ['Kings_Old_Fort', 'Mystical_Forest', 'Dark_Mountains']; // i18n-ignore

/** Dossiers techniques des exports (numéro d'archive, racine, sessions, mois) : jamais une collection. */
const TECHNICAL_FOLDER = /^(\d+|DndBackdrop Images( \d+)?|midjourney_session_.*|may)$/i; // i18n-ignore

/** Dossier le plus proche qui nomme une collection (`may/Haunted` → `Haunted`), sinon null. */
function meaningfulFolder(folders: readonly string[]): string | null {
  for (let i = folders.length - 1; i >= 0; i--)
    if (!TECHNICAL_FOLDER.test(folders[i]!)) return folders[i]!;
  return null;
}

/**
 * Lieux d'un dossier `dndbackdrop` (chemins relatifs, sous-dossiers compris), et les fichiers
 * qui ne suivent pas le format. Une même image présente deux fois (export recopié) ne compte
 * qu'une fois.
 */
export function dndBackdropEntries(paths: readonly string[]): {
  entries: SourceEntry[];
  skipped: string[];
} {
  const byKey = new Map<string, SourceEntry>();
  const seen = new Set<string>();
  const skipped: string[] = [];
  for (const path of paths) {
    const parts = path.split('/');
    const file = parts.at(-1)!;
    if (file.startsWith('.') || !file.toLowerCase().endsWith('.png')) {
      if (!file.startsWith('.') && !file.toLowerCase().endsWith('.zip')) skipped.push(path);
      continue;
    }
    const m = MIDJOURNEY.exec(file);
    if (!m) {
      skipped.push(path);
      continue;
    }
    const [, , rawPrompt, uuid, variant] = m as unknown as [
      string,
      string,
      string,
      string,
      string | undefined,
    ];
    const id = variant === undefined ? uuid : `${uuid}-${variant}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const named = PROMPT_COLLECTIONS.find((c) => rawPrompt.startsWith(`${c}_`));
    const prompt = named ? rawPrompt.slice(named.length + 1) : rawPrompt;
    const folder = meaningfulFolder(parts.slice(0, -1));
    const entry = byKey.get(uuid) ?? {
      sourceKey: uuid,
      collection: named ? named.replaceAll('_', ' ') : folder,
      hint: prompt.replaceAll('_', ' ').trim(),
      images: [],
    };
    entry.images.push({ file: path, id, position: Number(variant ?? 0) });
    byKey.set(uuid, entry);
  }
  const entries = [...byKey.values()]
    .map((e) => ({ ...e, images: e.images.sort((a, b) => a.position - b.position) }))
    .sort(
      (a, b) =>
        (a.collection ?? '').localeCompare(b.collection ?? '') || a.hint.localeCompare(b.hint),
    );
  return { entries, skipped: skipped.sort() };
}

/**
 * Lieux d'un dossier `mappacks` : packs de plans de carte (`<Pack>/Gridless/<Nom> (<n>).webp`),
 * une carte par fichier, la version sans grille seulement. Collection : le nom du pack.
 */
export function mapPackEntries(paths: readonly string[]): {
  entries: SourceEntry[];
  skipped: string[];
} {
  const entries: SourceEntry[] = [];
  const skipped: string[] = [];
  for (const path of paths) {
    const m = /(?:^|\/)([^/]+)\/Gridless\/[^/]*?\((\d+)\)\.webp$/i.exec(path); // i18n-ignore
    if (!m) {
      if (!path.split('/').at(-1)!.startsWith('.')) skipped.push(path);
      continue;
    }
    const [, pack, number] = m as unknown as [string, string, string];
    const slug = pack.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const id = `mp-${slug}-${number.padStart(4, '0')}`;
    entries.push({
      sourceKey: id,
      collection: pack,
      hint: pack,
      images: [{ file: path, id, position: 0 }],
    });
  }
  entries.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
  return { entries, skipped: skipped.sort() };
}

/** Titre provisoire d'un lieu pas encore décrit : le début du prompt, en majuscule initiale. */
export function provisionalTitle(hint: string): string {
  const t = hint.replace(/\s+/g, ' ').trim().slice(0, 120);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Sans titre'; // i18n-ignore
}
