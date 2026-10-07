'use client';

/** Bloc Attributs : tuiles d'un groupe d'attributs ou d'une liste (caractéristiques, combat…). */
import { translate } from '@/i18n/runtime';
import { BlocAttributs, clesAttributs, visiblePour } from '../../widgets';
import { attributeTiles } from '../tiles/labels';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function AttributesBlock({ ctx, widget, arrangement }: Readonly<SheetBlockProps<'attributs'>>) {
  return <BlocAttributs ctx={ctx} widget={widget} arrangement={arrangement} />;
}

export const attributesBlock: SheetBlockDefinition<'attributs'> = {
  type: 'attributs',
  get label() {
    return translate('sheet.blocks.attributes.label');
  },
  get description() {
    return translate('sheet.blocks.attributes.description');
  },
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 2, h: 3 },
  tiles: (ctx, widget) => attributeTiles(ctx, clesAttributs(ctx, widget)),
  // Toute valeur chiffrée du personnage (hors ressources à jauge), d'un autre groupe compris
  addableTiles: (ctx, widget) => {
    const deja = new Set(clesAttributs(ctx, widget));
    return attributeTiles(
      ctx,
      [...ctx.fiche.entite.attributs.values()]
        .filter(
          (a) =>
            (a.nature === 'base' || a.nature === 'derivee') &&
            !deja.has(a.cle) &&
            visiblePour(ctx, a.cle),
        )
        .map((a) => a.cle),
    );
  },
  withTiles: ({ groupe: _groupe, ...widget }, keys) => ({ ...widget, attributs: keys }),
  Component: AttributesBlock,
};
