/**
 * Entrées d'une sorte sur la fiche : grille d'entrées à rangs (compétences…)
 * et liste d'entrées sans rangs. Composants purs (props explicites) et blocs
 * branchés sur le contexte de la fiche.
 */
export {
  RankedEntries,
  buildCard,
  type RankedEntriesProps,
  type RankedCard,
} from './ranked-entries';
export { RankedEntryDialog, type RankedEntryDialogProps } from './ranked-entry-dialog';
export { EntryList, type EntryListProps } from './entry-list';
export { AddEntryDialog, freelyAddable, type AddEntryDialogProps } from './add-entry-dialog';
export {
  RankedEntriesWidget,
  EntryListWidget,
  EntriesWidget,
  type EntriesWidgetProps,
  type PossessionsWidgetConfig,
} from './widgets';
export type { SheetBindings } from './common/bindings';
export { useSheetBindings, type BindingsOptions } from './common/use-sheet-bindings';
