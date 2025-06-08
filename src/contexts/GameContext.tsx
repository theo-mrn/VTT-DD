'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { auth, onAuthStateChanged, doc, getDoc, db } from '@/lib/firebase';

export interface PlayerData {
  id: string;
  Nomperso: string;
  imageURL?: string;
  imageURL2?: string;
  type?: string;
  niveau?: number;
  PV?: number;
  Defense?: number;
  Contact?: number;
  Distance?: number;
  Magie?: number;
  INIT?: number;
  FOR?: number;
  DEX?: number;
  CON?: number;
  SAG?: number;
  INT?: number;
  CHA?: number;
  x?: number;
  y?: number;
  visibility?: 'visible' | 'hidden';
  visibilityRadius?: number;
}

export interface UserData {
  uid: string;
  roomId: string | null;
}

interface GameContextType {
  // États du jeu
  isMJ: boolean;
  persoId: string | null;
  playerData: PlayerData | null;
  
  // États d'authentification
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setIsMJ: (isMJ: boolean) => void;
  setPersoId: (persoId: string | null) => void;
  setPlayerData: (playerData: PlayerData | null) => void;
  
  // Actions d'authentification
  refreshUserData: () => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  // États du jeu
  const [isMJ, setIsMJ] = useState(false);
  const [persoId, setPersoId] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  
  // États d'authentification
  const [user, setUser] = useState<UserData | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fonction pour récupérer le roomId de l'utilisateur
  const getRoomId = useCallback(async (authUser: { uid: string }): Promise<string | null> => {
    try {
      const userRef = doc(db, 'users', authUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        return userDoc.data().room_id as string;
      }
      return null;
    } catch (error) {
      console.error("Error getting room ID:", error);
      return null;
    }
  }, []);

  // Fonction pour rafraîchir les données utilisateur
  const refreshUserData = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const roomId = await getRoomId(currentUser);
      setUser({ uid: currentUser.uid, roomId });
    }
  }, [getRoomId]);

  // Gestion de l'authentification - optimisée pour éviter les appels répétés
  useEffect(() => {
    let mounted = true;
    
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (!mounted) return;
      
      if (authUser) {
        try {
          const roomId = await getRoomId(authUser);
          if (mounted) {
            setUser({ uid: authUser.uid, roomId });
            setIsAuthenticated(true);
          }
        } catch (error) {
          console.error("Error during authentication:", error);
          if (mounted) {
            setUser(null);
            setIsAuthenticated(false);
          }
        }
      } else {
        if (mounted) {
          setUser(null);
          setIsAuthenticated(false);
          // Reset game state when user logs out
          setIsMJ(false);
          setPersoId(null);
          setPlayerData(null);
        }
      }
      
      if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [getRoomId]);

  return (
    <GameContext.Provider value={{ 
      // États du jeu
      isMJ, 
      persoId, 
      playerData,
      
      // États d'authentification
      user,
      isAuthenticated,
      isLoading,
      
      // Actions
      setIsMJ, 
      setPersoId, 
      setPlayerData,
      
      // Actions d'authentification
      refreshUserData
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
} 