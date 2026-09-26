/**
 * Inventaire de la fiche : équipement (sortes activables), bourse et bonus
 * propres à chaque objet. Voir `InventoryWidgetProps` pour le branchement.
 */
export { InventoryWidget } from './inventory-widget';
export { ConnectedInventoryWidget } from './connected';
export type { InventoryWidgetProps } from './types';
export { itemPreview, itemWrite, type ItemUpdate } from './api';
export { equipmentKinds, purseLines, checkItemEffects, describeEffect } from './model';
