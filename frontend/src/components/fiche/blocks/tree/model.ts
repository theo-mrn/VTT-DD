/**
 * Progression (voies et arbres) du bloc Compétences, calculée par le moteur sans rien
 * connaître du jeu.
 *
 * Deux formes, déduites de ce que le système déclare :
 * - **arbres** (`systeme.arbres`) : grille de nœuds positionnés (`x`, `y`) et de liens,
 *   dessinée avec la géométrie `arbres` de la présentation (talents Star Wars…) ;
 * - **voies** : sortes à rangs dont les entrées accordent d'autres entrées rang par rang
 *   (effets `sur: rang` conditionnés par le rang de la source : voies D&D…). Le seuil de
 *   chaque entrée accordée est lu en évaluant la condition de l'effet, pas son texte.
 *
 * Achats et blocages viennent de `achatsPossibles` ; les remboursements, du journal.
 */
import {
  achatsPossibles,
  arbreOuvert,
  chemins,
  essayer,
  noeudsAcquis,
  variables,
  type Arbre,
  type Entree,
  type EtatEntite,
  type Fiche,
  type ObjetAchetable,
  type PossessionEffective,
  type Sorte,
  type SystemeCharge,
} from '@vtt/rules';

// ─── Outils communs ──────────────────────────────────────────────────────────

/** Rang maximal d'une sorte à rangs, évalué sur la fiche. */
export function maxRank(fiche: Fiche, sorte: Sorte): number | undefined {
  if (!sorte.rangs) return undefined;
  const f = fiche.systeme.formules.get(chemins.rangsMax(sorte.id));
  if (!f) return undefined;
  const r = essayer(fiche, f);
  return r.ok && typeof r.valeur === 'number' ? r.valeur : undefined;
}

type PurchaseKind = 'attribut' | 'entree' | 'noeud';

function kindOf(systeme: SystemeCharge, achatId: string): PurchaseKind | undefined {
  const t = systeme.achats.get(achatId)?.obtient.type;
  return t === 'rang' ? 'entree' : t;
}

/**
 * Dernière ligne du journal qui a obtenu `objet` par un achat du même genre : la seule que
 * le moteur accepte de rembourser (les rangs se retirent dans l'ordre inverse).
 */
export function lastPurchaseIndex(
  systeme: SystemeCharge,
  etat: EtatEntite,
  objet: string,
  kind: PurchaseKind,
): number | undefined {
  for (let i = etat.journal.length - 1; i >= 0; i--) {
    const l = etat.journal[i]!;
    if (l.objet === objet && kindOf(systeme, l.achat) === kind) return i;
  }
  return undefined;
}

// ─── Voies (progression linéaire par rangs) ──────────────────────────────────

/** Entrées accordées par une entrée à rangs, avec le rang de la source qui les donne. */
export interface Grant {
  rank: number;
  entry: Entree;
}

function rankEffects(entry: Entree) {
  return entry.effets
    .map((effet, index) => ({ effet, index }))
    .filter(
      (x): x is { effet: Extract<Entree['effets'][number], { sur: 'rang' }>; index: number } =>
        x.effet.sur === 'rang' && x.effet.entree !== entry.id,
    );
}

/**
 * Sortes à rangs dont au moins une entrée accorde d'autres entrées selon son rang (effet
 * `sur: rang` conditionné) : elles se lisent comme des voies (une ligne de rangs successifs).
 */
export function pathSortes(systeme: SystemeCharge, entityType: string): Sorte[] {
  const ids = new Set<string>();
  for (const e of systeme.entrees.values()) {
    if (ids.has(e.sorte)) continue;
    const sorte = systeme.sortes.get(e.sorte);
    if (!sorte?.rangs || !sorte.pour.includes(entityType)) continue;
    if (rankEffects(e).some((x) => x.effet.condition)) ids.add(e.sorte);
  }
  return [...ids].map((id) => systeme.sortes.get(id)!);
}

/**
 * Entrées accordées par chaque rang d'une entrée : pour chaque effet `sur: rang`, le plus
 * petit rang de la source (1 à `max`) où sa condition est vraie. Sans condition : rang 1.
 */
