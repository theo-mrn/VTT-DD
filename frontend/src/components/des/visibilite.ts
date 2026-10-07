import { Crown, EyeOff, Globe, Lock, type LucideIcon } from 'lucide-react';
import type { VisibiliteJet } from '@/lib/jets';

export interface OptionVisibilite {
  valeur: VisibiliteJet;
  icone: LucideIcon;
}

/**
 * Qui voit un jet de campagne : icônes communes au plateau, au résultat et à l'historique
 * (valeurs du service dice) ; libellé et explication : `dice.visibility.<valeur>`. Hors
 * campagne, un jet est toujours personnel (`self`).
 */
export const OPTIONS_VISIBILITE: OptionVisibilite[] = [
  { valeur: 'public', icone: Globe },
  { valeur: 'self', icone: Lock },
  { valeur: 'private', icone: Crown },
  { valeur: 'gm', icone: EyeOff },
];

export function infoVisibilite(v: VisibiliteJet) {
  return OPTIONS_VISIBILITE.find((o) => o.valeur === v) ?? OPTIONS_VISIBILITE[0]!;
}

const VALEURS = new Set<string>(OPTIONS_VISIBILITE.map((o) => o.valeur));

/**
 * Visibilité d'un brouillon enregistré : avant le service dice, « private »
 * voulait dire « vous seul » et « gm » « vous et le MJ ». Un brouillon de
 * cette époque (sans `version`) est traduit, pour ne jamais élargir un jet.
 */
export function visibiliteDuBrouillon(valeur: unknown, version: unknown): VisibiliteJet {
  if (version !== 2) {
    if (valeur === 'private') return 'self';
    if (valeur === 'gm') return 'private';
  }
  return typeof valeur === 'string' && VALEURS.has(valeur) ? (valeur as VisibiliteJet) : 'public';
}
