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
  loadCharacterData: (roomId: string, persoId: string) => Promise<void>;
  
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

  // Fonction pour charger les données du personnage depuis Firebase
  const loadCharacterData = useCallback(async (roomId: string, persoId: string) => {
    try {
      const charRef = doc(db, `cartes/${roomId}/characters/${persoId}`);
      const charSnap = await getDoc(charRef);

      if (charSnap.exists()) {
        const charData = charSnap.data();
        
        // Créer l'objet PlayerData avec toutes les valeurs nécessaires
        const playerDataObj: PlayerData = {
          id: persoId,
          Nomperso: charData.Nomperso || "Utilisateur",
          imageURL: charData.imageURL,
          imageURL2: charData.imageURL2,
          type: charData.type,
          niveau: charData.niveau,
          PV: charData.PV_F || charData.PV,
          Defense: charData.Defense_F || charData.Defense,
          Contact: charData.Contact_F || charData.Contact,
          Distance: charData.Distance_F || charData.Distance,
          Magie: charData.Magie_F || charData.Magie,
          INIT: charData.INIT_F || charData.INIT,
          FOR: charData.FOR_F || charData.FOR,
          DEX: charData.DEX_F || charData.DEX,
          CON: charData.CON_F || charData.CON,
          SAG: charData.SAG_F || charData.SAG,
          INT: charData.INT_F || charData.INT,
          CHA: charData.CHA_F || charData.CHA,
          x: charData.x,
          y: charData.y,
          visibility: charData.visibility,
          visibilityRadius: charData.visibilityRadius,
        };

        setPlayerData(playerDataObj);
        console.log("Character data loaded in context:", playerDataObj);
      } else {
        console.log("No character document found!");
        setPlayerData(null);
      }
    } catch (error) {
      console.error("Error loading character data:", error);
      setPlayerData(null);
    }
  }, []);

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
      loadCharacterData,
      
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