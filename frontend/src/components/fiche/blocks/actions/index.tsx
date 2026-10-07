'use client';

/** Bloc Actions : actions du système lançables depuis la fiche (jets tirés par le service). */
import { translate } from '@/i18n/runtime';
import { BlocActions } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function ActionsBlock({ ctx, widget }: Readonly<SheetBlockProps<'actions'>>) {
  return <BlocActions ctx={ctx} widget={widget} />;
}

export const actionsBlock: SheetBlockDefinition<'actions'> = {
  type: 'actions',
  get label() {
    return translate('sheet.blocks.actions.label');
  },
  get description() {
    return translate('sheet.blocks.actions.description');
  },
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 3 },
  Component: ActionsBlock,
};
