import type { ComponentType } from 'react';

// Store global des "fonds de fiche" — pont générique permettant à un script de bundle de FOURNIR une
// liste de fonds animés (composants React, ex shaders WebGL), que la FICHE elle-même rend et propose
// au joueur (fiche.tsx). Le script n'affiche rien : il alimente la liste ; la fiche pilote le rendu,
// le sélecteur et la persistance. Comme view-flags-store, c'est la seule porte vers l'état de rendu
// depuis un script. Local à l'utilisateur.

export interface SheetBackgroundOption {
  /** Identifiant stable (persisté par personnage). */
  id: string;
  /** Libellé affiché dans le sélecteur de la fiche. */
  label: string;
  /** Composant rendu en fond ; null = aucun fond (option "Aucun"). */
  Component: ComponentType | null;
}

let options: SheetBackgroundOption[] = [];
const listeners = new Set<() => void>();

/** Snapshot serveur/SSR stable — useSyncExternalStore exige une référence constante (un `() => []`
 *  inline recrée un tableau à chaque appel et peut faire boucler React à l'hydratation). */
export const EMPTY_SHEET_BACKGROUNDS: SheetBackgroundOption[] = [];
export function getServerSheetBackgroundOptions(): SheetBackgroundOption[] {
  return EMPTY_SHEET_BACKGROUNDS;
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** Remplace la liste des fonds disponibles (appelé par un script de bundle). Toujours préfixée d'une
 *  option "Aucun" côté fiche — les scripts n'ont pas à la fournir.
 *  Ne notifie QUE si la liste change réellement (mêmes ids/composants dans le même ordre = no-op) :
 *  un script qui rappelle setBackgrounds(BACKGROUNDS) avec le même tableau ne doit pas provoquer un
 *  re-render qui remonterait le composant de fond (recréation du contexte WebGL → fuite/plantage). */
export function setSheetBackgroundOptions(next: SheetBackgroundOption[]): void {
  const same =
    next.length === options.length &&
    next.every((o, i) => o.id === options[i].id && o.Component === options[i].Component);
  if (same) return;
  options = next;
  notify();
}

export function getSheetBackgroundOptions(): SheetBackgroundOption[] {
  return options;
}

export function subscribeSheetBackgrounds(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
