/**
 * Compatibilité des navigateurs. Safari (macOS, et tout navigateur iOS/iPadOS, tous fondés
 * sur WebKit) peut rendre muet un fichier d'un autre domaine branché sur Web Audio
 * (`createMediaElementSource`), alors que l'élément avance et que tout semble jouer. Sur
 * WebKit, les fichiers sont donc lus en direct (volume de l'élément), hors du graphe.
 *
 * `localStorage['vtt:audio:direct']` = `1` ou `0` force le choix (diagnostic).
 */
export function needsDirectMedia(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    const forced = localStorage.getItem('vtt:audio:direct');
    if (forced === '1') return true;
    if (forced === '0') return false;
  } catch {
    // Stockage indisponible : détection normale
  }
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  const safari = /^((?!chrome|chromium|crios|fxios|edg|opr|android).)*safari/i.test(ua);
  return ios || safari;
}