export function grantsOf(fiche: Fiche, entry: Entree, max: number): Grant[] {
  const r: Grant[] = [];
  for (const { effet, index } of rankEffects(entry)) {
    const target = fiche.systeme.entrees.get(effet.entree);
    if (!target) continue;
    const condition = fiche.systeme.formules.get(chemins.effet(entry.id, index, 'condition'));
    let rank: number | undefined = condition ? undefined : 1;
    for (let n = 1; condition && n <= max; n++) {
      const v = essayer(fiche, condition, {
        variable: variables({ rang: n, actif: true, quantite: 1 }),
      });
      if (v.ok && v.valeur === true) {
        rank = n;
        break;
      }
    }
    if (rank !== undefined) r.push({ rank, entry: target });
  }
  return r.sort((a, b) => a.rank - b.rank);
}

export interface PathRankView {
  rank: number;
  entries: Entree[];
  /** Rang atteint (achat ou rang gratuit). */
  owned: boolean;
  /** Prochain rang : achat proposé (possible ou bloqué, avec ses raisons). */
  offer?: ObjetAchetable;
}

export interface PathView {
  entry: Entree;
  possession: PossessionEffective;
  rank: number;
  maxRank: number;
  ranks: PathRankView[];
  /** Ligne du journal à rembourser pour retirer le dernier rang acheté. */
  refundIndex?: number;
}

export interface PathGroup {
  sorte: Sorte;
  paths: PathView[];
  /** Monnaies des achats de rang de cette sorte. */
  currencies: string[];
}

/** Voies possédées (même au rang 0 quand elles sont prises explicitement), par sorte. */
export function buildPaths(fiche: Fiche): PathGroup[] {
  const { systeme, etat } = fiche;
  const sortes = pathSortes(systeme, etat.type);
  if (!sortes.length) return [];
  const achatIds = [...systeme.achats.values()]
    .filter((a) => {
      const o = a.obtient;
      return o.type === 'rang' && sortes.some((s) => s.id === o.sorte);
    })
    .map((a) => a.id);
  const disponibles = achatIds.length ? achatsPossibles(fiche, achatIds) : [];

  return sortes.flatMap((sorte) => {
    const max = maxRank(fiche, sorte) ?? 1;
    // Un seul rang : rien à parcourir
    if (max < 2) return [];
    const offers = new Map<string, ObjetAchetable>();
    const currencies = new Set<string>();
    for (const d of disponibles) {
      if (d.achat.obtient.type !== 'rang' || d.achat.obtient.sorte !== sorte.id) continue;
      currencies.add(d.achat.monnaie);
      for (const o of d.objets) {
        // Un achat possible l'emporte sur un achat bloqué du même objet
        const prev = offers.get(o.objet);
        if (!prev || (!prev.possible && o.possible)) offers.set(o.objet, o);
      }
    }
    const paths: PathView[] = [...fiche.possessions.values()]
      .filter((p) => p.sorte.id === sorte.id)
      .map((p) => {
        const grants = grantsOf(fiche, p.entree, max);
        const top = Math.max(max, ...grants.map((g) => g.rank));
        const ranks: PathRankView[] = Array.from({ length: top }, (_, i) => {
          const rank = i + 1;
          const offer = rank === p.rang + 1 ? offers.get(p.entree.id) : undefined;
          return {
            rank,
            entries: grants.filter((g) => g.rank === rank).map((g) => g.entry),
            owned: rank <= p.rang,
            ...(offer ? { offer } : {}),
          };
        });
        const refundIndex =
          p.achete > 0 ? lastPurchaseIndex(systeme, etat, p.entree.id, 'entree') : undefined;
        return {
          entry: p.entree,
          possession: p,
          rank: p.rang,
          maxRank: top,
          ranks,
          ...(refundIndex !== undefined ? { refundIndex } : {}),
        };
      });
    return [{ sorte, paths, currencies: [...currencies] }];
  });
}

// ─── Arbres (grille de nœuds) ────────────────────────────────────────────────

/**
 * `owned` acquis ; `available` achetable ; `blocked` relié mais bloqué (solde, prérequis,
 * rang maximal…) ; `locked` pas encore relié à un nœud acquis, ou arbre fermé.
 */
export type NodeState = 'owned' | 'available' | 'blocked' | 'locked';

