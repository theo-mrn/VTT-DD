/**
 * Recherche ⌘K dans les règles (docs/recherche.md) : un index de tout ce que le système déclare
 * consultable (`references` de sa présentation), une rubrique par section de capacités, par
 * sorte du marché et pour le bestiaire. Aucune clé de jeu : les rubriques et leurs noms
 * viennent du système, une rubrique vide n'existe pas.
 */
import type { Entree, Presentation, SystemeCharge } from '@vtt/rules';
import type { PlacementSource } from '@/lib/map/features/tokens/engine/state';
import { imageEntree } from '@/lib/systemes';
import type { BestiaryItem } from '../resources/model/bestiary';
import { normaliser, searchEntry, sectionEntries } from '../resources/model/catalogue';
import { buildMarket } from '../resources/model/market';

export const ALL = 'all';

export type SearchTabKind = 'capacites' | 'marche' | 'bestiaire';

export interface SearchTab {
  id: string;
  label: string;
  kind: SearchTabKind;
  count: number;
}

export interface SearchItem {
  id: string;
  tab: string;
  title: string;
  /** Rubrique, catégorie ou type, sous le titre. */
  subtitle: string | null;
  image: string | null;
  /** Titre sans accents ni majuscules, pour le classement. */
  norm: string;
  /** Tout le texte cherchable, sans accents ni majuscules. */
  text: string;
  /** Entrée du catalogue (capacités) ou du marché (`market`). */
  entry?: Entree;
  market?: boolean;
  /** Créature de référence ou modèle de PNJ de la campagne. */
  creature?: BestiaryItem;
  /** Source à poser sur la carte (créatures et modèles). */
  placement?: PlacementSource;
}

export interface SearchCreature {
  item: BestiaryItem;
  placement: PlacementSource;
}

export interface SearchIndex {
  tabs: SearchTab[];
  items: SearchItem[];
}

const byTitle = (a: SearchItem, b: SearchItem) => a.title.localeCompare(b.title, 'fr');

/** Index des rubriques et de leurs éléments, dans l'ordre déclaré par le système. */
export function buildSearchIndex(o: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  creatures: readonly SearchCreature[];
}): SearchIndex {
  const { systeme, presentation } = o;
  const tabs: SearchTab[] = [];
  const items: SearchItem[] = [];
  const push = (tab: Omit<SearchTab, 'count'>, list: SearchItem[]) => {
    if (!list.length) return;
    tabs.push({ ...tab, count: list.length });
    items.push(...list.sort(byTitle));
  };

  const sections = presentation?.references.capacites?.sections ?? [];
  sections.forEach((section, i) => {
    const id = `capacites:${i}`;
    push(
      { id, label: section.titre, kind: 'capacites' },
      sectionEntries(systeme, section).map((entry) => ({
        id: `${id}:${entry.id}`,
        tab: id,
        title: entry.nom,
        subtitle: section.titre,
        image: imageEntree(presentation, entry.id),
        norm: normaliser(entry.nom),
        text: normaliser(`${entry.nom} ${entry.description ?? ''}`),
        entry,
      })),
    );
  });

  for (const section of buildMarket(systeme, presentation)) {
    const id = `marche:${section.sorte.id}`;
    push(
      { id, label: section.title, kind: 'marche' },
      section.rows.map((row) => ({
        id: `${id}:${row.entry.id}`,
        tab: id,
        title: row.entry.nom,
        subtitle: row.category ?? section.sorte.nom,
        image: imageEntree(presentation, row.entry.id),
        norm: normaliser(row.entry.nom),
        text: row.text,
        entry: row.entry,
        market: true,
      })),
    );
  }

  if (presentation?.references.bestiaire) {
    push(
      {
        id: 'bestiaire',
        label: presentation.references.bestiaire.titre ?? 'Bestiaire',
        kind: 'bestiaire',
      },
      o.creatures.map(({ item, placement }) => ({
        id: `bestiaire:${item.key}`,
        tab: 'bestiaire',
        title: item.name,
        subtitle: item.subtitle ?? item.category,
        image: item.image,
        norm: normaliser(item.name),
        text: `${item.text} ${normaliser(item.description ?? '')}`,
        creature: item,
        placement,
      })),
    );
  }
  return { tabs, items };
}

export interface SearchHit {
  item: SearchItem;
  /** Entrées accordées qui correspondent, quand l'élément lui-même ne correspond pas. */
  via: Entree[];
}

/**
 * Rang d'un élément pour la requête (plus petit = meilleur) : titre exact, début du titre,
 * début d'un mot du titre, titre, puis texte ; une requête de plusieurs mots les veut tous.
 */
function rank(item: SearchItem, q: string, words: string[]): number | null {
  if (item.norm === q) return 0;
  if (item.norm.startsWith(q)) return 1;
  if (item.norm.includes(` ${q}`) || item.norm.includes(`-${q}`)) return 2;
  if (item.norm.includes(q)) return 3;
  if (item.text.includes(q)) return 4;
  if (words.length > 1 && words.every((w) => item.text.includes(w))) return 5;
  return null;
}

/**
 * Résultats d'une rubrique (`ALL` : toutes) pour la requête, les meilleurs d'abord. Sans
 * requête : toute la rubrique choisie, rien pour « Tout ». Une capacité est aussi trouvée par
 * ce qu'elle accorde (une voie par le texte d'une de ses capacités), après les autres.
 */
export function searchIndex(
  systeme: SystemeCharge,
  index: SearchIndex,
  query: string,
  tab: string,
  limit = 60,
): SearchHit[] {
  const pool = tab === ALL ? index.items : index.items.filter((i) => i.tab === tab);
  const q = normaliser(query).replace(/\s+/g, ' ');
  if (!q) return tab === ALL ? [] : pool.slice(0, limit).map((item) => ({ item, via: [] }));
  const words = q.split(' ').filter(Boolean);
  const scored: { hit: SearchHit; r: number }[] = [];
  for (const item of pool) {
    const r = rank(item, q, words);
    if (r !== null) {
      scored.push({ hit: { item, via: [] }, r });
      continue;
    }
    if (item.entry && !item.market) {
      const found = searchEntry(systeme, item.entry, query);
      if (found?.via.length) scored.push({ hit: { item, via: found.via }, r: 6 });
    }
  }
  return scored
    .sort((a, b) => a.r - b.r || byTitle(a.hit.item, b.hit.item))
    .slice(0, limit)
    .map((s) => s.hit);
}
