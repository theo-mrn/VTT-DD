'use client';

/** Bloc Attributs : tuiles d'un groupe d'attributs ou d'une liste (caractéristiques, combat…). */
import { BlocAttributs } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function AttributesBlock({ ctx, widget }: SheetBlockProps<'attributs'>) {
  return <BlocAttributs ctx={ctx} widget={widget} />;
}

export const attributesBlock: SheetBlockDefinition<'attributs'> = {
  type: 'attributs',
  label: 'Attributs',
  description: 'Valeurs d’un groupe (caractéristiques, combat…), expliquées au survol.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 2, h: 3 },
  Component: AttributesBlock,
};
