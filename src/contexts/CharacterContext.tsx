'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import {
  db,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  getDoc,
  getDocs,
} from '@/lib/firebase';
import { useGame } from './GameContext';
import { Layout } from 'react-grid-layout';
import { useCalculatedBonuses } from '@/hooks/useCharacterData';

// ==================== TYPES ====================

export interface CustomField {
  id: string;
  label: string;
  type: 'number' | 'text' | 'percent' | 'boolean';
  value: string | number | boolean;
  isRollable?: boolean;   // peut être utilisé comme bonus pour les jets de dé
  hasModifier?: boolean;  // affiche le modificateur : floor((value-10)/2)
}

export interface Character {
  id: string;
  Nomperso: string;
  niveau?: number;
  Profile?: string;
  Race?: string;
  Taille?: number;
  Poids?: number;
  imageURL?: string;
  PV?: number;
  PV_Max?: number;
  Defense?: number;
  Contact?: number;
  Magie?: number;
  Distance?: number;
  INIT?: number;
  FOR?: number;
  DEX?: number;
  CON?: number;
  SAG?: number;
  INT?: number;
  CHA?: number;
  type?: string;
  deVie?: string;
  theme_background?: string;
  theme_secondary_color?: string;
  theme_text_color?: string;
  theme_text_secondary_color?: string;
  theme_border_color?: string;
  theme_frame_color?: string;
  theme_border_radius?: number;
  layout?: Layout[];
  customFields?: CustomField[];
  statRollable?: Record<string, boolean>; // overrides for built-in stat rollability
  Background?: string;
  Description?: string;
  [key: string]: any;
}

export interface Bonuses {
  [key: string]: number;
  CHA: number;
  CON: number;
  Contact: number;
  DEX: number;
  Defense: number;
  Distance: number;
  FOR: number;
  INIT: number;
  INT: number;
  Magie: number;
  PV: number;
  SAG: number;
  PV_Max: number;
}

export interface CategorizedBonuses {
  [key: string]: {
    Inventaire: number;
    Competence: number;
  };
}

export interface Competence {
  id: string;
  name: string;
  description: string;
  bonuses: Partial<BonusData>;
  isActive: boolean;
  type: "passive" | "limitée" | "other";
  diceSelection?: string;
}

export interface BonusData {
  CHA: number;
  CON: number;
  DEX: number;
  Defense: number;
  FOR: number;
  INIT: number;
  INT: number;
  Contact: number;
  Distance: number;
  Magie: number;
  PV: number;
  PV_Max: number;
  SAG: number;
  active: boolean;
  category: string;
  name?: string;
  diceSelection?: string;
}

export interface CustomCompetence {
  slotIndex: number;
  voieIndex: number;
  sourceVoie: string;
  sourceRank: number;
  competenceName: string;
  competenceDescription: string;
  competenceType: string;
}

// ==================== CONTEXT ====================

interface CharacterContextType {
  // Personnages
  characters: Character[];
  selectedCharacter: Character | null;
  setSelectedCharacter: (character: Character | null) => void;

  // Bonus
  bonuses: Bonuses | null;
  categorizedBonuses: CategorizedBonuses | null;

  // Compétences
  competences: Competence[];
  refreshCompetences: () => Promise<void>;

  // Utilitaires
  getModifier: (value: number) => number;
  getDisplayModifier: (stat: keyof Character) => number;
  getDisplayValue: (stat: keyof Character) => number;

  // Édition
  updateCharacter: (characterId: string, updates: Partial<Character>) => Promise<void>;

  // État
  isLoading: boolean;
  roomId: string | null;
}

const CharacterContext = createContext<CharacterContextType | undefined>(undefined);

