'use client';

/**
 * Bloc Profil : portrait, concept et entrées uniques (espèce, profil, carrière…) avec les
 * attributs texte déclarés par le widget `details` de la présentation.
 */
import { Illustration } from '@/components/commun/illustration';
import { Bloc, ChipsDetails } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function DetailsBlock({ ctx, widget }: SheetBlockProps<'details'>) {
  const { personnage } = ctx;
  return (
    <Bloc titre={widget.titre}>
      <div className="flex gap-4">
        <Illustration
          src={personnage.portraitUrl ?? null}
          graine={personnage.name}
          position="top"
          className="aspect-[3/4] w-20 shrink-0 rounded-xl ring-1 ring-border"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="truncate font-display text-lg font-semibold">{personnage.name}</p>
          <ChipsDetails ctx={ctx} widget={widget} />
        </div>
      </div>
    </Bloc>
  );
}

export const detailsBlock: SheetBlockDefinition<'details'> = {
  type: 'details',
  label: 'Profil',
  description: 'Portrait, entrées uniques (espèce, profil, carrière…) et attributs texte.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 3 },
  Component: DetailsBlock,
};
