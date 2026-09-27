import { Crown, Globe, Lock } from 'lucide-react';
import type { VisibiliteJet } from '@/lib/jets';
import type { OptionSegment } from './segmente';

/** Qui voit un jet : libellés et icônes communs au plateau, au résultat et à l'historique. */
export const OPTIONS_VISIBILITE: OptionSegment<VisibiliteJet>[] = [
  { valeur: 'public', libelle: 'Public', icone: Globe, aide: 'Visible par toute la table' },
  { valeur: 'private', libelle: 'Privé', icone: Lock, aide: 'Visible par vous seul' },
  { valeur: 'gm', libelle: 'MJ', icone: Crown, aide: 'Visible par vous et le MJ' },
];

export function infoVisibilite(v: VisibiliteJet) {
  return OPTIONS_VISIBILITE.find((o) => o.valeur === v) ?? OPTIONS_VISIBILITE[0]!;
}
