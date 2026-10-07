'use client';

/**
 * Bloc Inventaire de la fiche personnalisable : grille d'emplacements des possessions des
 * sortes du widget (voir ./grid-block.tsx), générique pour tous les systèmes.
 */
import { translate } from '@/i18n/runtime';
import type { SheetBlockDefinition } from '../types';
import { InventoryGrid } from './grid-block';

export const inventoryBlock: SheetBlockDefinition<'inventaire'> = {
  type: 'inventaire',
  get label() {
    return translate('sheet.blocks.inventory.label');
  },
  get description() {
    return translate('sheet.blocks.inventory.description');
  },
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: InventoryGrid,
};
