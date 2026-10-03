"use client";

import React from 'react';
import { Challenge, ChallengeProgress } from '@/lib/challenges';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';

interface ChallengeCardProps {
  challenge: Challenge;
  progress: ChallengeProgress;
  onClaim?: () => void;
}

export function ChallengeCard({ challenge, progress }: ChallengeCardProps) {
  const isCompleted = progress.status === "completed";

  const progressPercentage = Math.min(100, (progress.progress / challenge.condition.target) * 100);

  const getDifficultyLabel = () => {
    switch (challenge.difficulty) {
      case "easy": return "Facile";
      case "medium": return "Moyen";
      case "hard": return "Difficile";
      case "legendary": return "Légendaire";
      default: return "";
    }
  };

  const getRewardLabel = () => {
    if (challenge.reward.type === "title") {
      return "Titre";
    } else if (challenge.reward.type === "dice_skin") {
      return "Skin de dés";
    }
    return "Récompense";
  };

  const getRewardValue = () => {
    if (challenge.reward.type === "title") {
      return challenge.reward.value;
    } else if (challenge.reward.type === "dice_skin") {
      return challenge.reward.value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return "";
  };

  return (
    <motion.div
      className={cn(
        "relative flex items-center gap-4 px-6 py-4 rounded-xl transition-all duration-200 group",
        isCompleted && "opacity-90"
      )}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      whileHover={{ scale: 1.01 }}
    >
      {/* Icon du défi - SANS bordure de couleur */}
      <div className="flex-shrink-0">
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-xl transition-all"
          )}
          style={{
            background: 'var(--bg-darker)',
          }}
        >
          <span className="text-3xl">{challenge.icon || "🏆"}</span>
        </div>
      </div>

      {/* Content central */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Titre et badge de statut */}
        <div className="flex items-center gap-2">
          <h3
            className="text-base font-bold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {challenge.title}
          </h3>

          {isCompleted && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: '#4ade80' }}
            >
              <Check className="w-3 h-3 text-white" />
              <span className="text-[9px] font-bold uppercase text-white">
                Complété
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        <p
          className="text-sm leading-relaxed line-clamp-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          {challenge.description}
        </p>

        {/* Progress bar et stats - TOUJOURS AFFICHÉE */}
        <div className="space-y-1.5">
          {/* Barre de progression - TOUJOURS VERTE */}
          <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-darker)' }}>
            <motion.div
              className="h-full rounded-full transition-all"
              style={{
                background: '#4ade80', // Toujours vert
                width: `${progressPercentage}%`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>

          {/* Progress text */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {progress.progress} / {challenge.condition.target}
            </span>
            <span
              className="text-xs font-bold"
              style={{ color: isCompleted ? '#4ade80' : 'var(--text-secondary)' }}
            >
              {Math.round(progressPercentage)}%
            </span>
          </div>
        </div>
      </div>

      {/* Section récompenses à droite */}
      <div className="flex-shrink-0 flex flex-col items-end gap-2 min-w-[140px]">
        {/* Badge de difficulté */}
        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: 'var(--bg-darker)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
          }}
        >
          {getDifficultyLabel()}
        </span>

        {/* Récompense */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-darker)' }}>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              {getRewardLabel()}
            </span>
            <div className="flex items-center gap-1.5">
              {challenge.reward.type === "title" && (
                <span className="text-xs font-bold" style={{ color: 'var(--accent-brown)' }}>
                  {getRewardValue()}
                </span>
              )}
              {challenge.reward.type === "dice_skin" && (
                <div className="flex items-center gap-1">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                    <span className="text-[10px]">🎲</span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    {getRewardValue()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
