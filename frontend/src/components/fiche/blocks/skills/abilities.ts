/**
 * Données du bloc Compétences, en une passe et sans rien connaître du jeu. La forme des vues
 * se déduit du système :
 * - **progression** : voies (sortes à rangs qui accordent d'autres entrées rang par rang) en
 *   tableau, arbres (`systeme.arbres`) en grille ;
 * - **rangs** : sortes du bloc dont les rangs s'achètent directement (tout le catalogue) ;
 * - **capacites** : entrées acquises des autres sortes du bloc.
 */
import { translate } from '@/i18n/runtime';
import {
  solde,
  sortesCompetences,
  type Fiche,
  type Sorte,
  type SystemeCharge,
  type Widget,
} from '@vtt/rules';
import {
  buildPaths,
  buildTrees,
  grantsOf,
  pathSortes,
  type PathGroup,
  type PathView,
  type TreeView,
} from '../tree/model';
import { buildSkills, tagLabel, type SkillCard } from './model';

export type SkillsViewId = 'progression' | 'rangs' | 'capacites';

export const VIEW_ORDER: SkillsViewId[] = ['progression', 'rangs', 'capacites'];

type SkillsWidget = Extract<Widget, { type: 'competences' }>;

/** Voie d'une ligne du tableau, avec sa provenance lisible (sorte qui la donne, étiquette). */
export interface PathRow extends PathView {
  source?: string;
}

/** Entrée acquise : sa carte, sa sorte et, si une voie l'accorde, la voie et le rang. */
export interface OwnedItem {
  card: SkillCard;
  sorte: Sorte;
  path?: { name: string; rank: number; order: number };
  /** Clé du filtre : valeur du champ de filtre, sinon la sorte. */
  filterKey: string;
  filterLabel: string;
}

export interface RankedGroup {
  sorte: Sorte;
  /** Sous-groupes par première étiquette des entrées (un seul, sans titre, s'il n'y en a pas). */
  groups: { key: string; label: string | null; cards: SkillCard[] }[];
}

export interface SkillsBlockData {
  paths: PathRow[];
  /** Colonnes du tableau des voies : le plus haut rang d'une voie. */
  pathColumns: number;
  pathSorteNames: string[];
  trees: TreeView[];
  ranked: RankedGroup[];
  owned: OwnedItem[];
  filters: { key: string; label: string; count: number }[];
  /** Soldes des monnaies dépensées par la progression du bloc. */
  balances: { currency: string; name: string; balance: number }[];
  views: SkillsViewId[];
}

/**
 * Sortes montrées par défaut quand le bloc n'en déclare pas : celles qu'accordent les voies
 * et les arbres, et celles dont les rangs s'achètent (hors voies elles-mêmes et sortes uniques).
 */
export function defaultSkillSortes(systeme: SystemeCharge, entityType: string): string[] {
  const paths = new Set(pathSortes(systeme, entityType).map((s) => s.id));
  const ids = new Set<string>();
  const add = (id: string | undefined) => {
    const s = id ? systeme.sortes.get(id) : undefined;
    if (s && s.pour.includes(entityType) && s.maximum !== 1 && !paths.has(s.id)) ids.add(s.id);
  };
  // Entrées accordées par un rang d'une autre entrée (voie, espèce, race…)
  for (const e of systeme.entrees.values())
    for (const x of e.effets)
      if (x.sur === 'rang' && x.entree !== e.id) add(systeme.entrees.get(x.entree)?.sorte);
  for (const a of systeme.arbres.values())
    for (const n of a.noeuds) add(systeme.entrees.get(n.entree)?.sorte);
  for (const a of systeme.achats.values()) if (a.obtient.type === 'rang') add(a.obtient.sorte);
  return [...ids];
}

