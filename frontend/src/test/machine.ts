/**
 * Profil de machine figé pour tous les tests : les réglages économes (`lib/perf/device`) lisent
 * le nombre de cœurs et l'OS réels. Sans ça, un runner de CI à 4 cœurs passe en mode économie
 * (moins d'images par seconde…) et les tests qui comptent des images changent de résultat.
 */
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
}
