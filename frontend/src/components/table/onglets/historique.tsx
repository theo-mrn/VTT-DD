'use client';

import { Page } from '@/components/commun/page';
import { Chronique } from '@/components/historique/chronique';
import { useTable } from '../contexte';

/** Historique : la chronique de la campagne (service history), en direct. */
export function OngletHistorique() {
  const { campagne } = useTable();
  return (
    <Page>
      <Chronique campagne={campagne} />
    </Page>
  );
}
