/**
 * Registre des blocs de la fiche : à chaque type de bloc de la présentation
 * (`presentation.fiches[type].widgets[].type`) son composant. Tous reçoivent
 * les mêmes props (`widget`, et `sheet` : le contexte de `useSheet()`, fiche
 * calculée, personnage, système, présentation et écritures).
 *
 * Pour brancher un autre composant : remplacer l'entrée ci-dessous, ou
 * appeler `registerWidget(type, composant)` avant le rendu de la fiche.
 */
import type { Widget } from '@vtt/rules';
import type { ComponentType } from 'react';
import type { SheetContextValue } from './context';
import { ActionsWidget } from './widget-actions';
import { AttributesWidget } from './widget-attributes';
import { BonusWidget } from './widget-bonus';
import { CurrenciesWidget } from './widget-currencies';
import { DetailsWidget } from './widget-details';
import { PossessionsWidget } from './widget-possessions';
import { ResourcesWidget } from './widget-resources';
import { TextWidget } from './widget-text';
import { TreesWidget } from './widget-trees';

export type WidgetType = Widget['type'];
export type WidgetOf<T extends WidgetType> = Extract<Widget, { type: T }>;

/** Props communes à tous les blocs. */
export interface SheetWidgetProps<W extends Widget = Widget> {
  widget: W;
  sheet: SheetContextValue;
}

export type WidgetComponent<T extends WidgetType = WidgetType> = ComponentType<
  SheetWidgetProps<WidgetOf<T>>
>;

type Registry = { [T in WidgetType]: WidgetComponent<T> };

/**
 * Composants par défaut. `possessions` (compétences, talents, équipement),
 * `arbres` et `actions` gardent ici une version simple, en attendant les leurs.
 */
export const widgetRegistry: Registry = {
  attributs: AttributesWidget,
  ressources: ResourcesWidget,
  details: DetailsWidget,
  monnaies: CurrenciesWidget,
  texte: TextWidget,
  bonus: BonusWidget,
  possessions: PossessionsWidget,
  arbres: TreesWidget,
  actions: ActionsWidget,
};

/** Remplace le composant d'un type de bloc. */
export function registerWidget<T extends WidgetType>(type: T, component: WidgetComponent<T>) {
  (widgetRegistry as Record<WidgetType, WidgetComponent>)[type] = component as WidgetComponent;
}

/** Composant d'un bloc (typé pour ce bloc). */
export function widgetComponent<W extends Widget>(widget: W): ComponentType<SheetWidgetProps<W>> {
  return widgetRegistry[widget.type] as unknown as ComponentType<SheetWidgetProps<W>>;
}