export interface NodeView {
  id: string;
  entry: Entree;
  x: number;
  y: number;
  state: NodeState;
  /** Coût du nœud (formule du nœud + achat), si un achat de nœud le propose. */
  cost?: number;
  currency?: string;
  offer?: ObjetAchetable;
  /** Ligne du journal qui a acquis ce nœud (remboursement). */
  refundIndex?: number;
  /** Rang total de l'entrée sur la fiche (plusieurs nœuds d'une même entrée cumulent). */
  entryRank: number;
}

export type LinkState = 'owned' | 'open' | 'idle';

export interface LinkView {
  from: NodeView;
  to: NodeView;
  /** `simple` : traversable de `from` vers `to` uniquement. */
  oneWay: boolean;
  state: LinkState;
}

export interface TreeView {
  tree: Arbre;
  open: boolean;
  nodes: NodeView[];
  links: LinkView[];
  /** Colonnes et lignes occupées (x, y max + 1, à partir de 0). */
  columns: number;
  rows: number;
  minX: number;
  minY: number;
  owned: number;
  /** Entrée qui ouvre l'arbre, et son achat quand l'arbre est fermé. */
  opener?: Entree;
  openerOffer?: ObjetAchetable;
  currencies: string[];
}

const LOCKING = new Set(['non-relie', 'arbre-ferme']);

/** Offres des arbres : par nœud (`arbre/noeud`), par entrée qui ouvre un arbre, monnaies par arbre. */
interface TreeOffers {
  nodeOffers: Map<string, ObjetAchetable>;
  openerOffers: Map<string, ObjetAchetable>;
  currenciesByTree: Map<string, Set<string>>;
}

/** Garde la meilleure offre d'un objet : une offre possible remplace une offre impossible. */
function keepBest(target: Map<string, ObjetAchetable>, x: ObjetAchetable) {
  const prev = target.get(x.objet);
  if (!prev || (!prev.possible && x.possible)) target.set(x.objet, x);
}

/** Achats des nœuds et des entrées qui ouvrent un arbre, possibles avec la fiche. */
function treeOffers(fiche: Fiche, arbres: Arbre[]): TreeOffers {
  const { systeme } = fiche;
  const nodeAchats = [...systeme.achats.values()].filter((a) => a.obtient.type === 'noeud');
  const openers = new Set(arbres.map((a) => a.ouvertPar).filter((x): x is string => !!x));
  const openerAchats = [...systeme.achats.values()].filter((a) => {
    const o = a.obtient;
    return (
      o.type === 'entree' && [...openers].some((x) => systeme.entrees.get(x)?.sorte === o.sorte)
    );
  });
  const ids = [...nodeAchats, ...openerAchats].map((a) => a.id);
  const disponibles = ids.length ? achatsPossibles(fiche, ids) : [];

  const offers: TreeOffers = {
    nodeOffers: new Map(),
    openerOffers: new Map(),
    currenciesByTree: new Map(),
  };
  for (const d of disponibles) {
    const noeud = d.achat.obtient.type === 'noeud';
    for (const x of d.objets) {
      if (!noeud && !openers.has(x.objet)) continue;
      keepBest(noeud ? offers.nodeOffers : offers.openerOffers, x);
      if (noeud && x.arbre) {
        const s = offers.currenciesByTree.get(x.arbre) ?? new Set<string>();
        s.add(d.achat.monnaie);
        offers.currenciesByTree.set(x.arbre, s);
      }
    }
  }
  return offers;
}

/** État d'un nœud : acquis, achetable, bloqué (conditions), ou verrouillé (arbre, liens). */
function nodeState(owned: boolean, offer: ObjetAchetable | undefined, open: boolean): NodeState {
  if (owned) return 'owned';
  if (offer?.possible) return 'available';
  if (!open || !offer || offer.blocages.some((b) => LOCKING.has(b.code))) return 'locked';
  return 'blocked';
}

