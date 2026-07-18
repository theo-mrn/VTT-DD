// Store global de "flags de vue" de la carte — pont générique entre le code externe (scripts de
// bundle via api.map.setViewFlags) et la boucle de rendu de page.tsx. Ces flags sont de l'état React
// inaccessible depuis un script ; ce singleton, lu via useSyncExternalStore, en est la seule porte
// d'écriture. Un seul flag booléen suffit à débloquer un mode "vision alternative" (ex vision verte) :
// il chevauche exactement les rails de playerViewMode/effectiveIsMJ déjà en place.
//
// - revealAll : voir au-delà de son rayon de vision, y compris les personnages cachés/dans le
//   brouillard (comme un MJ). Chevauche effectiveIsMJ.
// - noShadows : ne pas dessiner les ombres portées des obstacles (voir "à travers les murs").
// - noFog     : ne pas dessiner le brouillard.
// - tint      : teinte CSS optionnelle appliquée au canvas de carte (ex '#00ff88' pour la vision
//   verte) — purement cosmétique, gérée côté page.tsx.

export interface MapViewFlags {
  revealAll: boolean;
  noShadows: boolean;
  noFog: boolean;
  tint: string | null;
}

const DEFAULT_FLAGS: MapViewFlags = {
  revealAll: false,
  noShadows: false,
  noFog: false,
  tint: null,
};

let flags: MapViewFlags = DEFAULT_FLAGS;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** Fusionne des flags partiels dans l'état courant. Appelé par api.map.setViewFlags depuis un
 *  script — ou par n'importe quel code de l'app. Ne notifie que si quelque chose change réellement
 *  (évite un re-render inutile de la boucle de rendu). */
export function setMapViewFlags(partial: Partial<MapViewFlags>): void {
  const next = { ...flags, ...partial };
  if (
    next.revealAll === flags.revealAll &&
    next.noShadows === flags.noShadows &&
    next.noFog === flags.noFog &&
    next.tint === flags.tint
  ) {
    return;
  }
  flags = next;
  notify();
}

/** Remet tous les flags à leur valeur par défaut (aucun effet). */
export function resetMapViewFlags(): void {
  setMapViewFlags(DEFAULT_FLAGS);
}

export function getMapViewFlags(): MapViewFlags {
  return flags;
}

export function subscribeMapViewFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
