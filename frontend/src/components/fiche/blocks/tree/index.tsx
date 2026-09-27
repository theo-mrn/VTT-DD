'use client';

/**
 * Bloc Arbre : la progression déclarée par le système. Voies (entrées à rangs qui accordent
 * d'autres entrées rang par rang) et arbres en grille (nœuds, liens, géométrie `arbres` de la
 * présentation), avec l'achat et le remboursement des rangs et des nœuds par les opérations
 * de la fiche. Rien n'est propre à un jeu : la forme vient des données du système.
 */
import type { SheetBlockDefinition, SheetBlockProps } from '../types';
import { BlockShell } from '../skills/block-shell';
import { TreeExplorer } from './explorer';
import { sheetWrites } from './writes';

function TreeBlock({ ctx, widget, mode }: SheetBlockProps<'arbres'>) {
  const writes = sheetWrites(ctx, mode);
  return (
    <BlockShell title={widget.titre} bodyClassName="p-3 overflow-hidden">
      <TreeExplorer ctx={ctx} writes={writes} />
    </BlockShell>
  );
}

export const treeBlock: SheetBlockDefinition<'arbres'> = {
  type: 'arbres',
  label: 'Arbre',
  description: 'Voies ou arbres de talents du système : rangs, achats et remboursements.',
  defaultSize: { w: 12, h: 10 },
  minSize: { w: 4, h: 6 },
  defaultHeight: 'fixed',
  Component: TreeBlock,
};