/** Nœud affiché : position, état, offre, coût et rang de l'entrée qu'il donne. */
function nodeView(
  fiche: Fiche,
  tree: Arbre,
  n: Arbre['noeuds'][number],
  ctx: { open: boolean; acquired: Set<string>; nodeOffers: Map<string, ObjetAchetable> },
): NodeView | null {
  const { systeme, etat } = fiche;
  const entry = systeme.entrees.get(n.entree);
  if (!entry) return null;
  const key = `${tree.id}/${n.id}`;
  const offer = ctx.nodeOffers.get(key);
  const owned = ctx.acquired.has(n.id);
  const state = nodeState(owned, offer, ctx.open);
  const refundIndex = owned ? lastPurchaseIndex(systeme, etat, key, 'noeud') : undefined;
  return {
    id: n.id,
    entry,
    x: n.x,
    y: n.y,
    state,
    entryRank: fiche.possessions.get(entry.id)?.rang ?? 0,
    ...(offer ? { offer, cost: offer.cout, currency: offer.monnaie } : {}),
    ...(state === 'owned' ? costOfOwned(fiche, tree, n) : {}),
    ...(refundIndex !== undefined ? { refundIndex } : {}),
  };
}

/** Liens entre nœuds affichés, avec leur état (acquis, ouvert, inactif). */
function linksOf(tree: Arbre, nodes: NodeView[]): LinkView[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: LinkView[] = [];
  for (const l of tree.liens) {
    const from = byId.get(l.de);
    const to = byId.get(l.vers);
    if (!from || !to) continue;
    const a = from.state === 'owned';
    const b = to.state === 'owned';
    const state = linkState(a, b, l.sens === 'double');
    links.push({ from, to, oneWay: l.sens === 'simple', state });
  }
  return links;
}

/** Vue d'un arbre : nœuds, liens, cadre de la grille, ouverture et monnaies. */
function treeView(fiche: Fiche, tree: Arbre, offers: TreeOffers): TreeView {
  const open = arbreOuvert(fiche, tree);
  const acquired = noeudsAcquis(fiche.etat, tree.id);
  const ctx = { open, acquired, nodeOffers: offers.nodeOffers };
  const nodes = tree.noeuds
    .map((n) => nodeView(fiche, tree, n, ctx))
    .filter((n): n is NodeView => n !== null);
  const links = linksOf(tree, nodes);
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const opener = tree.ouvertPar ? fiche.systeme.entrees.get(tree.ouvertPar) : undefined;
  const openerOffer = !open && opener ? offers.openerOffers.get(opener.id) : undefined;
  return {
    tree,
    open,
    nodes,
    links,
    columns: Math.max(...xs) - minX + 1,
    rows: Math.max(...ys) - minY + 1,
    minX,
    minY,
    owned: acquired.size,
    ...(opener ? { opener } : {}),
    ...(openerOffer ? { openerOffer } : {}),
    currencies: [...(offers.currenciesByTree.get(tree.id) ?? [])],
  };
}

export function buildTrees(fiche: Fiche): TreeView[] {
  const { systeme } = fiche;
  const arbres = [...systeme.arbres.values()];
  if (!arbres.length) return [];
  const offers = treeOffers(fiche, arbres);
  return arbres
    .filter((a) => a.noeuds.some((n) => systeme.entrees.has(n.entree)))
    .map((tree) => treeView(fiche, tree, offers));
}

/** Coût affiché d'un nœud déjà acquis : celui payé au journal, sinon la formule du nœud. */
function costOfOwned(
  fiche: Fiche,
  tree: Arbre,
  n: Arbre['noeuds'][number],
): { cost?: number; currency?: string } {
  const key = `${tree.id}/${n.id}`;
  const line = [...fiche.etat.journal].reverse().find((l) => l.objet === key);
  if (line) return { cost: line.cout, currency: line.monnaie };
  const f = fiche.systeme.formules.get(chemins.noeud(tree.id, n.id));
  if (!f) return {};
  const r = essayer(fiche, f, { variable: variables({ x: n.x, y: n.y }) });
  return r.ok && typeof r.valeur === 'number' ? { cost: r.valeur } : {};
}

/** Nom d'une monnaie du système (identifiant à défaut). */
export function currencyName(systeme: SystemeCharge, id: string | undefined): string {
  return (id && systeme.monnaies.get(id)?.nom) || id || '';
}

/** Lien entre deux nœuds : acquis des deux côtés, ouvert depuis un côté acquis, ou inactif. */
function linkState(fromOwned: boolean, toOwned: boolean, twoWay: boolean): LinkState {
  if (fromOwned && toOwned) return 'owned';
  if (fromOwned || (toOwned && twoWay)) return 'open';
  return 'idle';
}
