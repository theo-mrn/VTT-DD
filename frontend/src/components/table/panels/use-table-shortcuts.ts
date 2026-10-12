'use client';

import { useEffect, useRef } from 'react';
import { shortcuts } from '@/lib/shortcuts/dispatcher';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useTable } from '../contexte';
import { TABLE_PARAMS, type TableFeatureItem } from './registry';
import { shortcutOfFeature, TABLE_SHORTCUTS } from './shortcuts';
import { usePanelStoreApi } from './store';

/**
 * Raccourcis de la table (docs/raccourcis.md) : la touche d'un panneau l'ouvre ou le ferme,
 * celle d'une action la lance, Échap ferme le panneau ouvert, la note rapide crée une note dans la campagne. Passent avant
 * ceux des panneaux (la touche des notes ouvre et ferme les notes, la note rapide en crée une).
 */
export function useTableShortcuts(features: TableFeatureItem[]) {
  const store = usePanelStoreApi();
  const table = useTable();
  const tableRef = useRef(table);
  tableRef.current = table;
  const liste = useRef(features);
  liste.current = features;

  useShortcut(TABLE_SHORTCUTS.closePanel, () => {
    const etat = store.getState();
    if (!etat.active) return false;
    etat.close();
  });

  useShortcut(
    TABLE_SHORTCUTS.quickNote,
    () => {
      store.getState().open('notes', { [TABLE_PARAMS.newNote]: '1', [TABLE_PARAMS.note]: null });
    },
    { available: () => liste.current.some((p) => p.id === 'notes') },
  );

  const ids = features.map((f) => f.id).join('|');
  useEffect(() => {
    const unbind = liste.current.map((f) =>
      shortcuts.bind(shortcutOfFeature(f.id), {
        run: () =>
          f.kind === 'panel'
            ? store.getState().toggle(f.id as never)
            : f.run({ table: tableRef.current, panels: store }),
      }),
    );
    return () => unbind.forEach((u) => u());
  }, [ids, store]);
}
