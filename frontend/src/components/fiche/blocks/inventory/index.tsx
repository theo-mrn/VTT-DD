'use client';

/**
 * Bloc Inventaire. Implémentation provisoire (liste des possessions par sorte) en attendant
 * le vrai bloc : quantités, exemplaires, équipé, bonus, catégories, recherche.
 */
import { BlocPossessions } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function InventoryBlock({ ctx, widget }: SheetBlockProps<'inventaire'>) {
  return (
    <>
      {widget.sortes.map((sorte) => (
        <BlocPossessions
          key={sorte}
          ctx={ctx}
          widget={{ type: 'possessions', titre: widget.titre, sorte }}
        />
      ))}
    </>
  );
}

export const inventoryBlock: SheetBlockDefinition<'inventaire'> = {
  type: 'inventaire',
  label: 'Inventaire',
  description: 'Objets, armes et équipement : quantités, équipé, bonus.',
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: InventoryBlock,
};
