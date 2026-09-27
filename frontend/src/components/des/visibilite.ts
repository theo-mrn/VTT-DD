import { Crown, EyeOff, Globe, Lock } from 'lucide-react';
import type { VisibiliteJet } from '@/lib/jets';
import type { OptionSegment } from './segmente';

/**
 * Qui voit un jet de campagne : libellés et icônes communs au plateau, au
 * résultat et à l'historique (valeurs du service dice). Hors campagne, un jet
 * est toujours personnel (`self`).
 */
export const OPTIONS_VISIBILITE: OptionSegment<VisibiliteJet>[] = [
  {
    valeur: 'public',
    libelle: 'Public',
    icone: Globe,
    aide: 'Visible par toute la table',
  },
  {
    valeur: 'self',
    libelle: 'Privé',
    icone: Lock,
    aide: 'Visible par vous seul',
  },
  {
    valeur: 'private',
    libelle: 'MJ',
    icone: Crown,
    aide: 'Visible par vous et le MJ',
  },
  {
    valeur: 'gm',
    libelle: 'Caché',
    icone: EyeOff,
    aide: 'Le MJ seul voit le résultat : vous savez seulement que vous avez lancé (sans dés 3D)',
  },
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
