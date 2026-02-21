"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart3, Dice6, Target, Award, Filter, Sparkles } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Types
interface FirebaseRoll {
  id: string;
  isPrivate: boolean;
  diceCount: number;
  diceFaces: number;
  modifier: number;
  results: number[];
  total: number;
  userAvatar?: string;
  userName: string;
  type?: string;
  timestamp: number;
  notation?: string;
  output?: string;
  persoId?: string;
}

interface PlayerStats {
  userName: string;
  userAvatar?: string;
  totalRolls: number;
  averageRoll: number;
  highestRoll: number;
  lowestRoll: number;
  totalSum: number;
  criticalSuccesses: number; // Nombre de 20 naturels
  criticalFailures: number; // Nombre de 1 naturels
  favoriteNotation?: string;
  rollDistribution: { [key: number]: number };
}

interface DiceStatsProps {
  rolls: FirebaseRoll[];
  currentUserName?: string;
  isMJ?: boolean;
}

export function DiceStats({ rolls, currentUserName, isMJ = false }: DiceStatsProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedDiceType, setSelectedDiceType] = useState<string>("all");

  // Récupérer les types de dés disponibles
  const availableDiceTypes = useMemo(() => {
    const types = new Set<string>();
    rolls.forEach((roll) => {
      const diceType = `${roll.diceCount}d${roll.diceFaces}`;
      types.add(diceType);
    });
    return Array.from(types).sort();
  }, [rolls]);

  // Filtrer les lancers selon le type de dé sélectionné
  const filteredRolls = useMemo(() => {
    if (selectedDiceType === "all") return rolls;
    const [count, faces] = selectedDiceType.split("d").map(Number);
    return rolls.filter((roll) => roll.diceCount === count && roll.diceFaces === faces);
  }, [rolls, selectedDiceType]);

  // Calculer les statistiques par joueur (sans modificateurs, uniquement résultats bruts)
  const playerStats = useMemo(() => {
    const statsMap = new Map<string, PlayerStats>();

    filteredRolls.forEach((roll) => {
      if (!statsMap.has(roll.userName)) {
        statsMap.set(roll.userName, {
          userName: roll.userName,
          userAvatar: roll.userAvatar,
          totalRolls: 0,
          averageRoll: 0,
          highestRoll: -Infinity,
          lowestRoll: Infinity,
          totalSum: 0,
          criticalSuccesses: 0,
          criticalFailures: 0,
          rollDistribution: {},
        });
      }

      const stats = statsMap.get(roll.userName)!;

      // Utiliser uniquement les résultats bruts des dés (sans modificateurs)
      roll.results.forEach((result) => {
        stats.totalRolls += 1;
        stats.totalSum += result;
        stats.highestRoll = Math.max(stats.highestRoll, result);
        stats.lowestRoll = Math.min(stats.lowestRoll, result);

        // Détecter les critiques (uniquement pour d20)
        if (roll.diceFaces === 20 && roll.diceCount === 1) {
          if (result === 20) stats.criticalSuccesses += 1;
          if (result === 1) stats.criticalFailures += 1;
        }

        // Distribution des résultats
        stats.rollDistribution[result] = (stats.rollDistribution[result] || 0) + 1;
      });
    });

    // Calculer les moyennes
    statsMap.forEach((stats) => {
      stats.averageRoll = stats.totalRolls > 0 ? stats.totalSum / stats.totalRolls : 0;
    });

    return Array.from(statsMap.values()).sort((a, b) => b.totalRolls - a.totalRolls);
  }, [filteredRolls]);

  // Données pour le graphique de distribution globale (uniquement résultats bruts)
  const globalDistribution = useMemo(() => {
    const distribution: { [key: number]: number } = {};
    filteredRolls.forEach((roll) => {
      roll.results.forEach((result) => {
        distribution[result] = (distribution[result] || 0) + 1;
      });
    });

    return Object.entries(distribution)
      .map(([value, count]) => ({
        value: parseInt(value),
        count,
      }))
      .sort((a, b) => a.value - b.value);
  }, [filteredRolls]);

  // Données pour le graphique d'évolution temporelle (résultats bruts moyens par lancer)
  const timelineData = useMemo(() => {
    const selectedPlayerRolls = selectedPlayer
      ? filteredRolls.filter((r) => r.userName === selectedPlayer)
      : filteredRolls;

    return selectedPlayerRolls
      .slice()
      .reverse()
      .map((roll, index) => {
        const avgResult = roll.results.reduce((sum, r) => sum + r, 0) / roll.results.length;
        return {
          roll: index + 1,
          total: parseFloat(avgResult.toFixed(2)),
          notation: roll.notation || `${roll.diceCount}d${roll.diceFaces}`,
        };
      });
  }, [filteredRolls, selectedPlayer]);

  // Données pour le graphique de répartition par joueur
  const playerRollsData = useMemo(() => {
    return playerStats.map((stats) => ({
      name: stats.userName,
      rolls: stats.totalRolls,
      average: parseFloat(stats.averageRoll.toFixed(2)),
    }));
  }, [playerStats]);

  // Statistiques du joueur sélectionné
  const selectedPlayerStats = selectedPlayer
    ? playerStats.find((s) => s.userName === selectedPlayer)
    : null;

  // Custom JSX Tooltip pour Recharts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-white/10 p-2 rounded-lg shadow-xl text-xs backdrop-blur-md">
          <p className="text-zinc-300 font-medium mb-1">{label}</p>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-zinc-100 font-mono" style={{ color: entry.color }}>
              {entry.name || 'Total'} : {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (rolls.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-6 text-xs italic opacity-80 flex flex-col items-center justify-center gap-2">
        <BarChart3 className="w-5 h-5 text-zinc-600 mb-1" />
        Aucune statistique disponible.<br />Lancez des dés pour alimenter les graphiques !
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">

      {/* Barre de Filtres */}
      <div className="space-y-2 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <Filter className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Type :</span>
          <button
            onClick={() => setSelectedDiceType("all")}
            className={`text-[10px] px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${selectedDiceType === "all" ? 'bg-white/10 text-white font-medium border border-white/10' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}
          >
            Tous
          </button>
          {availableDiceTypes.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedDiceType(type)}
              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${selectedDiceType === type ? 'bg-white/10 text-white font-medium border border-white/10' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <Filter className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Joueur :</span>
          <button
            onClick={() => setSelectedPlayer(null)}
            className={`text-[10px] px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${selectedPlayer === null ? 'bg-white/10 text-white font-medium border border-white/10' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}
          >
            Tous
          </button>
          {playerStats.map((stats) => (
            <button
              key={stats.userName}
              onClick={() => setSelectedPlayer(stats.userName)}
              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${selectedPlayer === stats.userName ? 'bg-white/10 text-white font-medium border border-white/10' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}
            >
              {stats.userAvatar ? (
                <img src={stats.userAvatar} alt="" className="w-3 h-3 rounded-full object-cover" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-white/10 flex items-center justify-center text-[7px]">{stats.userName.substring(0, 1)}</div>
              )}
              {stats.userName}
            </button>
          ))}
        </div>
      </div>

      {/* Cartes KPIS */}
      <div className="grid grid-cols-2 gap-2">
        {selectedPlayerStats ? (
          <>
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20"><Dice6 className="w-8 h-8" /></div>
              <span className="text-lg font-bold text-zinc-100 font-mono tracking-tighter">{selectedPlayerStats.totalRolls}</span>
              <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wide">Dés Lancés</span>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20"><Target className="w-8 h-8 text-blue-500" /></div>
              <span className="text-lg font-bold text-zinc-100 font-mono tracking-tighter">{selectedPlayerStats.averageRoll.toFixed(2)}</span>
              <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wide">Moyenne</span>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20"><TrendingUp className="w-8 h-8 text-green-500" /></div>
              <span className="text-lg font-bold text-green-400 font-mono tracking-tighter">{selectedPlayerStats.highestRoll}</span>
              <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wide">Plus Haut</span>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20"><TrendingDown className="w-8 h-8 text-red-500" /></div>
              <span className="text-lg font-bold text-red-400 font-mono tracking-tighter">{selectedPlayerStats.lowestRoll}</span>
              <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wide">Plus Bas</span>
            </motion.div>

            {selectedPlayerStats.criticalSuccesses > 0 && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="col-span-2 bg-gradient-to-r from-yellow-500/10 to-amber-500/5 border border-yellow-500/20 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <Award className="w-4 h-4 text-yellow-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-yellow-500/70 uppercase tracking-widest font-bold">Critiques Parfaits</span>
                    <span className="text-xs text-zinc-300">Total de 20 naturels obtenus</span>
                  </div>
                </div>
                <span className="text-xl font-black font-mono text-yellow-500">{selectedPlayerStats.criticalSuccesses}</span>
              </motion.div>
            )}

            {selectedPlayerStats.criticalFailures > 0 && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="col-span-2 bg-gradient-to-r from-red-500/10 to-transparent border border-red-500/10 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-red-500/70 uppercase tracking-widest font-bold">Échecs Critiques</span>
                    <span className="text-xs text-zinc-300">Total de 1 naturels obtenus</span>
                  </div>
                </div>
                <span className="text-xl font-black font-mono text-red-500">{selectedPlayerStats.criticalFailures}</span>
              </motion.div>
            )}
          </>
        ) : (
          <div className="col-span-2 space-y-2">
            {playerStats.slice(0, 5).map((stats, index) => (
              <motion.div
                key={stats.userName}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => setSelectedPlayer(stats.userName)}
                className="group flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3">
                  {stats.userAvatar ? (
                    <img src={stats.userAvatar} alt="" className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full border border-white/10 bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 font-bold uppercase">{stats.userName.substring(0, 2)}</div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-zinc-200">{stats.userName}</span>
                    <span className="text-[10px] text-zinc-500">{stats.totalRolls} lancers</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-mono font-bold text-zinc-300">{stats.averageRoll.toFixed(2)}</span>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Moy.</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Graphiques Modernisés */}
      <AnimatePresence mode="popLayout">

        {/* Graph 1: Evolution */}
        <motion.div
          key="graph1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-black/20 border border-white/5 rounded-xl p-4 mt-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Évolution chronologique</h4>
          </div>
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="roll" stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} width={20} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--chart-line)"
                  strokeWidth={2}
                  dot={{ fill: "var(--chart-line)", r: 1.5, strokeWidth: 0 }}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Graph 2: Distribution */}
        <motion.div
          key="graph2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-black/20 border border-white/5 rounded-xl p-4 mt-2"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Distribution des résultats bruts</h4>
          </div>
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={globalDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="value" stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} width={20} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="count" fill="var(--chart-bar)" radius={[4, 4, 0, 0]} name="Occurrences" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Graph 3: Comparaison  (Si on est en mode "Tous les joueurs") */}
        {!selectedPlayer && playerRollsData.length > 1 && (
          <motion.div
            key="graph3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-black/20 border border-white/5 rounded-xl p-4 mt-2"
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Activité des joueurs</h4>
            </div>
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={playerRollsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={9} tickLine={false} axisLine={false} width={60} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="rolls" fill="var(--chart-bar-alt)" radius={[0, 4, 4, 0]} name="Dés Lancés" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
