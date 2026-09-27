'use client';

import { useMemo } from 'react';
import { TableDes, type ContexteTableDes } from '@/components/des/table-des';
import { useTable } from '../contexte';
import { usePanelVisible } from '../panels/navigation';

/** Dés : la table de dés fixée sur la campagne, avec les modificateurs de mon héros. */
export function OngletDes() {
  const { campagne, gm, heros } = useTable();
  const visible = usePanelVisible();
  const contexte = useMemo<ContexteTableDes>(
    () => ({ campagneId: campagne.id, campagneNom: campagne.name, gm, personnage: heros }),
    [campagne.id, campagne.name, gm, heros],
  );
  return <TableDes contexte={contexte} raccourcis={visible} />;
}
