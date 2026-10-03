'use client';

import { useEffect, useRef } from 'react';
import { shortcutCode } from '@/lib/keyboard';
import { TABLE_PARAMS, type TablePanel } from './registry';
import { usePanelStoreApi } from './store';

/** Frappe dans un champ, un éditeur, un menu ou une fenêtre (hors panneau) : on se tait. */
function enSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false;
  if (cible.isContentEditable) return true;
  return (
    cible.closest(
      'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"]:not([data-table-panel]), [role="alertdialog"]',
    ) !== null
  );
}

/** Raccourci de la note rapide (⇧N). */
export const QUICK_NOTE_SHORTCUT = { code: 'KeyN', label: '⇧N', aria: 'Shift+N' } as const;

/**
 * Raccourcis de la table : la touche d'un panneau l'ouvre ou le ferme, Échap ferme le panneau
 * ouvert, ⇧N crée une note dans la campagne. Jamais pendant la saisie, jamais en répétition de
 * touche. Écoutés en capture : ils passent avant ceux des panneaux (la touche N ouvre et ferme
 * les notes, ⇧N en crée une).
 */
export function useTableShortcuts(panels: TablePanel[]) {
  const store = usePanelStoreApi();
  const liste = useRef(panels);
  liste.current = panels;

  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (enSaisie(e.target)) return;
      const etat = store.getState();

      if (e.key === 'Escape') {
        if (!etat.active) return;
        e.preventDefault();
        etat.close();
        return;
      }

      // Lettre tapée, pas sa position : les mêmes touches en AZERTY qu'en QWERTY (M, comme la carte)
      const code = shortcutCode(e);
      if (e.shiftKey) {
        if (code !== QUICK_NOTE_SHORTCUT.code) return;
        if (!liste.current.some((p) => p.id === 'notes')) return;
        e.preventDefault();
        etat.open('notes', { [TABLE_PARAMS.newNote]: '1', [TABLE_PARAMS.note]: null });
        return;
      }

      const panneau = liste.current.find((p) => p.shortcut?.code === code);
      if (!panneau) return;
      e.preventDefault();
      etat.toggle(panneau.id);
    };
    document.addEventListener('keydown', clavier, { capture: true });
    return () => document.removeEventListener('keydown', clavier, { capture: true });
  }, [store]);
}
