'use client';

import { createContext, useContext } from 'react';
import type { DetailCampagne, Membre } from '@/lib/campagnes';
import type { Personnage } from '@/lib/personnages';

/**
 * Ce que tous les panneaux de la table savent : la campagne, moi, mon héros (son id). Stable
 * tant que la campagne ne change pas : une écriture sur la fiche du héros ne re-rend pas
 * toute la table (son résumé passe par `useTableHeros`).
 */
export interface Table {
  campagne: DetailCampagne;
  moi: Membre;
  gm: boolean;
  /** Héros incarné, connu de la campagne dès son chargement (null : MJ ou spectateur). */
  herosId: string | null;
  /** Adresse de la table (`/campagnes/:id/table`). */
  base: string;
}

const ContexteTable = createContext<Table | null>(null);
const ContexteHeros = createContext<Personnage | null>(null);

export const FournisseurTable = ContexteTable.Provider;
export const FournisseurHeros = ContexteHeros.Provider;

/** La table courante ; n'existe que sous le cadre de la table. */
export function useTable(): Table {
  const t = useContext(ContexteTable);
  if (!t) throw new Error('useTable hors de la table de jeu');
  return t;
}

/** La table courante, ou null hors de la table (fiche ouverte sur sa propre page). */
export function useTableOptionnelle(): Table | null {
  return useContext(ContexteTable);
}

/**
 * Résumé de mon héros (portrait, nom, ressources) ; null tant qu'il se charge, ou sans héros.
 * Change à chaque écriture sur sa fiche : seuls ses lecteurs (HUD, dés) se re-rendent.
 */
export function useTableHeros(): Personnage | null {
  return useContext(ContexteHeros);
}
