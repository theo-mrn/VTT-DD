'use client';

/**
 * Raccourcis de la table de dés affichée (docs/raccourcis.md) : relancer le dernier jet,
 * macros 1 à 9, lancer un dé, et les raccourcis créés par le joueur (une formule sur une
 * touche). Passent après la page : une touche prise par la carte (R : rotation) les laisse.
 */
import { useEffect, useRef } from 'react';
import type { Macro } from '@/lib/jets';
import { DICE_MACRO_SHORTCUTS, DICE_ROLL_SHORTCUTS, DICE_SHORTCUTS } from '@/lib/shortcuts/catalog';
import { shortcuts } from '@/lib/shortcuts/dispatcher';
import { useShortcutPrefs } from '@/lib/shortcuts/hooks';
import { customDescriptor } from '@/lib/shortcuts/store';

interface DiceActions {
  relancer(): unknown;
  lancerFormule(formule: string, libelle: string | null): unknown;
  macros: readonly Macro[];
}

export function useDiceShortcuts(enabled: boolean, actions: DiceActions) {
  const latest = useRef(actions);
  latest.current = actions;
  const { custom } = useShortcutPrefs();

  useEffect(() => {
    if (!enabled) return;
    const unbind = [
      shortcuts.bind(DICE_SHORTCUTS.reroll, { run: () => void latest.current.relancer() }),
      ...DICE_MACRO_SHORTCUTS.map((d, i) =>
        shortcuts.bind(d, {
          available: () => Boolean(latest.current.macros[i]),
          run: () => {
            const macro = latest.current.macros[i]!;
            void latest.current.lancerFormule(macro.formula, macro.name);
          },
        }),
      ),
      ...DICE_ROLL_SHORTCUTS.map((d) =>
        shortcuts.bind(d, { run: () => void latest.current.lancerFormule(`1d${d.faces}`, null) }),
      ),
      ...custom.map((u) =>
        shortcuts.bind(customDescriptor(u), {
          run: () => void latest.current.lancerFormule(u.formula, u.label),
        }),
      ),
    ];
    return () => unbind.forEach((u) => u());
  }, [enabled, custom]);
}
