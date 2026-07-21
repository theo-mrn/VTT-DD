// Store global des dimensions (px) de l'image/vidéo de fond de la carte — pont entre page.tsx et
// les scripts de bundle (api.map.getBackgroundSize), qui n'ont autrement aucun moyen fiable de
// convertir un pourcentage (0-100) en coordonnées "px monde" comparables à celles de
// getCharacters()/getMapCharacterPositions (voir character-positions-store.ts, même pattern).

export interface MapBackgroundSize {
  width: number;
  height: number;
}

let size: MapBackgroundSize | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** Publié par page.tsx à chaque (re)chargement de l'image/vidéo de fond ; null si aucune carte chargée. */
export function setMapBackgroundSize(next: MapBackgroundSize | null): void {
  const same = next === size || (next && size && next.width === size.width && next.height === size.height);
  if (same) return;
  size = next;
  notify();
}

export function getMapBackgroundSize(): MapBackgroundSize | null {
  return size;
}

export function subscribeMapBackgroundSize(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
