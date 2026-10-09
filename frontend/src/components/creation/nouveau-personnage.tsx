'use client';

import { useSearchParams } from 'next/navigation';
import { AssistantPersonnage } from './assistant-personnage';
import { ChoixCampagnePersonnage } from './choix-campagne';
import { ImportFiche } from './import-fiche';

/**
 * /personnages/nouveau : l'assistant n'existe que dans une campagne (`?campagne=`),
 * qui impose le système ; sans elle, on choisit d'abord la campagne.
 * `?personnage=` reprend un héros dont la création n'est pas terminée ; `?import` importe une
 * fiche existante (docs/import-fiche.md).
 */
export function NouveauPersonnage() {
  const params = useSearchParams();
  const campagneId = params.get('campagne');
  if (campagneId && params.has('import'))
    return <ImportFiche key={campagneId} campagneId={campagneId} />;
  return campagneId ? (
    <AssistantPersonnage
      key={campagneId}
      campagneId={campagneId}
      personnageId={params.get('personnage')}
    />
  ) : (
    <ChoixCampagnePersonnage />
  );
}
