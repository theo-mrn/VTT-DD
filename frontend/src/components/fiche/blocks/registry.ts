/**
 * Registre des blocs de fiche : un bloc par type de widget de la présentation. Le type
 * garantit qu'aucun widget n'est oublié : un nouveau type de widget dans @vtt/rules fait
 * échouer la compilation tant qu'il n'a pas son bloc.
 */
import { actionsBlock } from './actions';
import { attributesBlock } from './attributes';
import { currenciesBlock } from './currencies';
import { detailsBlock } from './details';
import { effectsBlock } from './effects';
import { inventoryBlock } from './inventory';
import { possessionsBlock } from './possessions';
import { resourcesBlock } from './resources';
import { skillsBlock } from './skills';
import { textBlock } from './text';
import type { SheetBlockDefinition, WidgetType } from './types';

export const SHEET_BLOCKS: { [T in WidgetType]: SheetBlockDefinition<T> } = {
  details: detailsBlock,
  attributs: attributesBlock,
  ressources: resourcesBlock,
  competences: skillsBlock,
  inventaire: inventoryBlock,
  possessions: possessionsBlock,
  monnaies: currenciesBlock,
  bonus: effectsBlock,
  actions: actionsBlock,
  texte: textBlock,
};

/** Ordre des familles de blocs dans le sélecteur. */
export const BLOCK_TYPE_ORDER = Object.keys(SHEET_BLOCKS) as WidgetType[];

export function blockDefinition<T extends WidgetType>(type: T): SheetBlockDefinition<T> {
  return SHEET_BLOCKS[type] as SheetBlockDefinition<T>;
}
