import { Map as IconeCarte } from 'lucide-react';
import { EtatVide, Page } from '@/components/commun/page';

/** Carte : emplacement réservé, le canevas arrive plus tard. */
export function OngletCarte() {
  return (
    <Page>
      <EtatVide
        icone={IconeCarte}
        titre="Bientôt disponible"
        description="La carte de la table (jetons, brouillard, déplacements) arrive prochainement."
      />
    </Page>
  );
}
