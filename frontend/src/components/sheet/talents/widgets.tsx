'use client';

/** Bloc des arbres branché sur la fiche (adaptateur vers le composant pur). */
import type { Widget } from '@vtt/rules';
import { useSheetBindings } from '../skills/common/use-sheet-bindings';
import { TreesView } from './trees-view';

export type TreesWidgetConfig = Extract<Widget, { type: 'arbres' }>;

export interface TreesWidgetProps {
  /** Bloc `arbres` de la présentation (`titre`). */
  widget: TreesWidgetConfig;
  gm?: boolean;
  className?: string;
}

export function TreesWidget({ widget, gm, className }: TreesWidgetProps) {
  const bindings = useSheetBindings({ gm });
  return <TreesView {...bindings} title={widget.titre} className={className} />;
}
