'use client';

/**
 * Contexte de jeu de la carte : ce que l'ancien `GameContext` (Firestore
 * `Salle/{roomId}`, localStorage) donnait aux composants repris de la carte
 * (`isMJ`, `persoId`, `user`, vue simulée du MJ). Il est maintenant nourri par
 * la campagne (GET /v1/campaigns/:id) et la session : rôle `gm`, personnage
 * incarné (`playedCharacterId`), identifiant du compte.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface UserData {
  /** Identifiant du compte (service identity), l'ancien `uid` Firebase. */
  uid: string;
  /** Campagne ouverte, l'ancien code de salle. */
  roomId: string | null;
  perso: string | null;
}

interface GameContextType {
  isMJ: boolean;
  isOwner: boolean;
  persoId: string | null;
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  /** Vue joueur simulée par le MJ : personnage dont il emprunte le regard. */
  viewAsPersoId: string | null;
  setViewAsPersoId: (id: string | null) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({
  campaignId,
  userId,
  isMJ,
  isOwner = false,
  persoId,
  children,
}: {
  campaignId: string;
  userId: string;
  isMJ: boolean;
  isOwner?: boolean;
  persoId: string | null;
  children: ReactNode;
}) {
  const [viewAsPersoId, setViewAsPersoId] = useState<string | null>(null);
  const value = useMemo<GameContextType>(
    () => ({
      isMJ,
      isOwner,
      persoId,
      user: { uid: userId, roomId: campaignId, perso: persoId },
      isAuthenticated: true,
      isLoading: false,
      isHydrated: true,
      viewAsPersoId,
      setViewAsPersoId,
    }),
    [isMJ, isOwner, persoId, userId, campaignId, viewAsPersoId],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) throw new Error('useGame must be used within a GameProvider');
  return context;
}