// ==================== PROVIDER ====================

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { user } = useGame();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const { totalBonuses: bonuses, categorizedBonuses } = useCalculatedBonuses(roomId, selectedCharacter?.Nomperso);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [currentLoadedSignature, setCurrentLoadedSignature] = useState<string | null>(null);

  // Cache des compétences par personnage pour éviter les rechargements
  const competencesCache = useRef<Map<string, Competence[]>>(new Map());

  // ==================== UTILITAIRES ====================

  const getModifier = useCallback((value: number): number => {
    return Math.floor((value - 10) / 2);
  }, []);

  const getDisplayModifier = useCallback((stat: keyof Character): number => {
    const baseValue = selectedCharacter ? parseInt(selectedCharacter[stat] as any || "0") : 0;
    const bonusValue = bonuses ? bonuses[stat] || 0 : 0;
    const finalValue = getModifier(baseValue) + bonusValue;

    // Enregistrer la valeur finale dans la base de données (async, sans bloquer)
    if (selectedCharacter && roomId) {
      const finalStatKey = `${stat}_F`;
      const finalStats: Partial<Record<string, number>> = {
        [finalStatKey]: finalValue
      };
      updateDoc(doc(db, `cartes/${roomId}/characters`, selectedCharacter.id), finalStats)
        .catch(error => {
          console.error(`Erreur lors de la sauvegarde de ${finalStatKey}:`, error);
        });
    }

    return finalValue;
  }, [selectedCharacter, bonuses, roomId, getModifier]);

  const getDisplayValue = useCallback((stat: keyof Character): number => {
    const baseValue = selectedCharacter ? parseInt(selectedCharacter[stat] as any || "0") : 0;
    const bonusValue = bonuses ? bonuses[stat] || 0 : 0;
    const finalValue = baseValue + bonusValue;

    // Enregistrer la valeur finale dans la base de données (async, sans bloquer)
    if (selectedCharacter && roomId) {
      const finalStatKey = `${stat}_F`;
      const finalStats: Partial<Record<string, number>> = {
        [finalStatKey]: finalValue
      };
      updateDoc(doc(db, `cartes/${roomId}/characters`, selectedCharacter.id), finalStats)
        .catch(error => {
          console.error(`Erreur lors de la sauvegarde de ${finalStatKey}:`, error);
        });
    }

    return finalValue;
  }, [selectedCharacter, bonuses, roomId]);

  // ==================== CHARGEMENT DES PERSONNAGES ====================

  useEffect(() => {
    if (!user?.roomId) {
      setIsLoading(false);
      return;
    }

    setRoomId(user.roomId);

    // Écouter les changements des personnages en temps réel
    const charactersRef = collection(db, `cartes/${user.roomId}/characters`);

    const unsubscribe = onSnapshot(charactersRef, (snapshot) => {
      const charactersData: Character[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.type === "joueurs") {
          charactersData.push({
            id: doc.id,
            ...data
          } as Character);
        }
      });

      setCharacters(charactersData);

      // Sélectionner automatiquement le premier personnage si aucun n'est sélectionné
      setSelectedCharacterId(prevId => {
        if (!prevId && charactersData.length > 0) {
          return charactersData[0].id;
        }
        return prevId;
      });

      setIsLoading(false);
    }, (error) => {
      console.error("Erreur lors de l'écoute des personnages:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.roomId]);

  // Synchroniser selectedCharacter avec selectedCharacterId
  useEffect(() => {
    if (selectedCharacterId && characters.length > 0) {
      const character = characters.find(c => c.id === selectedCharacterId);
      if (character) {
        setSelectedCharacter(character);
      }
    } else if (!selectedCharacterId) {
      setSelectedCharacter(null);
    }
  }, [selectedCharacterId, characters]);

  // ==================== CHARGEMENT DES COMPÉTENCES ====================

  const loadCustomCompetences = useCallback(async (roomId: string, characterId: string): Promise<CustomCompetence[]> => {
    try {
      const customCompetencesRef = collection(db, `cartes/${roomId}/characters/${characterId}/customCompetences`);
      const customCompetencesSnapshot = await getDocs(customCompetencesRef);

      const customComps: CustomCompetence[] = [];
      customCompetencesSnapshot.forEach((doc) => {
        const data = doc.data();
        customComps.push({
          slotIndex: data.slotIndex,
          voieIndex: data.voieIndex,
          sourceVoie: data.sourceVoie,
          sourceRank: data.sourceRank,
          competenceName: data.competenceName,
          competenceDescription: data.competenceDescription,
          competenceType: data.competenceType,
        });
      });

      return customComps;
    } catch (error) {
      console.error('Error loading custom competences:', error);
      return [];
    }
  }, []);

  const fetchBonusData = useCallback(async (roomId: string, characterName: string, competenceId: string): Promise<Partial<BonusData>> => {
    const bonusRef = doc(db, `Bonus/${roomId}/${characterName}/${competenceId}`);
    const bonusDoc = await getDoc(bonusRef);

    if (bonusDoc.exists()) {
      const bonusData = bonusDoc.data() as BonusData;
      return {
        CHA: bonusData.CHA || 0,
        CON: bonusData.CON || 0,
        Contact: bonusData.Contact || 0,
        DEX: bonusData.DEX || 0,
        Defense: bonusData.Defense || 0,
        Distance: bonusData.Distance || 0,
        FOR: bonusData.FOR || 0,
        INIT: bonusData.INIT || 0,
        INT: bonusData.INT || 0,
        Magie: bonusData.Magie || 0,
        PV: bonusData.PV || 0,
        PV_Max: bonusData.PV_Max || 0,
        SAG: bonusData.SAG || 0,
        active: bonusData.active || false,
        name: bonusData.name,
        diceSelection: bonusData.diceSelection,
      };
    } else {
      return {};
    }
  }, []);

  // Charger les compétences quand le personnage sélectionné change
  useEffect(() => {
    if (!roomId || !selectedCharacter) {
      setCompetences([]);
      return;
    }

    // Create a signature based on competence levels to force refresh when they change
    const competenceLevels = [];
    for (let i = 1; i <= 10; i++) {
      competenceLevels.push(`${selectedCharacter[`Voie${i}`]}:${selectedCharacter[`v${i}`] || 0}`);
    }
    const competenceSignature = competenceLevels.join('|');
    const characterCacheKey = `${roomId}-${selectedCharacter.id}-${competenceSignature}`;

    if (currentLoadedSignature === characterCacheKey && competences.length > 0) {
      // We already have the correct competences loaded for this signature.
      // Do nothing to avoid overriding fresh bonus states with stale structural cache.
      return;
    }

    // 1. Vérifier le cache et afficher immédiatement si disponible
    const cachedCompetences = competencesCache.current.get(characterCacheKey);
    if (cachedCompetences) {
      setCompetences(cachedCompetences);
      setCurrentLoadedSignature(characterCacheKey);
      return; 
    }

    // 2. Charger les nouvelles compétences
    const loadCompetences = async () => {
      try {
        const characterRef = doc(db, `cartes/${roomId}/characters/${selectedCharacter.id}`);
        const characterDoc = await getDoc(characterRef);

        if (characterDoc.exists()) {
          const characterData = characterDoc.data();
          const skills: Competence[] = [];

          // Load custom competences first
          const customComps = await loadCustomCompetences(roomId, selectedCharacter.id);

          // Dynamically find all available voies (up to 10)
          for (let i = 1; i <= 10; i++) {
            const voieFile = characterData[`Voie${i}`];
            const voieLevel = characterData[`v${i}`] || 0;

            if (voieFile && voieFile.trim() !== '' && voieLevel > 0) {
              try {
                const skillData = await fetch(`/tabs/${voieFile}`).then((res) => res.json());

                for (let j = 1; j <= voieLevel; j++) {
                  let skillName = skillData[`Affichage${j}`];
                  let skillDescription = skillData[`rang${j}`];
                  let skillType = skillData[`type${j}`];

                  // Check if this competence has been customized
                  const customComp = customComps.find(cc =>
                    cc.voieIndex === i - 1 && cc.slotIndex === j - 1
                  );

                  if (customComp) {
                    skillName = `🔄 ${customComp.competenceName}`;
                    skillDescription = `${customComp.competenceDescription}<br><br><em>📍 Depuis: ${customComp.sourceVoie} (rang ${customComp.sourceRank})</em>`;
                    skillType = customComp.competenceType;
                  }

                  if (skillName && skillDescription && skillType) {
                    const skillId = `${voieFile}-${j}`;

                    // Récupérer les bonus associés depuis Firestore
                    const bonusData = await fetchBonusData(roomId, characterData.Nomperso, skillId);

                    // Sync name if missing or different (Auto-fix for widget display)
                    if (bonusData && (!bonusData.name || bonusData.name !== skillName)) {
                      const bonusRef = doc(db, `Bonus/${roomId}/${characterData.Nomperso}/${skillId}`);
                      // Fire and forget update
                      updateDoc(bonusRef, { name: skillName }).catch(err => console.error("Error syncing bonus name", err));
                    }

                    skills.push({
                      id: skillId,
                      name: skillName,
                      description: skillDescription,
                      bonuses: bonusData,
                      isActive: bonusData.active || false,
                      type: skillType as Competence["type"],
                      diceSelection: bonusData.diceSelection || undefined,
                    });
                  }
                }
              } catch (error) {
                console.error(`Error loading voie ${voieFile}:`, error);
              }
            }
          }

          competencesCache.current.set(characterCacheKey, skills);
          setCompetences(skills);
          setCurrentLoadedSignature(characterCacheKey);
        } else {
          console.error("Character document not found in Firestore.");
          setCompetences([]);
        }
      } catch (error) {
        console.error("Error fetching character skills:", error);
        // En cas d'erreur, garder les compétences en cache si disponibles
        if (!cachedCompetences) {
          setCompetences([]);
        }
      }
    };

    loadCompetences();
  }, [selectedCharacter, roomId, loadCustomCompetences, fetchBonusData]);

  // Fonction exposée pour forcer le rechargement manuel si nécessaire
  const refreshCompetences = useCallback(async () => {
    if (!roomId || !selectedCharacter) return;

    const competenceLevels = [];
    for (let i = 1; i <= 10; i++) {
      competenceLevels.push(`${selectedCharacter[`Voie${i}`]}:${selectedCharacter[`v${i}`] || 0}`);
    }
    const competenceSignature = competenceLevels.join('|');
    const characterCacheKey = `${roomId}-${selectedCharacter.id}-${competenceSignature}`;

    // Déclencher un rechargement en forçant une mise à jour

    try {
      const characterRef = doc(db, `cartes/${roomId}/characters/${selectedCharacter.id}`);
      const characterDoc = await getDoc(characterRef);

      if (characterDoc.exists()) {
        const characterData = characterDoc.data();
        const skills: Competence[] = [];

        const customComps = await loadCustomCompetences(roomId, selectedCharacter.id);

        for (let i = 1; i <= 10; i++) {
          const voieFile = characterData[`Voie${i}`];
          const voieLevel = characterData[`v${i}`] || 0;

          if (voieFile && voieFile.trim() !== '' && voieLevel > 0) {
            try {
              const skillData = await fetch(`/tabs/${voieFile}`).then((res) => res.json());

              for (let j = 1; j <= voieLevel; j++) {
                let skillName = skillData[`Affichage${j}`];
                let skillDescription = skillData[`rang${j}`];
                let skillType = skillData[`type${j}`];

                const customComp = customComps.find(cc =>
                  cc.voieIndex === i - 1 && cc.slotIndex === j - 1
                );

                if (customComp) {
                  skillName = `🔄 ${customComp.competenceName}`;
                  skillDescription = `${customComp.competenceDescription}<br><br><em>📍 Depuis: ${customComp.sourceVoie} (rang ${customComp.sourceRank})</em>`;
                  skillType = customComp.competenceType;
                }

                if (skillName && skillDescription && skillType) {
                  const skillId = `${voieFile}-${j}`;
                  const bonusData = await fetchBonusData(roomId, characterData.Nomperso, skillId);

                  // Sync name if missing or different (Auto-fix for widget display)
                  if (bonusData && (!bonusData.name || bonusData.name !== skillName)) {
                    const bonusRef = doc(db, `Bonus/${roomId}/${characterData.Nomperso}/${skillId}`);
                    updateDoc(bonusRef, { name: skillName }).catch(err => console.error("Error syncing bonus name", err));
                  }

                  skills.push({
                    id: skillId,
                    name: skillName,
                    description: skillDescription,
                    bonuses: bonusData,
                    isActive: bonusData.active || false,
                    type: skillType as Competence["type"],
                    diceSelection: bonusData.diceSelection || undefined,
                  });
                }
              }
            } catch (error) {
              console.error(`Error loading voie ${voieFile}:`, error);
            }
          }
        }

        // Mettre à jour le cache et l'état
        competencesCache.current.set(characterCacheKey, skills);
        setCompetences(skills);
        setCurrentLoadedSignature(characterCacheKey);
      }
    } catch (error) {
      console.error("Error refreshing character skills:", error);
    }
  }, [roomId, selectedCharacter, loadCustomCompetences, fetchBonusData]);

  // ==================== MISE À JOUR DES PERSONNAGES ====================

  const updateCharacter = useCallback(async (characterId: string, updates: Partial<Character>) => {
    if (!roomId) return;

    try {
      // ─── ACTIONS-BASED LOGGING (HISTORIQUE) ───
      const char = characters.find(c => c.id === characterId);
      if (char) {
        const name = char.Nomperso || 'Inconnu';
        const rawImage = char.imageURL2 || char.imageURLFinal || char.image || char.imageUrl || char.imageURL;
        const avatar = typeof rawImage === 'object' && rawImage?.src ? rawImage.src : (typeof rawImage === 'string' ? rawImage : '');

        import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
          // 1. Dégâts ou soins (PV)
          if (updates.PV !== undefined && updates.PV !== char.PV) {
            const prevPV = Number(char.PV) || 0;
            const currPV = Number(updates.PV) || 0;

            if (prevPV > 0 && currPV <= 0) {
              logHistoryEvent({ roomId, type: 'mort', message: `**${name}** a succombé à ses blessures !`, characterId, characterName: name, characterAvatar: avatar, characterType: char.type });
            } else if (char.type === 'joueurs' && currPV > 0) {
              logHistoryEvent({ roomId, type: 'combat', message: `**${name}** a **${currPV > prevPV ? "récupéré" : "perdu"}** ${Math.abs(currPV - prevPV)} PV.`, characterId, characterName: name, characterAvatar: avatar, characterType: char.type });
            } else if (char.type !== 'joueurs' && currPV > 0) {
              const action = (currPV - prevPV) > 0 ? 'soigné' : 'attaqué';
              logHistoryEvent({ roomId, type: 'combat', message: `**${name}** a été ${action}.`, characterId, characterName: name, characterAvatar: avatar, characterType: char.type });
            }
          }

          // 2. Niveau (joueurs)
          if (updates.niveau !== undefined && updates.niveau !== char.niveau && char.type === 'joueurs') {
            const prevLevel = Number(char.niveau) || 0;
            const currLevel = Number(updates.niveau) || 0;
            if (currLevel > prevLevel) {
              logHistoryEvent({ roomId, type: 'niveau', message: `**${name}** a atteint le niveau **${currLevel}** !`, characterId, characterName: name, characterAvatar: avatar, characterType: char.type });
            }
          }
        });
      }

      await updateDoc(doc(db, `cartes/${roomId}/characters`, characterId), updates);
    } catch (error) {
      console.error("Error updating character:", error);
      throw error;
    }
  }, [roomId, characters]);

  // ==================== SÉLECTION DU PERSONNAGE ====================

  const handleSetSelectedCharacter = useCallback((character: Character | null) => {
    setSelectedCharacterId(character?.id || null);
  }, []);

  // ==================== VALEUR DU CONTEXTE ====================

  const contextValue = useMemo(() => ({
    characters,
    selectedCharacter,
    setSelectedCharacter: handleSetSelectedCharacter,
    bonuses,
    categorizedBonuses,
    competences,
    refreshCompetences,
    getModifier,
    getDisplayModifier,
    getDisplayValue,
    updateCharacter,
    isLoading,
    roomId,
  }), [
    characters,
    selectedCharacter,
    handleSetSelectedCharacter,
    bonuses,
    categorizedBonuses,
    competences,
    refreshCompetences,
    getModifier,
    getDisplayModifier,
    getDisplayValue,
    updateCharacter,
    isLoading,
    roomId,
  ]);

  return (
    <CharacterContext.Provider value={contextValue}>
      {children}
    </CharacterContext.Provider>
  );
}

// ==================== HOOK ====================

export function useCharacter() {
  const context = useContext(CharacterContext);
  if (context === undefined) {
    throw new Error('useCharacter must be used within a CharacterProvider');
  }
  return context;
}

