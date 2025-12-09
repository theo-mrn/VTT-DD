"use client";

import { useState, useEffect } from 'react';
import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from '@/lib/firebase';
import { Trophy, Shield, Wand2, Target, Users, Crown, Star, Sword, Heart, Zap, TrendingUp, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Character {
  id: string;
  Nomperso: string;
  niveau?: number;
  Profile?: string;
  Race?: string;
  imageURL?: string;
  imageURLFinal?: string;
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
  // Stats avec bonus appliqués
  FOR_Final?: number;
  DEX_Final?: number;
  CON_Final?: number;
  INT_Final?: number;
  SAG_Final?: number;
  CHA_Final?: number;
  PV_Final?: number;
  PV_Max_Final?: number;
  Defense_Final?: number;
  Contact_Final?: number;
  Magie_Final?: number;
  Distance_Final?: number;
  INIT_Final?: number;
}

interface StatOption {
  key: keyof Character;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export function Statistiques() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStat, setSelectedStat] = useState<keyof Character>('FOR');

  // Fonction pour calculer les stats finales avec les bonus actifs
  const calculateFinalStats = async (character: Character, roomId: string) => {
    const bonusCollection = collection(db, `Bonus/${roomId}/${character.Nomperso}`);
    const bonusSnapshot = await getDocs(bonusCollection);

    // Initialiser les totaux avec les stats de base
    const totals = {
      FOR: character.FOR || 0,
      DEX: character.DEX || 0,
      CON: character.CON || 0,
      INT: character.INT || 0,
      SAG: character.SAG || 0,
      CHA: character.CHA || 0,
      PV: character.PV || 0,
      PV_Max: character.PV_Max || 0,
      Defense: character.Defense || 0,
      Contact: character.Contact || 0,
      Magie: character.Magie || 0,
      Distance: character.Distance || 0,
      INIT: character.INIT || 0,
    };

    // Parcourir tous les bonus et additionner ceux qui sont actifs
    bonusSnapshot.docs.forEach((bonusDoc) => {
      const bonusData = bonusDoc.data();

      // Vérifier si le bonus est actif (par défaut true si non spécifié)
      const isActive = bonusData.active !== false;

      if (isActive) {
        // Additionner chaque stat si elle existe dans le bonus
        Object.keys(totals).forEach((stat) => {
          if (bonusData[stat] && typeof bonusData[stat] === 'number') {
            totals[stat as keyof typeof totals] += bonusData[stat];
          }
        });
      }
    });

    return {
      FOR_Final: totals.FOR,
      DEX_Final: totals.DEX,
      CON_Final: totals.CON,
      INT_Final: totals.INT,
      SAG_Final: totals.SAG,
      CHA_Final: totals.CHA,
      PV_Final: totals.PV,
      PV_Max_Final: totals.PV_Max,
      Defense_Final: totals.Defense,
      Contact_Final: totals.Contact,
      Magie_Final: totals.Magie,
      Distance_Final: totals.Distance,
      INIT_Final: totals.INIT,
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("Veuillez vous connecter pour voir les statistiques");
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
          setError("Données utilisateur non trouvées");
          setLoading(false);
          return;
        }

        const userData = userDoc.data();
        const roomIdValue = String(userData?.room_id);

        const charactersCollection = collection(db, `cartes/${roomIdValue}/characters`);
        const playerCharactersQuery = query(charactersCollection, where("type", "==", "joueurs"));
        const charactersSnapshot = await getDocs(playerCharactersQuery);

        const charactersData = await Promise.all(
          charactersSnapshot.docs.map(async (charDoc) => {
            const charData = { id: charDoc.id, ...charDoc.data() } as Character;

            // Calculer les stats finales avec bonus
            const finalStats = await calculateFinalStats(charData, roomIdValue);

            return {
              ...charData,
              ...finalStats
            };
          })
        );

        setCharacters(charactersData);
      } catch (error) {
        console.error("Erreur lors de la récupération des données:", error);
        setError("Erreur lors du chargement des données: " + (error as Error).message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const statOptions: StatOption[] = [
    { key: 'FOR', label: 'Force', icon: <Crown size={14} />, color: '#c0a080' },
    { key: 'DEX', label: 'Dextérité', icon: <Target size={14} />, color: '#c0a080' },
    { key: 'CON', label: 'Constitution', icon: <Shield size={14} />, color: '#c0a080' },
    { key: 'INT', label: 'Intelligence', icon: <Star size={14} />, color: '#c0a080' },
    { key: 'SAG', label: 'Sagesse', icon: <Trophy size={14} />, color: '#c0a080' },
    { key: 'CHA', label: 'Charisme', icon: <Users size={14} />, color: '#c0a080' },
    { key: 'Defense', label: 'Défense', icon: <Shield size={14} />, color: '#c0a080' },
    { key: 'INIT', label: 'Initiative', icon: <Zap size={14} />, color: '#c0a080' },
    { key: 'Contact', label: 'Contact', icon: <Sword size={14} />, color: '#c0a080' },
    { key: 'Distance', label: 'Distance', icon: <Target size={14} />, color: '#c0a080' },
    { key: 'Magie', label: 'Magie', icon: <Wand2 size={14} />, color: '#c0a080' },
    { key: 'PV_Max', label: 'PV Max', icon: <Heart size={14} />, color: '#c0a080' }
  ];

  const getCurrentStat = () => statOptions.find(stat => stat.key === selectedStat) || statOptions[0];

  // Fonction pour obtenir la valeur finale (avec bonus) d'une stat
  const getFinalStatValue = (char: Character, stat: keyof Character): number => {
    // Mapper la stat vers sa version _Final
    const finalStatKey = `${stat}_Final` as keyof Character;

    // Si la stat finale existe, l'utiliser, sinon utiliser la stat de base
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