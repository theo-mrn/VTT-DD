/**
 * Plein écran de la table (API Fullscreen du navigateur), sans React. Toute la page passe en
 * plein écran, pas seulement la carte : les fenêtres, menus et le HUD de la table (portails dans
 * `body`) restent visibles.
 */

/** Le navigateur sait passer la page en plein écran (pas Safari sur iPhone, par exemple). */
export const fullscreenSupported = (doc: Document | undefined = globalThis.document) =>
  !!doc?.fullscreenEnabled;

export const isFullscreen = (doc: Document | undefined = globalThis.document) =>
  !!doc?.fullscreenElement;

/** Entre en plein écran, ou en sort. Un refus du navigateur est sans suite. */
export function toggleFullscreen(doc: Document = globalThis.document) {
  const done = doc.fullscreenElement
    ? doc.exitFullscreen()
    : doc.documentElement.requestFullscreen();
  void done?.catch(() => undefined);
}

/** Suit l'entrée et la sortie du plein écran (Échap, F11, bouton). */
export function onFullscreenChange(listener: () => void, doc: Document = globalThis.document) {
  doc.addEventListener('fullscreenchange', listener);
  return () => doc.removeEventListener('fullscreenchange', listener);
}
