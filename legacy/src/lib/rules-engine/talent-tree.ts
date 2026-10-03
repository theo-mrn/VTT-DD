// ─────────────────────────────────────────────────────────────────────────────
// Grille de talents d'une Spécialisation — nœuds positionnés (x,y), coût XP variable, connexions entre
// cases (traits verticaux/horizontaux, traversables dans les DEUX sens comme sur les grilles EotE
// officielles), répétabilité (maxRank). Générique : ne connaît aucun nom de talent, juste des nœuds
// identifiés par id. Réutilisé par l'éditeur MJ (SpecializationsPanel) et la fiche personnage
// (achat de talents) — même moteur des deux côtés, aucune logique dupliquée.
// ─────────────────────────────────────────────────────────────────────────────

export interface TalentNode {
  /** Identifiant stable, référencé par prerequisiteIds d'autres nœuds — généré côté UI (ex crypto.randomUUID()). */
  id: string;
  x: number;
  y: number;
  title: string;
  description?: string;
  xpCost: number;
  /** IDs d'autres TalentNode de LA MÊME grille auxquels ce nœud est RELIÉ (un trait est tracé entre les
   *  deux cases). La connexion se traverse dans les deux sens pour l'achat : posséder l'une des cases
   *  reliées (rang >= 1) rend l'autre achetable — peu importe laquelle des deux porte l'id de l'autre.
   *  Une case de la première ligne (y = 0) est toujours achetable, connectée ou non. */
  prerequisiteIds: string[];
  /** Absent/1 = achetable une seule fois. >1 = répétable jusqu'à ce rang, coût croissant (cf nextTalentRankCost). */
  maxRank?: number;
}

export interface TalentPurchaseState {
  /** talentNodeId -> rang actuellement acheté (0 ou absent = pas acheté). */
  purchasedRanks: Record<string, number>;
}

/** Coût pour acheter le PROCHAIN rang de ce nœud (rang actuel + 1) — xpCost × rang visé (le coût de
 *  base du nœud est multiplié par le rang, cohérent avec l'escalade de coût des grilles EotE réelles). */
export function nextTalentRankCost(node: TalentNode, currentRank: number): number {
  return node.xpCost * (currentRank + 1);
}

/** Vrai si le rang actuel n'a pas atteint maxRank (défaut 1, non répétable) ET que la case est
 *  atteignable : première ligne (y = 0) toujours achetable, sinon il faut posséder (rang >= 1) AU MOINS
 *  UNE case reliée — la connexion se lit dans les deux sens (node.prerequisiteIds ET les nœuds de
 *  allNodes qui référencent node), comme sur les grilles EotE officielles. */
export function isTalentPurchasable(node: TalentNode, state: TalentPurchaseState, allNodes: TalentNode[]): boolean {
  const currentRank = state.purchasedRanks[node.id] ?? 0;
  const maxRank = node.maxRank ?? 1;
  if (currentRank >= maxRank) return false;
  if (node.y === 0) return true;
  const owned = (id: string) => (state.purchasedRanks[id] ?? 0) >= 1;
  if (node.prerequisiteIds.some(owned)) return true;
  return allNodes.some((other) => other.id !== node.id && other.prerequisiteIds.includes(node.id) && owned(other.id));
}

/** Détecte un cycle de prérequis dans une grille (garde-fou éditeur MJ, DFS classique à 3 couleurs) —
 *  retourne l'id du premier nœud impliqué dans un cycle, ou null si la grille est acyclique. */
export function findTalentTreeCycle(nodes: TalentNode[]): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, 'visiting' | 'done'>();

  function visit(id: string): string | null {
    const current = state.get(id);
    if (current === 'done') return null;
    if (current === 'visiting') return id;

    state.set(id, 'visiting');
    const node = byId.get(id);
    for (const prereqId of node?.prerequisiteIds ?? []) {
      const cycle = visit(prereqId);
      if (cycle) return cycle;
    }
    state.set(id, 'done');
    return null;
  }

  for (const node of nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
}
