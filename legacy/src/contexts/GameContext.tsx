'use client'

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { doc, getDoc, db } from '@/lib/firebase';
import { getSession, subscribeSession, type SessionStatus } from '@/data/identity';
import { initializeUserChallenges } from '@/lib/challenges';

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
  // Id de l'espèce (ex "advozse") — utilisé pour restreindre certains boutons de sidebar
  // (ex Vision Augmentée) aux espèces ayant la particularité correspondante.
  Race?: string;
}

export interface UserData {
  uid: string;
  roomId: string | null;
  perso: string | null;
}

interface GameContextType {
  // États du jeu
  isMJ: boolean;
  isOwner: boolean;
  persoId: string | null;
  playerData: PlayerData | null;

  // États d'authentification
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;

  // Actions
  setIsMJ: (isMJ: boolean) => void;
  setPersoId: (persoId: string | null) => void;
  setPlayerData: (playerData: PlayerData | null) => void;
  loadCharacterData: (roomId: string, persoId: string) => Promise<void>;

  // Actions d'authentification
  refreshUserData: () => Promise<void>;

  // GM Simulated View
  viewAsPersoId: string | null;
  setViewAsPersoId: (id: string | null) => void;
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
  // États du jeu - initialisation sans localStorage pour éviter les problèmes d'hydratation
  const [isMJ, setIsMJState] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [persoId, setPersoIdState] = useState<string | null>(null);
  const [playerData, setPlayerDataState] = useState<PlayerData | null>(null);

  // États d'authentification
  const [user, setUser] = useState<UserData | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  // GM Simulated View State
  const [viewAsPersoId, setViewAsPersoId] = useState<string | null>(null);

  // Wrappers pour sauvegarder dans localStorage
  const setIsMJ = useCallback((value: boolean) => {
    setIsMJState(value);
    saveToLocalStorage(STORAGE_KEYS.IS_MJ, value);
  }, []);

  const setPersoId = useCallback((value: string | null) => {
    setPersoIdState(value);
    saveToLocalStorage(STORAGE_KEYS.PERSO_ID, value);
  }, []);

