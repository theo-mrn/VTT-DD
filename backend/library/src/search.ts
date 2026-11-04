/**
 * Recherche plein texte des fonds (docs/bibliotheque.md) : formes de recherche écrites avec chaque
 * description, et termes d'une requête. Tout passe par la même normalisation (minuscules, sans
 * accents ni ligatures) : pas d'extension unaccent en base. Rien de ce que tape l'utilisateur
 * n'atteint la syntaxe de `to_tsquery` : un terme ne garde que des lettres et des chiffres.
 */

/** Minuscules sans accents ni ligatures (« Église » ⇄ « eglise », « œuvre » ⇄ « oeuvre »). */
export function searchForm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .replaceAll('ß', 'ss');
}

/**
 * Mots vides (forme de recherche) : « un grand arbre » cherche « grand » et « arbre ». Sinon,
 * quand la recherche se rabat sur n'importe quel terme, « un » trouverait presque tout.
 */
const STOPWORDS = new Set(
  (
    'a au aux avec ce ces cet cette d dans de des du en et l la le les ou par pour sa ses son sous sur un une ' +
    'an and at by for from in of on or the to with'
  ).split(' '),
);

/**
 * Termes d'une requête (lettres et chiffres), 8 au plus, 64 caractères chacun, sans mots vides
 * (sauf si la requête n'a que ça).
 */
export function searchTerms(q: string): string[] {
  const all = [
    ...new Set(
      searchForm(q)
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((t) => t.slice(0, 64)),
    ),
  ];
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return (meaningful.length ? meaningful : all).slice(0, 8);
}

/** Préfixe tsquery d'un terme : « grot » trouve « grotte » pendant la frappe. */
export const prefix = (term: string) => `'${term}':*`;

/** Textes d'une entrée qui entrent dans la recherche, pour une langue. */
export interface Searchable {
  title: string;
  keywords: readonly string[];
  description: string;
  collection: string | null;
}

/** Tête (titre, mots-clés, collection : poids fort) et corps (description) de la recherche. */
export function searchTexts(e: Searchable): { head: string; body: string } {
  return {
    head: searchForm([e.title, ...e.keywords, e.collection ?? ''].join(' ')).slice(0, 4000),
    body: searchForm(e.description).slice(0, 4000),
  };
}
