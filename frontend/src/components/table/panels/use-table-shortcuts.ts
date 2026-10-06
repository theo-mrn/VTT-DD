'use client';

import { useEffect, useRef } from 'react';
import { GENERAL_SHORTCUTS } from '@/lib/shortcuts/catalog';
import { shortcuts } from '@/lib/shortcuts/dispatcher';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { TABLE_PARAMS, type TablePanel } from './registry';
import { shortcutOfPanel, TABLE_SHORTCUTS } from './shortcuts';
import { usePanelStoreApi } from './store';

/**
 * Raccourcis de la table (docs/raccourcis.md) : la touche d'un panneau l'ouvre ou le ferme,
 * Échap ferme le panneau ouvert, la note rapide crée une note dans la campagne. Passent avant
 * ceux des panneaux (la touche des notes ouvre et ferme les notes, la note rapide en crée une).
 */
export function useTableShortcuts(panels: TablePanel[]) {
  const store = usePanelStoreApi();
  const liste = useRef(panels);
  liste.current = panels;

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

  // Lanceur rapide : à la table, le panneau des dés
  useShortcut(GENERAL_SHORTCUTS.quickRoll, () => store.getState().open('des'), {
    available: () => liste.current.some((p) => p.id === 'des'),
  });

  const ids = panels.map((p) => p.id).join('|');
  useEffect(() => {
    const unbind = liste.current.map((p) =>
      shortcuts.bind(shortcutOfPanel(p.id), { run: () => store.getState().toggle(p.id) }),
    );
    return () => unbind.forEach((u) => u());
  }, [ids, store]);
}