/** Sortes de la vue Capacités (et des rangs) : déclarées, sinon déduites ; jamais les voies. */
export function skillSortes(fiche: Fiche, widget: SkillsWidget): string[] {
  const declared = sortesCompetences(widget);
  if (!declared.length) return defaultSkillSortes(fiche.systeme, fiche.etat.type);
  const paths = new Set(pathSortes(fiche.systeme, fiche.etat.type).map((s) => s.id));
  return declared.filter((id) => !paths.has(id));
}

type Possession = Fiche['possessions'] extends ReadonlyMap<string, infer P> ? P : never;

/** L'entrée possédée référence la voie par un de ses champs (entrée ou entrées de sa sorte). */
function referencesPath(p: Possession, path: PathView): boolean {
  return p.sorte.champs.some((c) => {
    if ((c.type !== 'entree' && c.type !== 'entrees') || c.sorte !== path.entry.sorte) return false;
    const v = p.entree.champs[c.id];
    const refs = Array.isArray(v) ? v : [v];
    return refs.includes(path.entry.id);
  });
}

/**
 * Provenance d'une voie : la sorte de l'entrée possédée qui la référence par un champ (profil,
 * race…), hors entrées qu'elle accorde elle-même ; sinon sa première étiquette.
 */
function pathSource(fiche: Fiche, path: PathView): { label?: string; order: number } {
  const { systeme } = fiche;
  const granted = new Set(path.ranks.flatMap((r) => r.entries.map((e) => e.id)));
  for (const p of fiche.possessions.values()) {
    if (p.sorte.id === path.entry.sorte || granted.has(p.entree.id)) continue;
    if (referencesPath(p, path)) return { label: p.sorte.nom, order: 0 };
  }
  const tag = path.entry.etiquettes[0];
  return tag && !systeme.sortes.has(tag) ? { label: tagLabel(tag), order: 1 } : { order: 2 };
}

function pathRows(fiche: Fiche, groups: PathGroup[]): PathRow[] {
  return groups
    .flatMap((g) => g.paths)
    .map((path) => ({ path, src: pathSource(fiche, path) }))
    .sort(
      (a, b) =>
        a.src.order - b.src.order ||
        (a.src.label ?? '').localeCompare(b.src.label ?? '', 'fr') ||
        a.path.entry.nom.localeCompare(b.path.entry.nom, 'fr'),
    )
    .map(({ path, src }) => ({ ...path, ...(src.label ? { source: src.label } : {}) }));
}

type PathRef = { name: string; rank: number; order: number };

/** Voie et rang qui accordent chaque entrée (ordre des lignes du tableau). */
function grantedByOf(fiche: Fiche, paths: PathRow[]): Map<string, PathRef> {
  const grantedBy = new Map<string, PathRef>();
  paths.forEach((p, order) => {
    for (const g of grantsOf(fiche, p.entry, p.maxRank))
      if (!grantedBy.has(g.entry.id))
        grantedBy.set(g.entry.id, { name: p.entry.nom, rank: g.rank, order });
  });
  return grantedBy;
}

/** Champ de filtre du bloc, s'il appartient à la sorte. */
function filterFieldOf(widget: SkillsWidget, sorte: Sorte): string | undefined {
  return widget.filtreChamp && sorte.champs.some((c) => c.id === widget.filtreChamp)
    ? widget.filtreChamp
    : undefined;
}

/** Sorte à rangs achetables : son catalogue par ordre alphabétique, groupé par première étiquette. */
function rankedGroupOf(sorte: Sorte, cards: SkillCard[]): RankedGroup {
  const byTag = new Map<string, SkillCard[]>();
  for (const c of [...cards].sort((a, b) => a.entry.nom.localeCompare(b.entry.nom, 'fr'))) {
    const tag = c.entry.etiquettes[0] ?? '';
    byTag.set(tag, [...(byTag.get(tag) ?? []), c]);
  }
  return {
    sorte,
    groups: [...byTag].map(([key, cards]) => ({
      key,
      label: groupLabel(key, byTag.size),
      cards,
    })),
  };
}

