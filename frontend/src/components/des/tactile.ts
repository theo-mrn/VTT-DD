/**
 * Classes partagées du lanceur. Les tailles denses (32 à 36 px) conviennent à
 * la souris ; au doigt (`pointer: coarse`), chaque cible passe à 44 px.
 */
export const TACTILE = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

/** Anneau de focus clavier commun aux boutons du lanceur. */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-card';
