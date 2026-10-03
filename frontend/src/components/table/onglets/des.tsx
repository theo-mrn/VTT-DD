'use client';

import { useMemo } from 'react';
import { TableDes, type ContexteTableDes } from '@/components/des/table-des';
import { useTable, useTableHeros } from '../contexte';
import { usePanelVisible } from '../panels/navigation';

/** Dés : la table de dés fixée sur la campagne, avec les modificateurs de mon héros. */
export function OngletDes() {
  const { campagne, gm } = useTable();
  const heros = useTableHeros();
  const visible = usePanelVisible();
  const contexte = useMemo<ContexteTableDes>(
    () => ({ campagneId: campagne.id, campagneNom: campagne.name, gm, personnage: heros }),
    [campagne.id, campagne.name, gm, heros],
  );
  return <TableDes contexte={contexte} raccourcis={visible} />;
}
