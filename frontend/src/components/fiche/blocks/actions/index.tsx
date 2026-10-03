'use client';

/** Bloc Actions : actions du système lançables depuis la fiche (jets tirés par le service). */
import { BlocActions } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function ActionsBlock({ ctx, widget }: Readonly<SheetBlockProps<'actions'>>) {
  return <BlocActions ctx={ctx} widget={widget} />;
}

export const actionsBlock: SheetBlockDefinition<'actions'> = {
  type: 'actions',
  label: 'Actions',
  description: 'Jets et actions du système, lancés depuis la fiche.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 3 },
  Component: ActionsBlock,
};
