/**
 * Lectures sans rendu sur les arbres : arbres utiles au type d'entité, entrée
 * qui ouvre chacun, état des nœuds, regroupement du codex. Tout vient du
 * système (arbres, `ouvertPar`, champs des sortes) et des achats possibles.
 */
import {
  arbreOuvert,
  type AchatDisponible,
  type Arbre,
  type Entree,
  type Fiche,
  type ObjetAchetable,
  type SystemeCharge,
} from '@vtt/rules';
import {
  blockKind,
  entriesOfKind,
  itemFor,
  markName,
  nodeCost,
  nodeItems,
  parentEntryField,
} from '../skills/common/helpers';

export type TreeNode = Arbre['noeuds'][number];

/** État d'un nœud pour l'entité. */
export type NodeStatus = 'acquired' | 'available' | 'unaffordable' | 'locked';

export interface NodeView {
  node: TreeNode;
  entry?: Entree;
  status: NodeStatus;
  /** Achat du nœud, s'il est listé (possible ou bloqué). */
  item?: ObjetAchetable;
  cost?: number;
}

/** Arbres dont les nœuds donnent des entrées possédables par ce type d'entité. */
export function treesFor(system: SystemeCharge, type: string): Arbre[] {
  return [...system.arbres.values()].filter((a) =>
    a.noeuds.some((n) => {
      const e = system.entrees.get(n.entree);
      return !!e && !!system.sortes.get(e.sorte)?.pour.includes(type);
    }),
  );
}

export interface TreeView {
  tree: Arbre;
  /** Entrée qui ouvre l'arbre (spécialisation…), si l'arbre en déclare une. */
  opener?: Entree;
  opened: boolean;
  acquired: number;
  /** Achat de l'entrée qui ouvre l'arbre, si elle n'est pas possédée. */
  openerItem?: ObjetAchetable;
  /** Libellé de groupe : entrée pointée par le premier champ « entrée » de l'ouvreur. */
  group?: { id: string; name: string; order: number };
}

export function treeViews(
  system: SystemeCharge,
  sheet: Fiche,
  purchases: AchatDisponible[],
): TreeView[] {
  return treesFor(system, sheet.etat.type).map((tree) => {
    const opener = tree.ouvertPar ? system.entrees.get(tree.ouvertPar) : undefined;
    const opened = arbreOuvert(sheet, tree);
    return {
      tree,
      opener,
      opened,
      acquired: (sheet.etat.noeuds[tree.id] ?? []).length,
      openerItem: !opened && opener ? itemFor(purchases, 'entree', opener.id) : undefined,
      group: opener ? groupOf(system, opener) : undefined,
    };
  });
}

/** Nom affiché d'un arbre : celui de l'entrée qui l'ouvre, sinon le sien. */
export const treeTitle = (v: Pick<TreeView, 'tree' | 'opener'>) => v.opener?.nom ?? v.tree.nom;

function groupOf(system: SystemeCharge, opener: Entree): TreeView['group'] {
  const kind = system.sortes.get(opener.sorte);
  const field = kind && parentEntryField(kind);
  if (!field) return undefined;
  const value = opener.champs[field.id];
  const id = typeof value === 'string' ? value : undefined;
  const parent = id ? system.entrees.get(id) : undefined;
  if (!parent) return undefined;
  const order = entriesOfKind(system, field.sorte).findIndex((e) => e.id === parent.id);
  return { id: parent.id, name: parent.nom, order };
}

/**
 * Regroupe les arbres pour le codex : par entrée parente de l'ouvreur (dans
 * l'ordre du catalogue), puis les ouvreurs sans parent, puis les arbres
 * toujours ouverts.
 */
export function codexGroups(views: TreeView[]): { label: string; views: TreeView[] }[] {
  const byGroup = new Map<string, { label: string; order: number; views: TreeView[] }>();
  const add = (key: string, label: string, order: number, v: TreeView) => {
    const g = byGroup.get(key) ?? { label, order, views: [] };
    g.views.push(v);
    byGroup.set(key, g);
  };
  const hasGroups = views.some((v) => v.group);
  for (const v of views) {
    if (v.group) add(`g:${v.group.id}`, v.group.name, v.group.order, v);
    else if (v.opener) add('autres', hasGroups ? 'Autres' : 'Arbres', 1e6, v);
    else add('ouverts', 'Toujours ouverts', 1e6 + 1, v);
  }
  return [...byGroup.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fr'))
    .map((g) => ({
      label: g.label,
      views: g.views.sort((a, b) => treeTitle(a).localeCompare(treeTitle(b), 'fr')),
    }));
}

/** Marques que pose l'entrée ouvrante, avec les entrées marquées (« Carriere : a, b »). */
export function openerMarks(system: SystemeCharge, opener: Entree): string[] {
  const lines: string[] = [];
  for (const f of opener.effets) {
    if (f.sur !== 'marque') continue;
    const names = f.entrees.map((id) => system.entrees.get(id)?.nom ?? id);
    lines.push(`${markName(f.marque)} : ${names.join(', ')}`);
  }
  return lines;
}

/** État de chaque nœud d'un arbre pour l'entité. */
export function nodeViews(
  system: SystemeCharge,
  sheet: Fiche,
  purchases: AchatDisponible[],
  tree: Arbre,
): Map<string, NodeView> {
  const acquired = new Set(sheet.etat.noeuds[tree.id] ?? []);
  const items = nodeItems(purchases, tree.id);
  const r = new Map<string, NodeView>();
  for (const node of tree.noeuds) {
    const item = items.get(node.id);
    let status: NodeStatus;
    if (acquired.has(node.id)) status = 'acquired';
    else if (item) {
      const k = blockKind(item);
      status = k === null ? 'available' : k === 'funds' ? 'unaffordable' : 'locked';
    } else status = 'locked';
    r.set(node.id, {
      node,
      entry: system.entrees.get(node.entree),
      status,
      item,
      cost: item?.cout ?? nodeCost(sheet, tree.id, node),
    });
  }
  return r;
}

export const STATUS_LABELS: Record<NodeStatus, string> = {
  acquired: 'Acquis',
  available: 'Achetable',
  unaffordable: 'Solde insuffisant',
  locked: 'Bloqué',
};
