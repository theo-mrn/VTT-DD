'use client';

import { useSearchParams } from 'next/navigation';
import { AssistantPersonnage } from './assistant-personnage';
import { ChoixCampagnePersonnage } from './choix-campagne';

/**
 * /personnages/nouveau : l'assistant n'existe que dans une campagne (`?campagne=`),
 * qui impose le système ; sans elle, on choisit d'abord la campagne.
 * `?personnage=` reprend un héros dont la création n'est pas terminée.
 */
export function NouveauPersonnage() {
  const params = useSearchParams();
  const campagneId = params.get('campagne');
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
