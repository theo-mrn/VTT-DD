"use client";

import { useState, useEffect } from 'react';
import { Heart, Shield, X } from 'lucide-react';
import { auth, db, doc, getDoc, onSnapshot, collection } from '@/lib/firebase';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CharacterImage from '@/components/(fiches)/CharacterImage';
import InventoryManagement2 from '@/components/(inventaire)/inventaire2';

interface Character {
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
}

interface CharacterSheetProps {
  characterId: string;
  roomId: string;
  onClose: () => void;
}

interface Bonuses {
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

interface UserData {
  persoId?: string;
  perso?: string;
}

export default function CharacterSheet({ characterId, roomId, onClose }: CharacterSheetProps) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [bonuses, setBonuses] = useState<Bonuses | null>(null);
  const [userPersoId, setUserPersoId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserData;
            setUserPersoId(userData?.persoId || null);
            setUserRole(userData?.perso || null);
          }
        } catch (error) {
          console.error("Erreur lors de la récupération des données utilisateur:", error);
        }
      }
    };

    loadUserData();
  }, []);

  useEffect(() => {
    const loadCharacter = async () => {
      const characterDoc = await getDoc(doc(db, `cartes/${roomId}/characters`, characterId));
      if (characterDoc.exists()) {
        setCharacter({ id: characterDoc.id, ...characterDoc.data() as Omit<Character, 'id'> });
      }
    };

    loadCharacter();

    // Écouter les bonus
    if (character?.Nomperso) {
      const bonusesRef = collection(db, `Bonus/${roomId}/${character.Nomperso}`);
      const unsubscribe = onSnapshot(bonusesRef, (snapshot) => {
        const totalBonuses: Bonuses = {
          CHA: 0, CON: 0, Contact: 0, DEX: 0, Defense: 0, Distance: 0,
          FOR: 0, INIT: 0, INT: 0, Magie: 0, PV: 0, SAG: 0, PV_Max: 0,
        };

        snapshot.forEach((doc) => {
          const bonusData = doc.data();
          if (bonusData.active) {
            Object.keys(totalBonuses).forEach((stat) => {
              if (bonusData[stat] !== undefined) {
                totalBonuses[stat] += parseInt(bonusData[stat] || 0);
              }
            });
          }
        });

        setBonuses(totalBonuses);
      });

      return () => unsubscribe();
    }
  }, [characterId, roomId, character?.Nomperso]);

  const getModifier = (value: number): number => {
    return Math.floor((value - 10) / 2);
  };

  const getDisplayValue = (stat: keyof Character): number => {
    const baseValue = character ? parseInt(String(character[stat]) || "0") : 0;
    const bonusValue = bonuses ? bonuses[stat] || 0 : 0;
    return baseValue + bonusValue;
  };

  if (!character) return null;

  return (
    <TooltipProvider>
      <div
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-[#242424] rounded-lg shadow-2xl p-2 sm:p-3 space-y-2 sm:space-y-3 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="sticky top-0 right-0 float-right bg-[#2a2a2a] rounded-full p-1.5 text-gray-400 hover:text-white hover:bg-[#3a3a3a] transition-colors z-10"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            {character.type === 'joueurs' && (
              <div className="flex-shrink-0 mx-auto sm:mx-0">
                <CharacterImage
                  imageUrl={character.imageURL}
                  altText={character.Nomperso}
                  characterId={character.id}
                />
              </div>
            )}

            <div className="flex-grow space-y-2">
              <div className="bg-[#2a2a2a] p-2 rounded-lg border border-[#3a3a3a]">
                <h2 className="text-lg md:text-xl font-bold text-[#c0a0a0] mb-1 text-center sm:text-left">{character.Nomperso}</h2>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-1 text-xs">
                  <div>Niveau: <span className="text-[#a0a0a0]">{character.niveau}</span></div>
                  <div>Initiative: <span className="text-[#a0a0a0]">{getDisplayValue("INIT")}</span></div>
                  <div>Profil: <span className="text-[#a0a0a0]">{character.Profile}</span></div>
                  <div>Taille: <span className="text-[#a0a0a0]">{character.Taille} cm</span></div>
                  <div>Race: <span className="text-[#a0a0a0]">{character.Race}</span></div>
                  <div>Poids: <span className="text-[#a0a0a0]">{character.Poids} Kg</span></div>
                  <div className="xs:col-span-2">Dé de Vie: <span className="text-[#a0a0a0]">{character.deVie}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Colonne Gauche: Caractéristiques */}
            <div className="grid grid-cols-3 gap-1.5 text-center content-start">
              {[
                { name: 'FOR', value: getModifier(character.FOR || 0) },
                { name: 'DEX', value: getModifier(character.DEX || 0) },
                { name: 'CON', value: getModifier(character.CON || 0) },
                { name: 'INT', value: getModifier(character.INT || 0) },
                { name: 'SAG', value: getModifier(character.SAG || 0) },
                { name: 'CHA', value: getModifier(character.CHA || 0) },
              ].map((ability) => (
                <Tooltip key={ability.name}>
                  <TooltipTrigger>
                    <div className="bg-[#2a2a2a] p-1.5 rounded-lg border border-[#3a3a3a] h-full flex flex-col justify-center">
                      <div className="text-[#c0a0a0] font-semibold text-xs">{ability.name}</div>
                      <div className={`text-lg font-bold leading-tight ${ability.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {ability.value >= 0 ? '+' : ''}{ability.value}
                      </div>
                      <div className="text-[10px] text-[#a0a0a0]">{character[ability.name as keyof Character]}</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Valeur de base: {character[ability.name as keyof Character]}</p>
                    <p>Bonus total: {bonuses ? bonuses[ability.name] || 0 : 0}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Colonne Droite: Combat & Vitalité */}
            <div className="space-y-2">
              <div className="bg-[#2a2a2a] p-1.5 sm:p-2 rounded-lg border border-[#3a3a3a] flex flex-col xs:flex-row justify-between items-center gap-2">
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center space-x-1.5">
                      <Heart className="text-red-500" size={16} />
                      <span className="text-base sm:text-lg font-bold text-[#d4d4d4]">
                        {getDisplayValue("PV")} / {getDisplayValue("PV_Max")}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Valeur de base: {character.PV} / {character.PV_Max}</p>
                    <p>Bonus total: {bonuses ? bonuses.PV || 0 : 0} / {bonuses ? bonuses.PV_Max || 0 : 0}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center space-x-1.5">
                      <Shield className="text-blue-500" size={16} />
                      <span className="text-base sm:text-lg font-bold text-[#d4d4d4]">{getDisplayValue("Defense")}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Valeur de base: {character.Defense}</p>
                    <p>Bonus total: {bonuses ? bonuses.Defense || 0 : 0}</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'Contact', value: getDisplayValue("Contact") },
                  { name: 'Distance', value: getDisplayValue("Distance") },
                  { name: 'Magie', value: getDisplayValue("Magie") }
                ].map((stat) => (
                  <Tooltip key={stat.name}>
                    <TooltipTrigger>
                      <div className="bg-[#2a2a2a] p-1.5 sm:p-2 rounded-lg border border-[#3a3a3a] text-center">
                        <h3 className="text-xs sm:text-sm font-semibold text-[#c0a0a0] mb-0.5">{stat.name}</h3>
                        <span className="text-base sm:text-lg font-bold text-[#d4d4d4]">{stat.value}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Valeur de base: {character[stat.name as keyof Character]}</p>
                      <p>Bonus total: {bonuses ? bonuses[stat.name] || 0 : 0}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          </div>

          {/* Inventaire */}
          <InventoryManagement2
            playerName={character.Nomperso}
            roomId={roomId}
            canEdit={character.id === userPersoId || userRole === "MJ"}
          />
        </div>
      </div>
    </TooltipProvider>
  );
} 