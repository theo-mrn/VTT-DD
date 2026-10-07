'use client';

import { useMemo } from 'react';
import { TableDes, type ContexteTableDes } from '@/components/des/table-des';
import { useCampaignPlayerCharacters } from '@/lib/personnages';
import { useTable, useTableHeros } from '../contexte';
import { usePanelVisible } from '../panels/navigation';

/**
 * Dés : la table de dés fixée sur la campagne, avec les modificateurs et les bonus de mon
 * héros ; le MJ, sans héros, choisit le personnage de la campagne pour qui il lance.
 */
export function OngletDes() {
  const { campagne, gm } = useTable();
  const heros = useTableHeros();
  const visible = usePanelVisible();
  const pjs = useCampaignPlayerCharacters(gm && !heros ? campagne.id : null);
  const contexte = useMemo<ContexteTableDes>(
    () => ({
      campagneId: campagne.id,
      campagneNom: campagne.name,
      gm,
      personnage: heros,
      ...(gm && !heros ? { personnages: pjs.data ?? [] } : {}),
    }),
    [campagne.id, campagne.name, gm, heros, pjs.data],
  );
  return <TableDes contexte={contexte} raccourcis={visible} />;
}
