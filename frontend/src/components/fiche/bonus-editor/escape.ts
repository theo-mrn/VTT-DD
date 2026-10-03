/**
 * Marque un élément qui traite Échap lui-même (formule en édition, bonus en saisie) : la
 * fenêtre qui le contient ne se ferme pas et ne revient pas en arrière (Radix écoute Échap
 * en capture, avant l'élément).
 */
export const ECHAP_LOCAL = { 'data-echap-local': '' } as const;

/** Échap vient d'un élément qui le traite lui-même (voir `ECHAP_LOCAL`). */
export function echapLocal(e: KeyboardEvent): boolean {
  return e.target instanceof Element && e.target.closest('[data-echap-local]') !== null;
}
