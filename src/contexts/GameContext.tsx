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

// Clés pour le localStorage
const STORAGE_KEYS = {
  IS_MJ: 'game_isMJ',
  PERSO_ID: 'game_persoId',
  PLAYER_DATA: 'game_playerData',
};

// Fonctions utilitaires pour le localStorage
const saveToLocalStorage = (key: string, value: unknown) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

const loadFromLocalStorage = (key: string) => {
  try {
    if (typeof window !== 'undefined') {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    }
  } catch (error) {
    console.error('Error loading from localStorage:', error);
  }
  return null;
};

const clearLocalStorage = () => {
  try {
    if (typeof window !== 'undefined') {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    }
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
};

export function GameProvider({ children }: { children: ReactNode }) {
  // États du jeu avec restauration immédiate depuis localStorage
  const [isMJ, setIsMJState] = useState(() => loadFromLocalStorage(STORAGE_KEYS.IS_MJ) || false);
  const [persoId, setPersoIdState] = useState<string | null>(() => loadFromLocalStorage(STORAGE_KEYS.PERSO_ID));
  const [playerData, setPlayerDataState] = useState<PlayerData | null>(() => loadFromLocalStorage(STORAGE_KEYS.PLAYER_DATA));
  
  // États d'authentification
  const [user, setUser] = useState<UserData | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Wrappers pour sauvegarder dans localStorage
  const setIsMJ = useCallback((value: boolean) => {
    setIsMJState(value);
    saveToLocalStorage(STORAGE_KEYS.IS_MJ, value);
    console.log('isMJ updated and saved:', value);
  }, []);

  const setPersoId = useCallback((value: string | null) => {
    setPersoIdState(value);
    saveToLocalStorage(STORAGE_KEYS.PERSO_ID, value);
    console.log('persoId updated and saved:', value);
  }, []);

  const setPlayerData = useCallback((value: PlayerData | null) => {
    setPlayerDataState(value);
    saveToLocalStorage(STORAGE_KEYS.PLAYER_DATA, value);
    console.log('playerData updated and saved:', value);
  }, []);

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
  }, [setPlayerData]);

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

  // Fonction pour restaurer les données du joueur depuis Firebase
  const restorePlayerDataFromFirebase = useCallback(async (uid: string) => {
    try {
      console.log('🔍 Restoring player data from Firebase for uid:', uid);
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('📊 User data from Firebase:', userData);
        console.log('🎭 Role:', userData.role);
        console.log('👤 PersoId:', userData.persoId);
        console.log('🏠 RoomId:', userData.room_id);
        
        // Logique corrigée : Si l'utilisateur a un persoId, il est forcément un joueur, pas un MJ
        if (userData.persoId && userData.room_id) {
          console.log('✅ User has persoId, treating as PLAYER regardless of role field');
          
          // Récupérer les données complètes du personnage
          console.log('📥 Loading character data for persoId:', userData.persoId);
          const characterRef = doc(db, `cartes/${userData.room_id}/characters`, userData.persoId);
          const characterDoc = await getDoc(characterRef);
          
          if (characterDoc.exists()) {
            const characterData = characterDoc.data();
            console.log('🧙‍♂️ Character data loaded:', characterData);
            
            const fullCharacterData: PlayerData = { 
              id: userData.persoId, 
              Nomperso: characterData.Nomperso || userData.perso,
              imageURL: characterData.imageURL,
              imageURL2: characterData.imageURL2,
              type: characterData.type,
              niveau: characterData.niveau,
              PV: characterData.PV_F || characterData.PV,
              Defense: characterData.Defense_F || characterData.Defense,
              Contact: characterData.Contact_F || characterData.Contact,
              Distance: characterData.Distance_F || characterData.Distance,
              Magie: characterData.Magie_F || characterData.Magie,
              INIT: characterData.INIT_F || characterData.INIT,
              FOR: characterData.FOR_F || characterData.FOR,
              DEX: characterData.DEX_F || characterData.DEX,
              CON: characterData.CON_F || characterData.CON,
              SAG: characterData.SAG_F || characterData.SAG,
              INT: characterData.INT_F || characterData.INT,
              CHA: characterData.CHA_F || characterData.CHA,
              x: characterData.x,
              y: characterData.y,
              visibility: characterData.visibility,
              visibilityRadius: characterData.visibilityRadius,
            };
            
            // L'utilisateur est un JOUEUR (pas un MJ) car il a un personnage
            setIsMJ(false);
            setPersoId(userData.persoId);
            setPlayerData(fullCharacterData);
            console.log("🎉 Player data restored from Firebase:", fullCharacterData);
            console.log("🎯 Set as PLAYER (isMJ = false)");
          } else {
            console.log("❌ Character document not found for persoId:", userData.persoId);
            // Si le personnage n'existe pas, on ne peut pas être sûr du rôle
            setIsMJ(false);
            setPersoId(null);
            setPlayerData(null);
          }
        } else if (userData.role === 'MJ') {
          console.log('✅ User has MJ role and no persoId, treating as MJ');
          setIsMJ(true);
          setPersoId(null);
          setPlayerData(null);
          console.log("🎭 User restored as MJ");
        } else {
          console.log('⚠️ User has no persoId and no MJ role - unclear state');
          console.log('🔧 Defaulting to non-MJ state');
          setIsMJ(false);
          setPersoId(null);
          setPlayerData(null);
        }
      } else {
        console.log("❌ User document not found in Firebase");
        // Par défaut, pas de MJ
        setIsMJ(false);
        setPersoId(null);
        setPlayerData(null);
      }
    } catch (error) {
      console.error('💥 Error restoring player data from Firebase:', error);
      // En cas d'erreur, état par défaut
      setIsMJ(false);
      setPersoId(null);
      setPlayerData(null);
    }
  }, [setIsMJ, setPersoId, setPlayerData]);

  // Fonction pour rafraîchir les données utilisateur
  const refreshUserData = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const roomId = await getRoomId(currentUser);
      setUser({ uid: currentUser.uid, roomId });
    }
  }, [getRoomId]);

  // Debug: Log des changements d'état
  useEffect(() => {
    console.log('Game Context State:', { isMJ, persoId, playerData: playerData?.Nomperso });
  }, [isMJ, persoId, playerData]);

  // Gestion de l'authentification avec restauration automatique
  useEffect(() => {
    let mounted = true;
    
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (!mounted) return;
      
      console.log('Auth state changed:', authUser?.uid);
      
      if (authUser) {
        try {
          const roomId = await getRoomId(authUser);
          if (mounted) {
            setUser({ uid: authUser.uid, roomId });
            setIsAuthenticated(true);
            
            // Restaurer automatiquement les données du joueur depuis Firebase
            // Cela va mettre à jour localStorage aussi
            await restorePlayerDataFromFirebase(authUser.uid);
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
          // Reset game state when user logs out et clear localStorage
          setIsMJ(false);
          setPersoId(null);
          setPlayerData(null);
          clearLocalStorage();
          console.log('User logged out, context and localStorage cleared');
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
  }, [getRoomId, restorePlayerDataFromFirebase, setIsMJ, setPersoId, setPlayerData]);

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