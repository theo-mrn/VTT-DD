'use client';

import type { Widget } from '@vtt/rules';
import { useSheet } from './context';
import { ConnectedInventoryWidget } from './inventory';
import { equipmentKinds } from './inventory/model';
import { EntriesWidget } from './skills';

type PossessionsWidgetConfig = Extract<Widget, { type: 'possessions' }>;

/**
 * Bloc `possessions` : l'équipement (sorte activable sans rangs, avec des
 * champs) s'affiche en inventaire ; les autres sortes en grille à rangs
 * (compétences) ou en liste (talents, capacités, états).
 */
export function PossessionsDispatch({ widget }: { widget: PossessionsWidgetConfig }) {
  const { system, state } = useSheet();
  const equipment = equipmentKinds(system, state.type).some((k) => k.id === widget.sorte);
  return equipment ? (
    <ConnectedInventoryWidget title={widget.titre} kinds={[widget.sorte]} />
  ) : (
    <EntriesWidget widget={widget} />
  );
}
