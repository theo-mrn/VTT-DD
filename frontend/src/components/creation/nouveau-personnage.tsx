'use client';

import { useSearchParams } from 'next/navigation';
import { AssistantPersonnage } from './assistant-personnage';
import { ChoixCampagnePersonnage } from './choix-campagne';

/**
 * /personnages/nouveau : l'assistant n'existe que dans une campagne (`?campagne=`),
 * qui impose le système ; sans elle, on choisit d'abord la campagne.
 */
export function NouveauPersonnage() {
  const campagneId = useSearchParams().get('campagne');
  return campagneId ? (
    <AssistantPersonnage key={campagneId} campagneId={campagneId} />
  ) : (
    <ChoixCampagnePersonnage />
  );
}
