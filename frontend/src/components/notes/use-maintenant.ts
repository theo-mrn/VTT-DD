'use client';

import { useSyncExternalStore } from 'react';

/**
 * Horloges partagées, une par intervalle : tous les « il y a 3 min » d'un écran se
 * rafraîchissent ensemble, sur un seul minuteur, et seuls leurs petits composants se
 * re-rendent (pas l'éditeur ni la liste entière).
 */
interface Horloge {
  maintenant: number;
  abonnes: Set<() => void>;
  minuteur: ReturnType<typeof setInterval> | null;
}
const horloges = new Map<number, Horloge>();

function horloge(intervalle: number): Horloge {
  let h = horloges.get(intervalle);
  if (!h)
    horloges.set(intervalle, (h = { maintenant: Date.now(), abonnes: new Set(), minuteur: null }));
  return h;
}

function abonner(intervalle: number, rappel: () => void) {
  const h = horloge(intervalle);
  h.abonnes.add(rappel);
  if (!h.minuteur) {
    h.maintenant = Date.now();
    h.minuteur = setInterval(() => {
      h.maintenant = Date.now();
      for (const r of h.abonnes) r();
    }, intervalle);
  }
  return () => {
    h.abonnes.delete(rappel);
    if (!h.abonnes.size && h.minuteur) {
      clearInterval(h.minuteur);
      h.minuteur = null;
    }
  };
}

/** Heure courante rafraîchie régulièrement : les « il y a 3 min » restent justes. */
export function useMaintenant(intervalle = 30_000): number {
  return useSyncExternalStore(
    (rappel) => abonner(intervalle, rappel),
    () => horloge(intervalle).maintenant,
    () => horloge(intervalle).maintenant,
  );
}