  const setPlayerData = useCallback((value: PlayerData | null) => {
    setPlayerDataState(value);
    saveToLocalStorage(STORAGE_KEYS.PLAYER_DATA, value);
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
          Race: charData.Race,
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

  // Helper pour construire PlayerData depuis un document character
  const buildPlayerData = (persoId: string, characterData: Record<string, any>, fallbackName?: string): PlayerData => ({
    id: persoId,
    Nomperso: characterData.Nomperso || fallbackName,
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
    Race: characterData.Race,
  });

  // Fonction pour restaurer les données du joueur — reçoit directement les données du snapshot
  const restorePlayerDataFromSnapshot = useCallback(async (uid: string, userData: Record<string, any>) => {
    try {
      // Lancer les requêtes en parallèle au lieu de séquentiellement
      const roomId = userData.room_id;
      const persoId = userData.persoId;

      const [roomDoc, characterDoc] = await Promise.all([
        roomId ? getDoc(doc(db, 'Salle', roomId)) : Promise.resolve(null),
        (persoId && roomId) ? getDoc(doc(db, `cartes/${roomId}/characters`, persoId)) : Promise.resolve(null),
      ]);

      // Check ownership
      if (roomDoc && roomDoc.exists()) {
        setIsOwner(roomDoc.data().creatorId === uid);
      } else {
        setIsOwner(false);
      }

      // Déterminer rôle et charger personnage
      if (userData.role === 'MJ') {
        setIsMJ(true);
        setPersoId(persoId || null);
        if (characterDoc && characterDoc.exists()) {
          setPlayerData(buildPlayerData(persoId, characterDoc.data(), userData.perso));
        } else {
          setPlayerData(null);
        }
      } else if (persoId && roomId) {
        if (characterDoc && characterDoc.exists()) {
          setIsMJ(false);
          setPersoId(persoId);
          setPlayerData(buildPlayerData(persoId, characterDoc.data(), userData.perso));
        } else {
          setIsMJ(false);
          setPersoId(null);
          setPlayerData(null);
        }
      } else {
        setIsMJ(false);
        setPersoId(null);
        setPlayerData(null);
      }
    } catch (error) {
      console.error('Error restoring player data:', error);
      setIsMJ(false);
      setPersoId(null);
      setPlayerData(null);
    }
  }, [setIsMJ, setPersoId, setPlayerData]);

  // Fonction pour rafraîchir les données utilisateur
  // Le profil est déjà suivi en temps réel par le store de session : plus de relecture réseau.
  const refreshUserData = useCallback(async () => {
    const { user: sessionUser, profile } = getSession();
    if (sessionUser) {
      setUser(prev => ({ uid: sessionUser.uid, roomId: profile?.roomId ?? null, perso: prev?.perso ?? null }));
    }
  }, []);

  // Effet pour l'hydratation - charger depuis localStorage après le montage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedIsMJ = loadFromLocalStorage(STORAGE_KEYS.IS_MJ);
      const savedPersoId = loadFromLocalStorage(STORAGE_KEYS.PERSO_ID);
      const savedPlayerData = loadFromLocalStorage(STORAGE_KEYS.PLAYER_DATA);

      if (savedIsMJ !== null) setIsMJState(savedIsMJ);
      if (savedPersoId !== null) setPersoIdState(savedPersoId);
      if (savedPlayerData !== null) setPlayerDataState(savedPlayerData);

      setIsHydrated(true);
    }
  }, []);

  // Tâches d'initialisation déjà lancées, par utilisateur : une seule fois par session.
  // Avant, elles repartaient à chaque modification de users/{uid}, et la migration
  // des titres écrit dans ce même document : la boucle se relançait d'elle-même.
  const tachesLanceesRef = useRef(new Set<string>());

  // Gestion de l'authentification avec restauration automatique.
  // L'utilisateur et son profil viennent du store de session partagé (@/data/identity) :
  // un seul écouteur d'auth et un seul abonnement à users/{uid} pour toute l'app.
  useEffect(() => {
    let mounted = true;
    // Champs du profil dont dépend restorePlayerDataFromSnapshot : on ne la relance
    // que s'ils changent, pas à chaque modification du document.
    let derniereCle: string | null = null;
    let dernierStatut: SessionStatus | null = null;

    const setUserSiDifferent = (suivant: UserData | null) =>
      setUser(prev =>
        prev && suivant && prev.uid === suivant.uid && prev.roomId === suivant.roomId && prev.perso === suivant.perso
          ? prev
          : suivant,
      );

    const appliquer = async () => {
      const session = getSession();
      const statutPrecedent = dernierStatut;
      dernierStatut = session.status;

      if (session.status === 'loading') return;

      if (session.status === 'authenticated' && session.user) {
        const uid = session.user.uid;
        setIsAuthenticated(true);
        setIsLoading(false);

        if (session.profileStatus === 'missing') {
          // Le document user n'existe pas encore
          derniereCle = null;
          setUserSiDifferent({ uid, roomId: null, perso: null });
          return;
        }
        if (session.profileStatus !== 'ready' || !session.profile) return;

        const userData = session.profile.raw as Record<string, any>;
        setUserSiDifferent({ uid, roomId: session.profile.roomId, perso: session.profile.perso });

        const cle = [uid, userData.room_id, userData.persoId, userData.role, userData.perso].join('|');
        if (cle !== derniereCle) {
          derniereCle = cle;
          await restorePlayerDataFromSnapshot(uid, userData);
        }

        if (!tachesLanceesRef.current.has(uid)) {
          tachesLanceesRef.current.add(uid);
          // Tâches secondaires en parallèle — ne bloquent pas l'affichage
          Promise.all([
            initializeUserChallenges(uid).catch(e => console.error('Error initializing challenges:', e)),
            import('@/lib/migrate-titles').then(m => m.migrateTitlesForUser(uid)).catch(e => console.error('Error migrating titles:', e)),
          ]);
        }
        return;
      }

      // Anonyme : ne vérifier Discord qu'au passage à l'état anonyme
      if (statutPrecedent === 'anonymous') return;
      derniereCle = null;
      {
        // Fallback : vérifier si connecté via Discord Activity (cookie discord_uid)
        try {
          const res = await fetch('/api/discord/me', { credentials: 'include' });
          const { user: discordUser } = await res.json();
          if (discordUser && mounted) {
            setUser(discordUser);
            setIsAuthenticated(true);
          } else if (mounted) {
            setUser(null);
            setIsAuthenticated(false);
            setIsMJ(false);
            setPersoId(null);
            setPlayerData(null);
            clearLocalStorage();
          }
        } catch {
          if (mounted) {
            setUser(null);
            setIsAuthenticated(false);
            setIsMJ(false);
            setPersoId(null);
            setPlayerData(null);
            clearLocalStorage();
          }
        }
      }

      if (mounted) {
        setIsLoading(false);
      }
    };

    const desabonner = subscribeSession(() => {
      if (mounted) void appliquer();
    });
    void appliquer();

    return () => {
      mounted = false;
      desabonner();
    };
  }, [restorePlayerDataFromSnapshot, setIsMJ, setPersoId, setPlayerData]);

  return (
    <GameContext.Provider value={{
      // États du jeu
      isMJ,
      isOwner,
      persoId,
      playerData,

      // États d'authentification
      user,
      isAuthenticated,
      isLoading,
      isHydrated,

      // Actions
      setIsMJ,
      setPersoId,
      setPlayerData,
      loadCharacterData,

      // Actions d'authentification
      refreshUserData,

      // GM Simulated View
      viewAsPersoId,
      setViewAsPersoId
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