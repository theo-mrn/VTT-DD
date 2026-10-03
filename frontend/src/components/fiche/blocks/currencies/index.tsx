'use client';

/** Bloc Monnaies : soldes des monnaies de progression (XP, points de capacité…). */
import { BlocMonnaies } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function CurrenciesBlock({ ctx, widget }: Readonly<SheetBlockProps<'monnaies'>>) {
  return <BlocMonnaies ctx={ctx} widget={widget} />;
}

export const currenciesBlock: SheetBlockDefinition<'monnaies'> = {
  type: 'monnaies',
  label: 'Monnaies',
  description: 'Soldes des monnaies du système : gagné, dépensé, disponible.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 3 },
  Component: CurrenciesBlock,
};
