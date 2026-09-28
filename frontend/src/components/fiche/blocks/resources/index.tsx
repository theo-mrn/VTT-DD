'use client';

/** Bloc Ressources : jauges (PV, stress…) réglables par qui peut modifier la fiche. */
import { BlocRessources, clesRessources } from '../../widgets';
import { attributeTiles } from '../tiles/labels';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function ResourcesBlock({ ctx, widget, arrangement }: SheetBlockProps<'ressources'>) {
  return <BlocRessources ctx={ctx} widget={widget} arrangement={arrangement} />;
}

export const resourcesBlock: SheetBlockDefinition<'ressources'> = {
  type: 'ressources',
  label: 'Ressources',
  description: 'Jauges de vitalité et autres ressources, avec + et −.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 3 },
  tiles: (ctx, widget) => attributeTiles(ctx, clesRessources(ctx, widget)),
  Component: ResourcesBlock,
};
