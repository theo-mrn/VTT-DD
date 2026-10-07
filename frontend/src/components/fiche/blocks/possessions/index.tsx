'use client';

/** Bloc Liste : entrées possédées d'une sorte, avec rangs, achat et activation. */
import { translate } from '@/i18n/runtime';
import { BlocPossessions } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function PossessionsBlock({ ctx, widget }: Readonly<SheetBlockProps<'possessions'>>) {
  return <BlocPossessions ctx={ctx} widget={widget} />;
}

export const possessionsBlock: SheetBlockDefinition<'possessions'> = {
  type: 'possessions',
  get label() {
    return translate('sheet.blocks.possessions.label');
  },
  get description() {
    return translate('sheet.blocks.possessions.description');
  },
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 3, h: 3 },
  Component: PossessionsBlock,
};
