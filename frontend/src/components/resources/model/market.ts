/**
 * Marché des ressources : l'équipement des sortes déclarées par la présentation
 * (`references.marche`), en tables par sorte. Même catalogue que l'inventaire de la fiche :
 * les colonnes, le prix et la catégorie sont des champs des sortes, jamais des clés en dur.
 */
import type { Champ, Entree, Presentation, Sorte, SystemeCharge } from '@vtt/rules';
import { fieldText, normaliser, referenceSheet, valueName } from './catalogue';

export interface MarketColumn {
  id: string;
  name: string;
}

export interface MarketRow {
  entry: Entree;
  /** Valeur lisible de chaque colonne de la section (null : vide). */
  cells: (string | null)[];
  /** Prix (nombre du champ déclaré) ; null : sans prix. */
  price: number | null;
  priceText: string | null;
  /** Catégorie (valeur du champ de regroupement), pour le filtre. */
  category: string | null;
  text: string;
}

export interface MarketSection {
  sorte: Sorte;
  title: string;
  columns: MarketColumn[];
  /** Champ du prix sur cette sorte (son nom donne l'unité), s'il existe. */
  priceField: Champ | null;
  categoryField: Champ | null;
  categories: string[];
  rows: MarketRow[];
}

export type MarketSort = 'nom' | 'prix-croissant' | 'prix-decroissant';

/** Sections du marché : une par sorte déclarée, avec ses lignes (sans les entrées libres). */
export function buildMarket(
  systeme: SystemeCharge,
  presentation: Presentation | null,
): MarketSection[] {
  const m = presentation?.references.marche;
  if (!m) return [];
  return m.sortes.flatMap((decl): MarketSection[] => {
    const sorte = systeme.sortes.get(decl.sorte);
    const entite = sorte?.pour[0];
    if (!sorte || !entite || !systeme.entites.has(entite)) return [];
    const fiche = referenceSheet(systeme, entite);
    const champ = (id: string) => sorte.champs.find((c) => c.id === id) ?? null;
    const actif = (c: Champ | null) => (c && (!c.option || fiche.options[c.option]) ? c : null);
    const columns = decl.colonnes
      .map((id) => actif(champ(id)))
      .filter((c): c is Champ => c !== null);
    const priceField = m.prix !== undefined ? actif(champ(m.prix)) : null;
    const categoryField = decl.groupeChamp ? actif(champ(decl.groupeChamp)) : null;
    const rows = [...systeme.entrees.values()]
      .filter((e) => e.sorte === sorte.id && !e.libre)
      .map((entry): MarketRow => {
        const brut = priceField ? entry.champs[priceField.id] : undefined;
        const price = typeof brut === 'number' ? brut : null;
        const cat = categoryField ? entry.champs[categoryField.id] : undefined;
        const category =
          categoryField && typeof cat === 'string' && cat
            ? valueName(systeme, categoryField, cat)
            : categoryField && 'defaut' in categoryField && categoryField.defaut
              ? valueName(systeme, categoryField, String(categoryField.defaut))
              : null;
        const cells = columns.map((c) => fieldText(fiche, entry, c, true));
        return {
          entry,
          cells,
          price,
          priceText: price !== null ? price.toLocaleString('fr-FR') : null,
          category,
          text: normaliser(
            [entry.nom, entry.description ?? '', category ?? '', ...cells].join(' '),
          ),
        };
      });
    const categories = [
      ...new Set(rows.map((r) => r.category).filter((c): c is string => c !== null)),
    ].sort((a, b) => a.localeCompare(b, 'fr'));
    return [
      {
        sorte,
        title: sorte.nomPluriel ?? sorte.nom,
        columns: columns.map((c) => ({ id: c.id, name: c.nom })),
        priceField,
        categoryField,
        categories,
        rows,
      },
    ];
  });
}

/** Lignes filtrées (recherche plein texte, catégorie) et triées. */
export function visibleRows(
  section: MarketSection,
  query: string,
  category: string,
  sort: MarketSort,
): MarketRow[] {
  const q = normaliser(query);
  const rows = section.rows.filter(
    (r) => (!q || r.text.includes(q)) && (!category || r.category === category),
  );
  const parNom = (a: MarketRow, b: MarketRow) => a.entry.nom.localeCompare(b.entry.nom, 'fr');
  if (sort === 'nom') return rows.sort(parNom);
  const sens = sort === 'prix-croissant' ? 1 : -1;
  // Sans prix : toujours en dernier
  return rows.sort((a, b) =>
    a.price === b.price
      ? parNom(a, b)
      : a.price === null
        ? 1
        : b.price === null
          ? -1
          : (a.price - b.price) * sens,
  );
}

/** Nom de colonne du prix : « Prix (pa) » tel que le système le nomme. */
export function priceLabel(section: MarketSection): string | null {
  return section.priceField?.nom ?? null;
}
