'use client';

/**
 * Blocs branchés sur la fiche : ils lisent le contexte par l'adaptateur et
 * passent tout en props aux composants purs.
 */
import type { Widget } from '@vtt/rules';
import { kindIsPurchasable } from './common/helpers';
import { useSheetBindings } from './common/use-sheet-bindings';
import { EntryList } from './entry-list';
import { RankedEntries } from './ranked-entries';

export type PossessionsWidgetConfig = Extract<Widget, { type: 'possessions' }>;

export interface EntriesWidgetProps {
  /** Bloc `possessions` de la présentation (`sorte`, `titre`, `groupeChamp`). */
  widget: PossessionsWidgetConfig;
  /** Outils MJ (fixer un rang, réinitialiser, ajout libre). */
  gm?: boolean;
  className?: string;
}

/** Entrées à rangs d'une sorte (compétences…), branché sur la fiche. */
export function RankedEntriesWidget({ widget, gm, className }: EntriesWidgetProps) {
  const bindings = useSheetBindings({ gm });
  return (
    <RankedEntries
      {...bindings}
      kind={widget.sorte}
      title={widget.titre}
      groupField={widget.groupeChamp}
      className={className}
    />
  );
}

/** Entrées possédées d'une sorte sans rangs, branché sur la fiche. */
export function EntryListWidget({ widget, gm, className }: EntriesWidgetProps) {
  const bindings = useSheetBindings({ gm });
  return <EntryList {...bindings} kind={widget.sorte} title={widget.titre} className={className} />;
}

/**
 * Choisit le rendu d'un bloc `possessions` : grille d'entrées à rangs si un
 * achat du système en vise les rangs, sinon liste des entrées possédées (avec
 * leur rang s'il y en a : talents obtenus par les arbres…).
 */
export function EntriesWidget(props: EntriesWidgetProps) {
  const { system } = useSheetBindings();
  const kind = system.sortes.get(props.widget.sorte);
  return kind?.rangs && kindIsPurchasable(system, kind.id, 'rang') ? (
    <RankedEntriesWidget {...props} />
  ) : (
    <EntryListWidget {...props} />
  );
}
