'use client';

/** Bloc Liste : entrées possédées d'une sorte, avec rangs, achat et activation. */
import { BlocPossessions } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function PossessionsBlock({ ctx, widget }: SheetBlockProps<'possessions'>) {
  return <BlocPossessions ctx={ctx} widget={widget} />;
}

export const possessionsBlock: SheetBlockDefinition<'possessions'> = {
  type: 'possessions',
  label: 'Liste',
  description: 'Entrées possédées d’une sorte, en liste compacte (rangs, achat, activation).',
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 3, h: 3 },
  Component: PossessionsBlock,
};
