"use client";

import { useState, useEffect } from 'react';
import { Heart, Shield, X } from 'lucide-react';
import { db, doc, getDoc, onSnapshot, collection } from '@/lib/firebase';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CharacterImage from '@/components/CharacterImage';

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

export default function CharacterSheet({ characterId, roomId, onClose }: CharacterSheetProps) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [bonuses, setBonuses] = useState<Bonuses | null>(null);

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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#242424] rounded-lg shadow-2xl p-6 space-y-6 max-w-4xl w-full relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X size={24} />
        </button>

        <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-6">
          <div className="flex-shrink-0">
            <CharacterImage 
              imageUrl={character.imageURL} 
              altText={character.Nomperso} 
              characterId={character.id}
            />
          </div>

          <div className="flex-grow space-y-4">
            <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a]">
              <h2 className="text-2xl font-bold text-[#c0a0a0] mb-2">{character.Nomperso}</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Niveau: <span className="text-[#a0a0a0]">{character.niveau}</span></div>
                <div>Race: <span className="text-[#a0a0a0]">{character.Race}</span></div>
                <div>Profil: <span className="text-[#a0a0a0]">{character.Profile}</span></div>
                <div>Dé de vie: <span className="text-[#a0a0a0]">{character.deVie}</span></div>
              </div>
            </div>

            <TooltipProvider>
              <div className="grid grid-cols-3 gap-2 text-center">
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
                      <div className="bg-[#2a2a2a] p-2 rounded-lg border border-[#3a3a3a]">
                        <div className="text-[#c0a0a0] font-semibold">{ability.name}</div>
                        <div className={`text-2xl font-bold ${ability.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {ability.value >= 0 ? '+' : ''}{ability.value}
                        </div>
                        <div className="text-sm text-[#a0a0a0]">{character[ability.name as keyof Character]}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Valeur de base: {character[ability.name as keyof Character]}</p>
                      <p>Bonus total: {bonuses ? bonuses[ability.name] || 0 : 0}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>

            <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Heart className="text-red-500" size={24} />
                <span className="text-2xl font-bold text-[#d4d4d4]">
                  {getDisplayValue("PV")} / {getDisplayValue("PV_Max")}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="text-blue-500" size={24} />
                <span className="text-2xl font-bold text-[#d4d4d4]">{getDisplayValue("Defense")}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'Contact', value: getDisplayValue("Contact") },
                { name: 'Distance', value: getDisplayValue("Distance") },
                { name: 'Magie', value: getDisplayValue("Magie") }
              ].map((stat) => (
                <div key={stat.name} className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] text-center">
                  <h3 className="text-lg font-semibold text-[#c0a0a0] mb-1">{stat.name}</h3>
                  <span className="text-2xl font-bold text-[#d4d4d4]">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 