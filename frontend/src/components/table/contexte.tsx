'use client';

import { createContext, useContext } from 'react';
import type { DetailCampagne, Membre } from '@/lib/campagnes';
import type { Personnage } from '@/lib/personnages';

/** Ce que tous les panneaux de la table savent : la campagne, moi, mon héros. */
export interface Table {
  campagne: DetailCampagne;
  moi: Membre;
  gm: boolean;
  /** Héros incarné, connu de la campagne dès son chargement (null : MJ ou spectateur). */
  herosId: string | null;
  /** Son résumé (portrait, nom, ressources) ; null tant qu'il se charge. */
  heros: Personnage | null;
  /** Adresse de la table (`/campagnes/:id/table`). */
  base: string;
}

const ContexteTable = createContext<Table | null>(null);

export const FournisseurTable = ContexteTable.Provider;

/** La table courante ; n'existe que sous le cadre de la table. */
export function useTable(): Table {
  const t = useContext(ContexteTable);
  if (!t) throw new Error('useTable hors de la table de jeu');
  return t;
}
