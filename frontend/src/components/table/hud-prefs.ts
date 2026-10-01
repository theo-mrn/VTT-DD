/**
 * Préférences locales du HUD de la table (confort du MJ, jamais partagées) : la barre de combat
 * hors combat, montrée ou rangée (en combat, elle est toujours là). Gardées dans `localStorage`
 * quand il répond ; lues après le montage (le rendu serveur ne les connaît pas).
 */
import { useEffect } from 'react';
import { create } from 'zustand';

const KEY = 'vtt:table:barre-combat-hors-combat';

interface HudPrefs {
  /** Barre de combat du MJ montrée hors combat. */
  combatBarIdle: boolean;
  setCombatBarIdle(on: boolean): void;
}

export const useHudPrefs = create<HudPrefs>()((set) => ({
  combatBarIdle: true,
  setCombatBarIdle: (on) => {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // Stockage indisponible : la préférence vaut pour la session
    }
    set({ combatBarIdle: on });
  },
}));

/** Relit la préférence enregistrée, une fois monté. */
export function useHudPrefsHydration() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === '0' || stored === '1') useHudPrefs.setState({ combatBarIdle: stored === '1' });
    } catch {
      // Stockage indisponible : la valeur par défaut reste
    }
  }, []);
}
