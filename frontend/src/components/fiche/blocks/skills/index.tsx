'use client';

/**
 * Bloc Compétences en cartes. Implémentation provisoire (liste des possessions) en attendant
 * le vrai bloc : grille de cartes, actives en avant, bonus, recherche, filtres, détail.
 */
import { BlocPossessions } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function SkillsBlock({ ctx, widget }: SheetBlockProps<'competences'>) {
  return (
    <BlocPossessions
      ctx={ctx}
      widget={{ type: 'possessions', titre: widget.titre, sorte: widget.sorte }}
    />
  );
}

export const skillsBlock: SheetBlockDefinition<'competences'> = {
  type: 'competences',
  label: 'Compétences',
  description: 'Capacités et talents en cartes : actives, bonus, recherche, filtres.',
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: SkillsBlock,
};
