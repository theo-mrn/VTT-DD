'use client';

import {
  Crown,
  Dices,
  History,
  Map as IconeCarte,
  NotebookPen,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useContext } from 'react';
import type { DetailCampagne, Membre } from '@/lib/campagnes';
import type { Personnage } from '@/lib/personnages';

/** Ce que tous les onglets de la table savent : la campagne, moi, mon héros. */
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

export interface OngletTable {
  id: string;
  label: string;
  icone: LucideIcon;
  /** Réservé au MJ. */
  gm?: boolean;
  /** Pas encore disponible : affiché désactivé. */
  bientot?: boolean;
}

/** Onglets de la table, dans l'ordre de la navigation (⌥1, ⌥2… dans cet ordre). */
export const ONGLETS: OngletTable[] = [
  { id: 'fiche', label: 'Ma fiche', icone: ScrollText },
  { id: 'des', label: 'Dés', icone: Dices },
  { id: 'notes', label: 'Notes', icone: NotebookPen },
  { id: 'joueurs', label: 'Joueurs', icone: Users },
  { id: 'historique', label: 'Historique', icone: History },
  { id: 'mj', label: 'MJ', icone: Crown, gm: true },
  { id: 'carte', label: 'Carte', icone: IconeCarte, bientot: true },
];

/** Onglets visibles pour ce rôle (le MJ voit le sien). */
export const ongletsPour = (gm: boolean) => ONGLETS.filter((o) => !o.gm || gm);

/** Onglet actif d'après l'adresse (`/campagnes/:id/table/des/...` → `des`). */
export function ongletActif(chemin: string, base: string): string | null {
  if (!chemin.startsWith(base)) return null;
  return chemin.slice(base.length).split('/').filter(Boolean)[0] ?? null;
}
