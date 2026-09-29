/**
 * Code de raccourci d'une touche, commun à la table et à la carte : pour une lettre, celle que
 * la touche tape (`KeyA` pour la touche marquée A, en AZERTY comme en QWERTY : ⌘Z annule sur
 * un clavier français), sinon le code physique (`Digit1` : chiffres de la rangée du haut sans
 * ⇧ en AZERTY, pavé numérique, flèches, Espace).
 */
export function shortcutCode(e: { key: string; code: string }): string {
  return /^[a-z]$/i.test(e.key) ? `Key${e.key.toUpperCase()}` : e.code;
}
