import type { ComponentType } from 'react';

// Store global des overlays de carte fournis par les scripts de bundle (api.map.setOverlays) —
// même pattern que sheet-background-store : le script FOURNIT des composants, le layout de la carte
// les rend dans une pile fixe en haut à droite (pointer-events-none, chaque overlay réactive les
// siens au besoin). Local à l'utilisateur ; vidé par l'ExtensionHost au déchargement du bundle.

export interface MapOverlayOption {
  /** Identifiant stable (clé React). */
  id: string;
  Component: ComponentType;
}

let overlays: MapOverlayOption[] = [];
const listeners = new Set<() => void>();

/** Snapshot serveur/SSR stable — useSyncExternalStore exige une référence constante. */
export const EMPTY_MAP_OVERLAYS: MapOverlayOption[] = [];
export function getServerMapOverlays(): MapOverlayOption[] {
  return EMPTY_MAP_OVERLAYS;
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** Remplace la liste des overlays (appelé par un script de bundle). No-op si identique — un script
 *  qui rappelle setOverlays avec les mêmes composants ne doit pas remonter les overlays rendus. */
export function setMapOverlays(next: MapOverlayOption[]): void {
  const same =
    next.length === overlays.length &&
    next.every((o, i) => o.id === overlays[i].id && o.Component === overlays[i].Component);
  if (same) return;
  overlays = next;
  notify();
}

export function getMapOverlays(): MapOverlayOption[] {
  return overlays;
}

export function subscribeMapOverlays(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
