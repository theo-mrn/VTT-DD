'use client';

import { useMemo } from 'react';
import { TableDes, type ContexteTableDes } from '@/components/des/table-des';
import { groupRollActions } from '../features/groupRoll/state';
import { GroupRollTracker } from '../features/groupRoll/ui/group-roll-tracker';
import { useCampaignPlayerCharacters } from '@/lib/personnages';
import { useTable, useTableHeros } from '../contexte';
import { usePanelVisible } from '../panels/navigation';

/**
 * Dés : la table de dés fixée sur la campagne, avec les modificateurs et les bonus de mon
 * héros ; le MJ, sans héros, choisit le personnage de la campagne pour qui il lance. Le MJ
 * demande aussi le jet du plateau à tous les joueurs (jet de groupe), suivi sous le lanceur.
 */
export function OngletDes() {
  const { campagne, gm } = useTable();
  const heros = useTableHeros();
  const visible = usePanelVisible();
  const pjs = useCampaignPlayerCharacters(gm && !heros ? campagne.id : null);
  const members = campagne.members;
  const contexte = useMemo<ContexteTableDes>(() => {
    // Joueurs qui incarnent un héros : ceux à qui le jet de groupe est demandé
    const joueurs = members.filter((m) => m.role !== 'gm' && m.characterId).map((m) => m.userId);
    return {
      campagneId: campagne.id,
      campagneNom: campagne.name,
      gm,
      personnage: heros,
      ...(gm && !heros ? { personnages: pjs.data ?? [] } : {}),
      ...(gm
        ? {
            groupe: {
              joueurs: joueurs.length,
              demander: ({ formule, libelle, visibilite }) =>
                groupRollActions.start(
                  libelle.trim(),
                  formule.trim(),
                  visibilite === 'public',
                  joueurs,
                ),
              suivi: <GroupRollTracker />,
            },
          }
        : {}),
    };
  }, [campagne.id, campagne.name, gm, heros, pjs.data, members]);
  return <TableDes contexte={contexte} raccourcis={visible} />;
}
