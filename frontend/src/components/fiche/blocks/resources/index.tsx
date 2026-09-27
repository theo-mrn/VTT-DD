'use client';

/** Bloc Ressources : jauges (PV, stress…) réglables par qui peut modifier la fiche. */
import { BlocRessources } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function ResourcesBlock({ ctx, widget }: SheetBlockProps<'ressources'>) {
  return <BlocRessources ctx={ctx} widget={widget} />;
}

export const resourcesBlock: SheetBlockDefinition<'ressources'> = {
  type: 'ressources',
  label: 'Ressources',
  description: 'Jauges de vitalité et autres ressources, avec + et −.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 3 },
  Component: ResourcesBlock,
};
