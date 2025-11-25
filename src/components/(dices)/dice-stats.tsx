"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart3, User, Dice6, Target, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
        // Calculer la moyenne des résultats bruts pour ce lancer
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

  // Couleurs pour les graphiques
  const COLORS = ["#c0a080", "#5c6bc0", "#66bb6a", "#ef5350", "#ffa726", "#ab47bc"];

  // Statistiques du joueur sélectionné
  const selectedPlayerStats = selectedPlayer
    ? playerStats.find((s) => s.userName === selectedPlayer)
    : null;

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-lg shadow-lg">
          <p className="text-[var(--text-primary)] font-semibold">{`${payload[0].name}: ${payload[0].value}`}</p>
        </div>
      );
    }
    return null;
  };

  if (rolls.length === 0) {
    return (
      <Card className="card">
        <CardContent className="text-center py-8">
          <Dice6 className="h-12 w-12 mx-auto text-[var(--text-secondary)] mb-4" />
          <p className="text-[var(--text-secondary)]">
            Aucune statistique disponible. Lancez des dés pour voir vos statistiques !
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sélection du type de dé */}
      <Card className="card">
        <CardHeader>
          <CardTitle className="text-[var(--accent-brown)] flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Statistiques des Lancers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtre par type de dé */}
          <div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">Type de dé :</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedDiceType("all")}
                className={`px-4 py-2 rounded-lg transition-all ${
                  selectedDiceType === "all"
                    ? "bg-[var(--accent-blue)] text-white"
                    : "bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-darker)]"
                }`}
              >
                Tous les dés
              </button>
              {availableDiceTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedDiceType(type)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    selectedDiceType === type
                      ? "bg-[var(--accent-blue)] text-white"
                      : "bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-darker)]"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Filtre par joueur */}
          <div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">Joueur :</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedPlayer(null)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  selectedPlayer === null
                    ? "bg-[var(--accent-brown)] text-[var(--bg-dark)]"
                    : "bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-darker)]"
                }`}
              >
                Tous les joueurs
              </button>
              {playerStats.map((stats) => (
                <button
                  key={stats.userName}
                  onClick={() => setSelectedPlayer(stats.userName)}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    selectedPlayer === stats.userName
                      ? "bg-[var(--accent-brown)] text-[var(--bg-dark)]"
                      : "bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-darker)]"
                  }`}
                >
                  {stats.userAvatar && (
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={stats.userAvatar} alt={stats.userName} className="object-contain" />
                    </Avatar>
                  )}
                  {stats.userName}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cartes de statistiques */}
      <div className="bento-grid">
        {selectedPlayerStats ? (
          // Statistiques d'un joueur spécifique
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bento-small"
            >
              <Card className="card h-full">
                <CardContent className="flex flex-col items-center justify-center h-full">
                  <Dice6 className="h-8 w-8 text-[var(--accent-brown)] mb-2" />
                  <div className="stat-value">{selectedPlayerStats.totalRolls}</div>
                  <div className="stat-label">Dés Lancés</div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bento-small"
            >
              <Card className="card h-full">
                <CardContent className="flex flex-col items-center justify-center h-full">
                  <Target className="h-8 w-8 text-[var(--accent-blue)] mb-2" />
                  <div className="stat-value">{selectedPlayerStats.averageRoll.toFixed(2)}</div>
                  <div className="stat-label">Moyenne</div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bento-small"
            >
              <Card className="card h-full">
                <CardContent className="flex flex-col items-center justify-center h-full">
                  <TrendingUp className="h-8 w-8 text-green-500 mb-2" />
                  <div className="stat-value">{selectedPlayerStats.highestRoll}</div>
                  <div className="stat-label">Plus Haut</div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bento-small"
            >
              <Card className="card h-full">
                <CardContent className="flex flex-col items-center justify-center h-full">
                  <TrendingDown className="h-8 w-8 text-red-500 mb-2" />
                  <div className="stat-value">{selectedPlayerStats.lowestRoll}</div>
                  <div className="stat-label">Plus Bas</div>
                </CardContent>
              </Card>
            </motion.div>

            {selectedPlayerStats.criticalSuccesses > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bento-small"
              >
                <Card className="card h-full">
                  <CardContent className="flex flex-col items-center justify-center h-full">
                    <Award className="h-8 w-8 text-yellow-500 mb-2" />
                    <div className="stat-value">{selectedPlayerStats.criticalSuccesses}</div>
                    <div className="stat-label">Critiques (20)</div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {selectedPlayerStats.criticalFailures > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bento-small"
              >
                <Card className="card h-full">
                  <CardContent className="flex flex-col items-center justify-center h-full">
                    <TrendingDown className="h-8 w-8 text-red-500 mb-2" />
                    <div className="stat-value">{selectedPlayerStats.criticalFailures}</div>
                    <div className="stat-label">Échecs (1)</div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        ) : (
          // Statistiques globales
          playerStats.slice(0, 6).map((stats, index) => (
            <motion.div
              key={stats.userName}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bento-small cursor-pointer"
              onClick={() => setSelectedPlayer(stats.userName)}
            >
              <Card className="card h-full hover:border-[var(--accent-brown)] transition-all">
                <CardContent className="flex flex-col items-center justify-center h-full">
                  {stats.userAvatar && (
                    <Avatar className="h-20 w-20 mb-2">
                      <AvatarImage src={stats.userAvatar} alt={stats.userName} className="object-contain" />
                    </Avatar>
                  )}
                  <div className="text-[var(--text-primary)] font-semibold mb-2">
                    {stats.userName}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {stats.totalRolls} dés lancés
                  </div>
                  <div className="text-[var(--accent-brown)] font-bold">
                    Moy: {stats.averageRoll.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Graphiques */}
      <div className="bento-grid">
        {/* Graphique d'évolution temporelle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bento-wide"
        >
          <Card className="card h-full">
            <CardHeader>
              <CardTitle className="text-[var(--text-primary)] text-base">
                Évolution des Résultats Bruts {selectedDiceType !== "all" && `(${selectedDiceType})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    dataKey="roll"
                    stroke="var(--text-secondary)"
                    tick={{ fill: "var(--text-secondary)" }}
                  />
                  <YAxis stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="var(--accent-brown)"
                    strokeWidth={2}
                    dot={{ fill: "var(--accent-brown)", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Graphique de distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bento-wide"
        >
          <Card className="card h-full">
            <CardHeader>
              <CardTitle className="text-[var(--text-primary)] text-base">
                Distribution des Résultats Bruts {selectedDiceType !== "all" && `(${selectedDiceType})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={globalDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    dataKey="value"
                    stroke="var(--text-secondary)"
                    tick={{ fill: "var(--text-secondary)" }}
                  />
                  <YAxis stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="var(--accent-blue)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Graphique de comparaison par joueur */}
        {!selectedPlayer && playerRollsData.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bento-wide"
          >
            <Card className="card h-full">
              <CardHeader>
                <CardTitle className="text-[var(--text-primary)] text-base">
                  Comparaison des Joueurs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={playerRollsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis
                      dataKey="name"
                      stroke="var(--text-secondary)"
                      tick={{ fill: "var(--text-secondary)" }}
                    />
                    <YAxis stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="rolls" fill="var(--accent-brown)" name="Dés lancés" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="average" fill="var(--accent-blue)" name="Moyenne" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
