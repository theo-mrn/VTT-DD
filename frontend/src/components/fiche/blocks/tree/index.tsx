'use client';

/**
 * Bloc Arbre (voies, talents). Implémentation provisoire (bloc actuel) en attendant le vrai
 * bloc : arbre déclaré par le système et sa présentation (`arbres`), achat de rangs.
 */
import { BlocArbres } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function TreeBlock({ ctx, widget }: SheetBlockProps<'arbres'>) {
  return <BlocArbres ctx={ctx} widget={widget} />;
}

export const treeBlock: SheetBlockDefinition<'arbres'> = {
  type: 'arbres',
  label: 'Arbre',
  description: 'Voies ou talents du système : rangs et achats.',
  defaultSize: { w: 12, h: 10 },
  minSize: { w: 6, h: 6 },
  Component: TreeBlock,
};
