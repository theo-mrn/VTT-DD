"use client";

import { useState, useEffect } from 'react';
import {
  db,
  collection,
  getDocs,
  query,
  where
} from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { Trophy, Shield, Wand2, Target, Users, Crown, Star, Sword, Heart, Zap, TrendingUp, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { resolveCharacterStats } from '@/lib/rules-engine';

interface Character {
  id: string;
  Nomperso: string;
  niveau?: number;
  Profile?: string;
  Race?: string;
  imageURL?: string;
  imageURLFinal?: string;
  type?: string;
  [key: string]: unknown;
}

interface StatOption {
  key: string;
  label: string;
  icon: React.ReactNode;
}

// Icônes par clé connue (dnd-classic) — une stat custom sans icône dédiée retombe sur TrendingUp.
const STAT_ICONS: Record<string, React.ReactNode> = {
  FOR: <Crown size={14} />,
  DEX: <Target size={14} />,
  CON: <Shield size={14} />,
  INT: <Star size={14} />,
  SAG: <Trophy size={14} />,
  CHA: <Users size={14} />,
  Defense: <Shield size={14} />,
  INIT: <Zap size={14} />,
  Contact: <Sword size={14} />,
  Distance: <Target size={14} />,
  Magie: <Wand2 size={14} />,
  PV_Max: <Heart size={14} />,
};

export function Statistiques() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useGame();
  const roomIdValue = user?.roomId;
  const { gameSystem, tableCustomStats } = useGameSystem(roomIdValue ?? null);
  const [selectedStat, setSelectedStat] = useState<string>('FOR');

  // Calcule les stats finales (modificateur/valeur + bonus) via le moteur de règles partagé,
  // remplace le calcul dupliqué de bonus + formules qui était fait ici en dur.
  const calculateFinalStats = async (character: Character, roomId: string) => {
    const bonusCollection = collection(db, `Bonus/${roomId}/${character.Nomperso}`);
    const bonusSnapshot = await getDocs(bonusCollection);

    const bonuses: Record<string, number> = {};
    bonusSnapshot.docs.forEach((bonusDoc) => {
      const bonusData = bonusDoc.data();
      const isActive = bonusData.active !== false;
      if (!isActive) return;
      for (const [key, value] of Object.entries(bonusData)) {
        if (typeof value === 'number') bonuses[key] = (bonuses[key] ?? 0) + value;
      }
    });

    const resolved = resolveCharacterStats(gameSystem, tableCustomStats, character, bonuses);
    const finalStats: Record<string, number> = {};
    for (const def of [...gameSystem.stats, ...tableCustomStats]) {
      if (def.category === 'meta') continue;
      const useModifier = def.category === 'ability' && def.key in resolved.modifiers;
      const value = useModifier ? resolved.modifiers[def.key] : resolved.values[def.key];
      if (typeof value === 'number') finalStats[`${def.key}_Final`] = value;
    }
    return finalStats;
  };

  useEffect(() => {
    if (!roomIdValue) {
      setLoading(false);
      return;
    }

    const fetchCharacters = async () => {
      try {
        const charactersCollection = collection(db, `cartes/${roomIdValue}/characters`);
        const playerCharactersQuery = query(charactersCollection, where("type", "==", "joueurs"));
        const charactersSnapshot = await getDocs(playerCharactersQuery);

        const charactersData = await Promise.all(
          charactersSnapshot.docs.map(async (charDoc) => {
            const charData = { id: charDoc.id, ...charDoc.data() } as Character;
            const finalStats = await calculateFinalStats(charData, roomIdValue);
            return { ...charData, ...finalStats };
          })
        );

        setCharacters(charactersData);
      } catch (error) {
        console.error("Erreur lors de la récupération des données:", error);
        setError("Erreur lors du chargement des données: " + (error as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchCharacters();
  }, [roomIdValue]);

  // Dérivé du système de jeu actif — fonctionne pour dnd-classic ET tout système custom.
  const statOptions: StatOption[] = [...gameSystem.stats, ...tableCustomStats]
    .filter((s) => s.category !== 'meta')
    .map((s) => ({ key: s.key, label: s.label, icon: STAT_ICONS[s.key] ?? <TrendingUp size={14} /> }));

  const getCurrentStat = () => statOptions.find(stat => stat.key === selectedStat) || statOptions[0];

  // Fonction pour obtenir la valeur finale (avec bonus) d'une stat
  const getFinalStatValue = (char: Character, stat: string): number => {
    const finalStatKey = `${stat}_Final`;
    if (finalStatKey in char && typeof char[finalStatKey] === 'number') {
      return char[finalStatKey] as number;
    }
    return (char[stat] as number) || 0;
  };

  const getTopCharacters = (limit: number = 5) => {
    return [...characters]
      .sort((a, b) => {
        const aValue = getFinalStatValue(a, selectedStat);
        const bValue = getFinalStatValue(b, selectedStat);
        return bValue - aValue;
      })
      .slice(0, limit);
  };

  const getMaxValue = () => {
    return Math.max(...characters.map(char => getFinalStatValue(char, selectedStat)));
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)] p-6 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <TrendingUp className="h-10 w-10 mx-auto mb-3 text-[var(--accent-brown)] animate-pulse" />
          <p className="text-sm text-[var(--text-secondary)]">Chargement des statistiques...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)] p-6 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[var(--bg-card)] text-[var(--text-primary)] p-6 rounded-lg border border-[var(--border-color)] max-w-md"
        >
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
        </motion.div>
      </div>
    );
  }

  const currentStat = getCurrentStat();
  const topCharacters = getTopCharacters(5);
  const maxValue = getMaxValue();

  // Médailles pour le podium
  const getMedalIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-7 w-7 text-[var(--accent-brown)]" />;
      case 1:
        return <Award className="h-7 w-7 text-[var(--text-secondary)]" />;
      case 2:
        return <Award className="h-7 w-7 text-[var(--text-secondary)]" style={{ opacity: 0.7 }} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)] p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto space-y-2 px-2"
      >


        {/* Sélecteur de statistique - Grid moderne */}
        <Card className="card border-[var(--border-color)]">
          <CardContent className="p-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {statOptions.map((stat) => (
                <motion.button
                  key={stat.key}
                  onClick={() => setSelectedStat(stat.key)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`p-2 rounded-md text-xs font-medium transition-all duration-200 flex flex-col items-center gap-1 ${selectedStat === stat.key
                    ? 'bg-[var(--accent-brown)] text-white shadow-sm'
                    : 'bg-[var(--bg-darker)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-brown)]/50 hover:text-[var(--text-primary)]'
                    }`}
                >
                  <div className={selectedStat === stat.key ? 'text-white' : 'text-[var(--accent-brown)]'}>
                    {stat.icon}
                  </div>
                  <span className="text-[10px] truncate w-full text-center leading-tight">
                    {stat.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Classement - Full Width */}
        <Card className="card border-[var(--border-color)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[var(--text-primary)] text-lg font-semibold">
              <div className="text-[var(--accent-brown)]">
                {currentStat.icon}
              </div>
              Classement - {currentStat.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedStat}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {topCharacters.length > 0 ? (
                  topCharacters.map((char, index) => {
                    const value = getFinalStatValue(char, selectedStat);
                    const baseValue = (char[selectedStat] as number) || 0;
                    const hasBonus = value !== baseValue;
                    const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

                    return (
                      <motion.div
                        key={char.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="relative bg-[var(--bg-darker)] rounded-lg p-2 border border-[var(--border-color)] overflow-hidden hover:border-[var(--accent-brown)]/40 transition-all"
                      >
                        {/* Barre de progression subtile */}
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.6, delay: index * 0.05 }}
                          className="absolute inset-0 opacity-[0.03]"
                          style={{ background: 'var(--accent-brown)' }}
                        />

                        <div className="relative flex items-center gap-3">
                          {/* Position */}
                          <div className="flex items-center justify-center w-8 h-8 flex-shrink-0">
                            {index < 3 ? (
                              <div className="transform scale-75">
                                {getMedalIcon(index)}
                              </div>
                            ) : (
                              <span className="text-sm font-semibold text-[var(--text-secondary)]">
                                #{index + 1}
                              </span>
                            )}
                          </div>

                          {/* Avatar */}
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--bg-card)] flex-shrink-0 border border-[var(--border-color)]">
                            <img
                              src={char.imageURLFinal || char.imageURL || "/api/placeholder/48/48"}
                              alt={char.Nomperso}
                              className="w-full h-full object-contain"
                            />
                          </div>

                          {/* Infos personnage */}
                          <div className="flex-grow min-w-0">
                            <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {char.Nomperso}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] truncate">
                              {char.Race && char.Profile ? `${char.Race} • ${char.Profile}` : char.Race || char.Profile} • Niv. {char.niveau || 1}
                            </div>
                          </div>

                          {/* Valeur */}
                          <div className="flex flex-col items-end flex-shrink-0 pr-2">
                            <div className="text-lg font-bold text-[var(--accent-brown)]">
                              {value}
                            </div>
                            {hasBonus && (
                              <div className="text-[10px] text-[var(--accent-blue)] font-medium">
                                +{value - baseValue}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="text-center text-[var(--text-secondary)] py-8">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Aucun personnage trouvé</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}