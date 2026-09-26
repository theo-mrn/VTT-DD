/**
 * Arbres sur la fiche : cartes des arbres ouverts et des entrées qui les
 * ouvrent, grille d'un arbre avec achat au nœud, codex. Composants purs
 * (props explicites) et bloc branché sur le contexte de la fiche.
 */
export { TreesView, type TreesViewProps } from './trees-view';
export { TreeGrid, type TreeGridProps } from './tree-grid';
export { TreeCodex, type TreeCodexProps } from './tree-codex';
export { TreesWidget, type TreesWidgetProps, type TreesWidgetConfig } from './widgets';
export {
  treeViews,
  treesFor,
  nodeViews,
  codexGroups,
  treeTitle,
  type TreeView,
  type NodeView,
  type NodeStatus,
} from './helpers';