/** Par la valeur du champ de filtre quand la sorte le déclare, sinon par la sorte. */
function ownedFilter(card: SkillCard, sorte: Sorte): [key: string, label: string] {
  if (card.filter?.key) return [`champ:${card.filter.key}`, card.filter.label];
  if (card.filter) return ['champ:', translate('resources.bestiary.others')];
  return [`sorte:${sorte.id}`, sorte.nomPluriel ?? sorte.nom];
}

/** Entrées acquises : d'abord dans l'ordre des voies et des rangs, puis par nom. */
function compareOwned(a: OwnedItem, b: OwnedItem): number {
  return (
    (a.path?.order ?? Infinity) - (b.path?.order ?? Infinity) ||
    (a.path?.rank ?? 0) - (b.path?.rank ?? 0) ||
    a.card.entry.nom.localeCompare(b.card.entry.nom, 'fr')
  );
}

/** Filtres de la vue Capacités, comptés ; aucun s'il n'y en a qu'un. */
function ownedFilters(owned: OwnedItem[]): SkillsBlockData['filters'] {
  const counts = new Map<string, { key: string; label: string; count: number }>();
  for (const o of owned) {
    const c = counts.get(o.filterKey) ?? { key: o.filterKey, label: o.filterLabel, count: 0 };
    c.count++;
    counts.set(o.filterKey, c);
  }
  return counts.size > 1
    ? [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    : [];
}

/** Vues proposées : celles qui ont du contenu, Capacités à défaut de toute autre. */
function viewsOf(
  paths: PathRow[],
  trees: TreeView[],
  ranked: RankedGroup[],
  owned: OwnedItem[],
): SkillsViewId[] {
  const views: SkillsViewId[] = [];
  if (paths.length || trees.length) views.push('progression');
  if (ranked.some((r) => r.groups.length)) views.push('rangs');
  if (owned.length || !views.length) views.push('capacites');
  return views;
}

export function buildSkillsBlock(fiche: Fiche, widget: SkillsWidget): SkillsBlockData {
  const { systeme } = fiche;
  const pathGroups = buildPaths(fiche);
  const paths = pathRows(fiche, pathGroups);
  const trees = buildTrees(fiche);
  const grantedBy = grantedByOf(fiche, paths);

  const ranked: RankedGroup[] = [];
  const owned: OwnedItem[] = [];
  const currencies = new Set<string>([
    ...pathGroups.flatMap((g) => g.currencies),
    ...trees.flatMap((t) => t.currencies),
  ]);
  for (const id of skillSortes(fiche, widget)) {
    const sorte = systeme.sortes.get(id);
    const data = sorte ? buildSkills(fiche, id, filterFieldOf(widget, sorte)) : null;
    if (!sorte || !data) continue;
    for (const p of data.progress) currencies.add(p.currency);
    if (data.rankPurchase) {
      ranked.push(rankedGroupOf(sorte, data.cards));
      continue;
    }
    for (const card of data.cards) {
      const path = grantedBy.get(card.entry.id);
      const [filterKey, filterLabel] = ownedFilter(card, sorte);
      owned.push({ card, sorte, ...(path ? { path } : {}), filterKey, filterLabel });
    }
  }
  owned.sort(compareOwned);

  return {
    paths,
    pathColumns: Math.max(0, ...paths.map((p) => p.maxRank)),
    pathSorteNames: pathGroups.map((g) => g.sorte.nomPluriel ?? g.sorte.nom),
    trees,
    ranked,
    owned,
    filters: ownedFilters(owned),
    balances: [...currencies].map((currency) => ({
      currency,
      name: systeme.monnaies.get(currency)?.nom ?? currency,
      balance: solde(fiche, currency),
    })),
    views: viewsOf(paths, trees, ranked, owned),
  };
}

/** Libellé d'un groupe d'étiquette : aucun s'il est seul, « Autres » sans étiquette. */
function groupLabel(key: string, groups: number): string | null {
  if (groups <= 1) return null;
  return key ? tagLabel(key) : translate('resources.bestiary.others');
}
