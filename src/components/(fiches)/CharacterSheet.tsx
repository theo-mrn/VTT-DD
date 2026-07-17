"use client";

import { useState, useEffect } from 'react';
import { Heart, Shield, X, User, Package, Lock } from 'lucide-react';
import { db, doc, getDoc } from '@/lib/firebase';
import { useCalculatedBonuses } from '@/hooks/useCharacterData';
import { useGame } from '@/contexts/GameContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CharacterImage from '@/components/(fiches)/CharacterImage';
import InventoryManagement2 from '@/components/(inventaire)/inventaire';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { useGameContent } from '@/modules/game-content/useGameContent';
import type { SpecializationDoc } from '@/modules/game-content/types';
import { getFormulaDependencies } from '@/lib/rules-engine';

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
  imageURLFinal?: string;
  isGif?: boolean;
  PV?: number;
  PV_Max?: number;
  INIT?: number;
  type?: string;
  deVie?: string;
  privateFields?: string[];
  specializations?: string[];
  [key: string]: unknown;
}

const PRIVATE_PLACEHOLDER = '???';

interface CharacterSheetProps {
  characterId: string;
  roomId: string;
  onClose: () => void;
}

type TabType = 'character' | 'inventory';

export default function CharacterSheet({ characterId, roomId, onClose }: CharacterSheetProps) {
  const [character, setCharacter] = useState<Character | null>(null);
  const { totalBonuses: bonuses } = useCalculatedBonuses(roomId, character?.Nomperso);
  const { persoId: userPersoId, isMJ } = useGame();
  const { gameSystem } = useGameSystem(roomId);
  const { docs: specializationDocs } = useGameContent<SpecializationDoc & { id: string }>('specialization');
  const [activeTab, setActiveTab] = useState<TabType>('character');

  const isDndClassic = gameSystem.systemId === 'dnd-classic';
  const hasSkillSystem = (gameSystem.skills?.length ?? 0) > 0;
  const hasInitStat = gameSystem.stats.some((s) => s.key === 'INIT');

  const raceLabel = gameSystem.raceLabel || 'Race';
  const careerLabel = hasSkillSystem ? 'Carrière' : (gameSystem.profileLabel || 'Profil');

  const abilityStats = gameSystem.stats.filter((s) => s.category === 'ability' && s.visibleToPlayers !== false);
  const combatAttackKeys = gameSystem.combatAttackKeys ?? ['Contact', 'Distance', 'Magie'];
  const defenseKey = gameSystem.combatDefenseKey ?? 'Defense';
  const combatColors = ['text-orange-400', 'text-green-400', 'text-purple-400'];

  // Stats "vital" bornées par une autre stat (ex PV/PV_Max, ou Blessures/BlessuresMax pour un système
  // EotE) — même mécanisme générique que WidgetVitals (FicheWidgets.tsx) : jamais "PV" en dur.
  const vitalMaxKeyByKey = new Map<string, string>();
  for (const stat of gameSystem.stats) {
    if (stat.category !== 'vital' || !stat.maxFormula) continue;
    const [maxKey] = getFormulaDependencies(stat.maxFormula);
    if (maxKey) vitalMaxKeyByKey.set(stat.key, maxKey);
  }
  const maxKeysToSkip = new Set(vitalMaxKeyByKey.values());
  const vitalStatsWithMax = gameSystem.stats.filter(
    (s) => s.category === 'vital' && s.visibleToPlayers !== false && vitalMaxKeyByKey.has(s.key) && !maxKeysToSkip.has(s.key),
  );
  // La première stat vitale à borne (ex PV) sert de jauge principale mise en avant, comme "Points de
  // Vie" l'était en dur — pour EotE ce sera Blessures (ou la première déclarée par le MJ).
  const primaryVitalStat = vitalStatsWithMax[0];
  const primaryVitalMaxKey = primaryVitalStat ? vitalMaxKeyByKey.get(primaryVitalStat.key) : undefined;

  useEffect(() => {
    const loadCharacter = async () => {
      const characterDoc = await getDoc(doc(db, `cartes/${roomId}/characters`, characterId));
      if (characterDoc.exists()) {
        setCharacter({ id: characterDoc.id, ...characterDoc.data() } as Character);
      }
    };

    loadCharacter();
  }, [characterId, roomId]);

  const getModifier = (value: number): number => {
    return Math.floor((value - 10) / 2);
  };

  const getDisplayValue = (stat: string): number => {
    const raw = character?.[stat];
    const baseValue = raw === undefined || raw === null || raw === '' ? 0 : (parseInt(String(raw), 10) || 0);
    const bonusValue = bonuses ? bonuses[stat] || 0 : 0;
    return baseValue + bonusValue;
  };

  if (!character) return null;

  const canSeePrivate = isMJ || userPersoId === character.id;
  const isFieldPrivate = (key: string) => !!character.privateFields?.includes(key);
  const isFieldHidden = (key: string) => isFieldPrivate(key) && !canSeePrivate;

  const raceDisplay = (gameSystem.races ?? []).find((r) => r.id === character.Race)?.label || character.Race;
  const careerDisplay = (gameSystem.profiles ?? []).find((p) => p.id === character.Profile)?.label || character.Profile;
  const ownedSpecializations = (character.specializations ?? [])
    .map((id) => specializationDocs.find((s) => s.id === id))
    .filter((s): s is SpecializationDoc & { id: string } => !!s);

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
                        imageURL2={character.imageURL2}
                        imageURLFinal={character.imageURLFinal}
                        isGifProp={character.isGif}
                        altText={character.Nomperso}
                        characterId={character.id}
                        imageBorderRadius={(character as Record<string, unknown>).imageBorderRadius as number | undefined}
                      />
                    </div>

                    {/* Basic Info */}
                    <div className="flex-grow">
                      <div className="bg-[#252525] p-4 rounded-xl border border-[#3a3a3a]">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400 flex items-center gap-1">Niveau {isFieldPrivate('niveau') && <Lock size={10} className="text-[#c0a080]" />}</span>
                            <span className="text-white font-medium">{isFieldHidden('niveau') ? PRIVATE_PLACEHOLDER : character.niveau}</span>
                          </div>
                          {hasInitStat && (
                            <div className="flex justify-between">
                              <span className="text-gray-400 flex items-center gap-1">Initiative {isFieldPrivate('INIT') && <Lock size={10} className="text-[#c0a080]" />}</span>
                              <span className="text-white font-medium">{isFieldHidden('INIT') ? PRIVATE_PLACEHOLDER : getDisplayValue("INIT")}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-400 flex items-center gap-1">{careerLabel} {isFieldPrivate('Profile') && <Lock size={10} className="text-[#c0a080]" />}</span>
                            <span className="text-white font-medium">{isFieldHidden('Profile') ? PRIVATE_PLACEHOLDER : careerDisplay}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 flex items-center gap-1">{raceLabel} {isFieldPrivate('Race') && <Lock size={10} className="text-[#c0a080]" />}</span>
                            <span className="text-white font-medium">{isFieldHidden('Race') ? PRIVATE_PLACEHOLDER : raceDisplay}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 flex items-center gap-1">Taille {isFieldPrivate('Taille') && <Lock size={10} className="text-[#c0a080]" />}</span>
                            <span className="text-white font-medium">{isFieldHidden('Taille') ? PRIVATE_PLACEHOLDER : `${character.Taille} cm`}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 flex items-center gap-1">Poids {isFieldPrivate('Poids') && <Lock size={10} className="text-[#c0a080]" />}</span>
                            <span className="text-white font-medium">{isFieldHidden('Poids') ? PRIVATE_PLACEHOLDER : `${character.Poids} kg`}</span>
                          </div>
                          {isDndClassic && (
                            <div className="flex justify-between col-span-2">
                              <span className="text-gray-400 flex items-center gap-1">Dé de Vie {isFieldPrivate('deVie') && <Lock size={10} className="text-[#c0a080]" />}</span>
                              <span className="text-white font-medium">{isFieldHidden('deVie') ? PRIVATE_PLACEHOLDER : character.deVie}</span>
                            </div>
                          )}
                          {hasSkillSystem && ownedSpecializations.length > 0 && (
                            <div className="flex justify-between col-span-2">
                              <span className="text-gray-400">{ownedSpecializations.length > 1 ? 'Spécialisations' : 'Spécialisation'}</span>
                              <span className="text-white font-medium truncate">{ownedSpecializations.map((s) => s.name).join(', ')}</span>
                            </div>
                          )}
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
                            <span className="text-gray-400 flex items-center gap-1">{careerLabel} {isFieldPrivate('Profile') && <Lock size={10} className="text-[#c0a080]" />}</span>
                            <span className="text-white font-medium">{isFieldHidden('Profile') ? PRIVATE_PLACEHOLDER : careerDisplay}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 flex items-center gap-1">Niveau {isFieldPrivate('niveau') && <Lock size={10} className="text-[#c0a080]" />}</span>
                          <span className="text-white font-bold text-lg">{isFieldHidden('niveau') ? PRIVATE_PLACEHOLDER : character.niveau}</span>
                        </div>
                        {hasInitStat && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 flex items-center gap-1">Initiative {isFieldPrivate('INIT') && <Lock size={10} className="text-[#c0a080]" />}</span>
                            <span className="text-white font-bold text-lg">{isFieldHidden('INIT') ? PRIVATE_PLACEHOLDER : getDisplayValue("INIT")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stat vitale principale et Défense — full width */}
                <div className="grid grid-cols-2 gap-4">
                  {primaryVitalStat && (
                    <Tooltip>
                      <TooltipTrigger className="w-full">
                        <div className="flex items-center justify-center gap-4 px-6 py-4 bg-[#252525] rounded-xl border border-[#3a3a3a] hover:border-[#4a4a4a] transition-colors">
                          <Heart className="text-red-500" size={28} />
                          <div className="text-left">
                            <div className="text-xs text-gray-400 flex items-center gap-1">{primaryVitalStat.label} {isFieldPrivate(primaryVitalStat.key) && <Lock size={10} className="text-[#c0a080]" />}</div>
                            <div className="text-2xl font-bold text-white">
                              {(isFieldHidden(primaryVitalStat.key) || (primaryVitalMaxKey && isFieldHidden(primaryVitalMaxKey)))
                                ? PRIVATE_PLACEHOLDER
                                : `${getDisplayValue(primaryVitalStat.key)} / ${primaryVitalMaxKey ? getDisplayValue(primaryVitalMaxKey) : '-'}`}
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {(isFieldHidden(primaryVitalStat.key) || (primaryVitalMaxKey && isFieldHidden(primaryVitalMaxKey))) ? <p>Information privée.</p> : (
                          <>
                            <p>Base: {String(character[primaryVitalStat.key] ?? 0)} / {primaryVitalMaxKey ? String(character[primaryVitalMaxKey] ?? 0) : '-'}</p>
                            <p>Bonus: {bonuses?.[primaryVitalStat.key] || 0} / {primaryVitalMaxKey ? (bonuses?.[primaryVitalMaxKey] || 0) : 0}</p>
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger className="w-full">
                      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-[#252525] rounded-xl border border-[#3a3a3a] hover:border-[#4a4a4a] transition-colors">
                        <Shield className="text-blue-500" size={28} />
                        <div className="text-left">
                          <div className="text-xs text-gray-400 flex items-center gap-1">Défense {isFieldPrivate(defenseKey) && <Lock size={10} className="text-[#c0a080]" />}</div>
                          <div className="text-2xl font-bold text-white">{isFieldHidden(defenseKey) ? PRIVATE_PLACEHOLDER : getDisplayValue(defenseKey)}</div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isFieldHidden(defenseKey) ? <p>Information privée.</p> : (
                        <>
                          <p>Base: {String(character[defenseKey] ?? '')}</p>
                          <p>Bonus: {bonuses ? bonuses[defenseKey] || 0 : 0}</p>
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Ability Scores — dérivé du système de jeu actif */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Caractéristiques</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {abilityStats.map((statDef) => {
                      const base = Number(character[statDef.key] ?? 0);
                      const hasModifier = !!statDef.rollUsesModifier;
                      const value = hasModifier ? getModifier(base) : base;
                      const hidden = isFieldHidden(statDef.key);
                      return (
                        <Tooltip key={statDef.key}>
                          <TooltipTrigger className="w-full">
                            <div className="bg-[#252525] p-3 rounded-xl border border-[#3a3a3a] text-center hover:border-[#4a4a4a] transition-colors">
                              <div className="text-xs font-semibold text-[#c0a080] mb-1 flex items-center justify-center gap-1">
                                {statDef.shortLabel || statDef.key}
                                {isFieldPrivate(statDef.key) && <Lock size={9} />}
                              </div>
                              {hidden ? (
                                <div className="text-2xl font-bold text-gray-400">{PRIVATE_PLACEHOLDER}</div>
                              ) : hasModifier ? (
                                <>
                                  <div className={`text-2xl font-bold ${value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {value >= 0 ? '+' : ''}{value}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">{base}</div>
                                </>
                              ) : (
                                <div className="text-2xl font-bold text-white">{base}</div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {hidden ? <p>Information privée.</p> : (
                              <>
                                <p className="font-medium">{statDef.label}</p>
                                <p>Base: {base}</p>
                                <p>Bonus: {bonuses ? bonuses[statDef.key] || 0 : 0}</p>
                              </>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Combat Stats — clés dérivées du système de jeu actif (jusqu'à 3, mêmes couleurs fixes) */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Combat</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {combatAttackKeys.slice(0, 3).map((key, i) => {
                      const hidden = isFieldHidden(key);
                      const label = gameSystem.stats.find((s) => s.key === key)?.label ?? key;
                      const value = getDisplayValue(key);
                      const color = combatColors[i] ?? 'text-gray-300';
                      return (
                        <Tooltip key={key}>
                          <TooltipTrigger className="w-full">
                            <div className="bg-[#252525] p-4 rounded-xl border border-[#3a3a3a] text-center hover:border-[#4a4a4a] transition-colors">
                              <h4 className="text-sm font-medium text-gray-300 mb-1 flex items-center justify-center gap-1">
                                {label}
                                {isFieldPrivate(key) && <Lock size={9} />}
                              </h4>
                              <span className={`text-2xl font-bold ${hidden ? 'text-gray-400' : color}`}>{hidden ? PRIVATE_PLACEHOLDER : value}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {hidden ? <p>Information privée.</p> : (
                              <>
                                <p>Base: {String(character[key] ?? '')}</p>
                                <p>Bonus: {bonuses ? bonuses[key] || 0 : 0}</p>
                              </>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Inventory Tab */
              <div className="p-4">
                <InventoryManagement2
                  playerName={character.Nomperso}
                  roomId={roomId}
                  canEdit={character.id === userPersoId || isMJ}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
