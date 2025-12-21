"use client";

import { useState, useEffect } from 'react';
import { Heart, Shield, X, User, Package } from 'lucide-react';
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
  imageURL2?: string;
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

type TabType = 'character' | 'inventory';

export default function CharacterSheet({ characterId, roomId, onClose }: CharacterSheetProps) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [bonuses, setBonuses] = useState<Bonuses | null>(null);
  const [userPersoId, setUserPersoId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('character');

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
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-gradient-to-b from-[#2a2a2a] to-[#1f1f1f] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden relative border border-[#3a3a3a]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3a3a] bg-[#252525]">
            <h2 className="text-xl font-bold text-[#e0c8c8] truncate">{character.Nomperso}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded-lg transition-colors"
              aria-label="Fermer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#3a3a3a]">
            <button
              onClick={() => setActiveTab('character')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 font-medium transition-colors ${activeTab === 'character'
                ? 'text-[#e0c8c8] bg-[#2a2a2a] border-b-2 border-[#c0a080]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2a]/50'
                }`}
            >
              <User size={18} />
              <span>Personnage</span>
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 font-medium transition-colors ${activeTab === 'inventory'
                ? 'text-[#e0c8c8] bg-[#2a2a2a] border-b-2 border-[#c0a080]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2a]/50'
                }`}
            >
              <Package size={18} />
              <span>Inventaire</span>
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(85vh-130px)]">
            {activeTab === 'character' ? (
              <div className="p-6 space-y-6">
                {/* Character Info Section - Full for players, simplified for NPCs */}
                {character.type === 'joueurs' ? (
                  /* Full info block for player characters */
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Character Image - Medium size */}
                    <div className="flex-shrink-0 mx-auto sm:mx-0 w-36 h-36">
                      <CharacterImage
                        imageUrl={character.imageURL}
                        altText={character.Nomperso}
                        characterId={character.id}
                      />
                    </div>

                    {/* Basic Info */}
                    <div className="flex-grow">
                      <div className="bg-[#252525] p-4 rounded-xl border border-[#3a3a3a]">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Niveau</span>
                            <span className="text-white font-medium">{character.niveau}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Initiative</span>
                            <span className="text-white font-medium">{getDisplayValue("INIT")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Profil</span>
                            <span className="text-white font-medium">{character.Profile}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Race</span>
                            <span className="text-white font-medium">{character.Race}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Taille</span>
                            <span className="text-white font-medium">{character.Taille} cm</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Poids</span>
                            <span className="text-white font-medium">{character.Poids} kg</span>
                          </div>
                          <div className="flex justify-between col-span-2">
                            <span className="text-gray-400">Dé de Vie</span>
                            <span className="text-white font-medium">{character.deVie}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Simplified info block for NPCs - image, profile, level, initiative */
                  <div className="flex items-center gap-4">
                    {/* NPC Image - Only show if image exists */}
                    {(character.imageURL2 || character.imageURL) && (
                      <div className="flex-shrink-0 w-36 h-36 rounded-lg overflow-hidden border border-[#3a3a3a]">
                        <img
                          src={character.imageURL2 || character.imageURL}
                          alt={character.Nomperso}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* NPC Basic Info */}
                    <div className="flex-grow bg-[#252525] p-3 rounded-xl border border-[#3a3a3a]">
                      <div className="flex flex-wrap justify-between gap-4 text-sm">
                        {character.Profile && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">Profil</span>
                            <span className="text-white font-medium">{character.Profile}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Niveau</span>
                          <span className="text-white font-bold text-lg">{character.niveau}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Initiative</span>
                          <span className="text-white font-bold text-lg">{getDisplayValue("INIT")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* HP and Defense - Full width */}
                <div className="grid grid-cols-2 gap-4">
                  <Tooltip>
                    <TooltipTrigger className="w-full">
                      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-[#252525] rounded-xl border border-[#3a3a3a] hover:border-[#4a4a4a] transition-colors">
                        <Heart className="text-red-500" size={28} />
                        <div className="text-left">
                          <div className="text-xs text-gray-400">Points de Vie</div>
                          <div className="text-2xl font-bold text-white">
                            {getDisplayValue("PV")} / {getDisplayValue("PV_Max")}
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Base: {character.PV} / {character.PV_Max}</p>
                      <p>Bonus: {bonuses ? bonuses.PV || 0 : 0} / {bonuses ? bonuses.PV_Max || 0 : 0}</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger className="w-full">
                      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-[#252525] rounded-xl border border-[#3a3a3a] hover:border-[#4a4a4a] transition-colors">
                        <Shield className="text-blue-500" size={28} />
                        <div className="text-left">
                          <div className="text-xs text-gray-400">Défense</div>
                          <div className="text-2xl font-bold text-white">{getDisplayValue("Defense")}</div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Base: {character.Defense}</p>
                      <p>Bonus: {bonuses ? bonuses.Defense || 0 : 0}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Ability Scores */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Caractéristiques</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {[
                      { name: 'FOR', fullName: 'Force', value: getModifier(character.FOR || 0), base: character.FOR },
                      { name: 'DEX', fullName: 'Dextérité', value: getModifier(character.DEX || 0), base: character.DEX },
                      { name: 'CON', fullName: 'Constitution', value: getModifier(character.CON || 0), base: character.CON },
                      { name: 'INT', fullName: 'Intelligence', value: getModifier(character.INT || 0), base: character.INT },
                      { name: 'SAG', fullName: 'Sagesse', value: getModifier(character.SAG || 0), base: character.SAG },
                      { name: 'CHA', fullName: 'Charisme', value: getModifier(character.CHA || 0), base: character.CHA },
                    ].map((ability) => (
                      <Tooltip key={ability.name}>
                        <TooltipTrigger className="w-full">
                          <div className="bg-[#252525] p-3 rounded-xl border border-[#3a3a3a] text-center hover:border-[#4a4a4a] transition-colors">
                            <div className="text-xs font-semibold text-[#c0a080] mb-1">{ability.name}</div>
                            <div className={`text-2xl font-bold ${ability.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {ability.value >= 0 ? '+' : ''}{ability.value}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{ability.base}</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{ability.fullName}</p>
                          <p>Base: {ability.base}</p>
                          <p>Bonus: {bonuses ? bonuses[ability.name] || 0 : 0}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                {/* Combat Stats */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Combat</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: 'Contact', value: getDisplayValue("Contact"), color: 'text-orange-400' },
                      { name: 'Distance', value: getDisplayValue("Distance"), color: 'text-green-400' },
                      { name: 'Magie', value: getDisplayValue("Magie"), color: 'text-purple-400' }
                    ].map((stat) => (
                      <Tooltip key={stat.name}>
                        <TooltipTrigger className="w-full">
                          <div className="bg-[#252525] p-4 rounded-xl border border-[#3a3a3a] text-center hover:border-[#4a4a4a] transition-colors">
                            <h4 className="text-sm font-medium text-gray-300 mb-1">{stat.name}</h4>
                            <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Base: {character[stat.name as keyof Character]}</p>
                          <p>Bonus: {bonuses ? bonuses[stat.name] || 0 : 0}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Inventory Tab */
              <div className="p-4">
                <InventoryManagement2
                  playerName={character.Nomperso}
                  roomId={roomId}
                  canEdit={character.id === userPersoId || userRole === "MJ"}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}