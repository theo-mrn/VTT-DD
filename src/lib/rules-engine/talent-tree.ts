// ─────────────────────────────────────────────────────────────────────────────
// Grille de talents d'une Spécialisation — nœuds positionnés (x,y), coût XP variable, prérequis
// multiples (ET logique), répétabilité (maxRank). Générique : ne connaît aucun nom de talent, juste des
// nœuds identifiés par id. Réutilisé par l'éditeur MJ (SpecializationsPanel) et la fiche personnage
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
  /** IDs d'autres TalentNode de LA MÊME grille — tous doivent être achetés (rang >= 1) avant que ce
   *  nœud devienne achetable. Tableau vide = aucun prérequis (accessible dès le départ). */
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

/** Vrai si tous les prérequis sont satisfaits (rang >= 1 dans purchasedRanks) ET que le rang actuel n'a
 *  pas atteint maxRank (défaut 1, non répétable). */
export function isTalentPurchasable(node: TalentNode, state: TalentPurchaseState): boolean {
  const currentRank = state.purchasedRanks[node.id] ?? 0;
  const maxRank = node.maxRank ?? 1;
  if (currentRank >= maxRank) return false;
  return node.prerequisiteIds.every((id) => (state.purchasedRanks[id] ?? 0) >= 1);
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
