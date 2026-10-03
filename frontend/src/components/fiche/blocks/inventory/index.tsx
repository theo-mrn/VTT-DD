'use client';

/**
 * Bloc Inventaire de la fiche personnalisable : grille d'emplacements des possessions des
 * sortes du widget (voir ./grid-block.tsx), générique pour tous les systèmes.
 */
import type { SheetBlockDefinition } from '../types';
import { InventoryGrid } from './grid-block';

export const inventoryBlock: SheetBlockDefinition<'inventaire'> = {
  type: 'inventaire',
  label: 'Inventaire',
  description:
    'Objets, armes et équipement en emplacements : dossiers, dons, bonus et formules de dés.',
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: InventoryGrid,
};
