'use client';

/**
 * Adaptateur facultatif : remplit les props de `InventoryWidget` depuis le
 * contexte de la fiche (`useSheet()`). Seul fichier du dossier qui dépend de
 * ce contexte ; à ajuster si la fiche principale change d'API.
 */
import { useSheet } from '../context';
import { itemPreview, itemWrite, type ItemUpdate } from './api';
import { InventoryWidget } from './inventory-widget';
import type { InventoryWidgetProps } from './types';

export function ConnectedInventoryWidget(
  props: Pick<InventoryWidgetProps, 'title' | 'kinds' | 'showPurse'>,
) {
  const s = useSheet();
  return (
    <InventoryWidget
      {...props}
      system={s.system}
      presentation={s.presentation}
      character={s.character}
      state={s.state}
      sheet={s.sheet}
      purchases={s.purchases}
      readOnly={s.readOnly}
      onUpdateItem={(u: ItemUpdate) => s.write(itemWrite(u), itemPreview(u))}
      onRemoveItem={s.removePossession}
      onBuy={s.buy}
      onRefund={s.refund}
      onSetValues={s.setValues}
    />
  );
}
