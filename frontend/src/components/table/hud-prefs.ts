/**
 * Préférences locales du HUD de la table (confort du MJ, jamais partagées) : la barre de combat,
 * montrée ou rangée (elle revient d'elle-même au début d'un combat). Gardées dans `localStorage`
 * quand il répond ; lues après le montage (le rendu serveur ne les connaît pas).
 */
import { useEffect } from 'react';
import { create } from 'zustand';

const KEY = 'vtt:table:barre-combat';

interface HudPrefs {
  /** Barre de combat du MJ montrée. */
  combatBar: boolean;
  setCombatBar(on: boolean): void;
}

export const useHudPrefs = create<HudPrefs>()((set) => ({
  combatBar: true,
  setCombatBar: (on) => {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // Stockage indisponible : la préférence vaut pour la session
    }
    set({ combatBar: on });
  },
}));

/** Relit la préférence enregistrée, une fois monté. */
export function useHudPrefsHydration() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === '0' || stored === '1') useHudPrefs.setState({ combatBar: stored === '1' });
    } catch {
      // Stockage indisponible : la valeur par défaut reste
    }
  }, []);
}
