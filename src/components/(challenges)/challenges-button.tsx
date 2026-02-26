"use client";

import React, { useState, useEffect } from 'react';
import { Trophy, Sparkles } from 'lucide-react';
import { ChallengesModal } from './challenges-modal';
import { getUserChallengesProgress } from '@/lib/challenges';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { cn } from '@/lib/utils';

interface ChallengesButtonProps {
  variant?: "default" | "icon" | "floating";
  className?: string;
}

/**
 * Bouton pour ouvrir le modal des défis
 * - "default": Bouton classique avec texte
 * - "icon": Icône seule (pour header/navbar)
 * - "floating": Bouton flottant en bas à droite
 */
export function ChallengesButton({ variant = "default", className }: ChallengesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [hasNewCompletions, setHasNewCompletions] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCompletedCount(0);
        return;
      }

      try {
        const progress = await getUserChallengesProgress(user.uid);
        const completed = Object.values(progress).filter(p => p.status === "completed").length;

        // Vérifie s'il y a de nouvelles complétions depuis la dernière visite
        const lastSeenCount = parseInt(localStorage.getItem('lastSeenChallengeCount') || '0');
        setHasNewCompletions(completed > lastSeenCount);

        setCompletedCount(completed);
      } catch (error) {
        console.error('Error loading challenge count:', error);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    setHasNewCompletions(false);
    localStorage.setItem('lastSeenChallengeCount', completedCount.toString());
  };

  if (variant === "floating") {
    return (
      <>
        <button
          onClick={handleOpen}
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "flex items-center justify-center",
            "w-14 h-14 rounded-full shadow-2xl",
            "transition-all duration-300 hover:scale-110",
            "group",
            className
          )}
          style={{
            background: 'linear-gradient(135deg, var(--accent-brown) 0%, color-mix(in srgb, var(--accent-brown) 80%, black) 100%)',
            border: '2px solid var(--accent-brown)',
          }}
        >
          <Trophy className="w-6 h-6 text-white group-hover:rotate-12 transition-transform" />

          {/* Badge de notification */}
          {hasNewCompletions && (
            <div className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 border-2 border-white animate-pulse">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          )}

          {/* Count badge */}
          {completedCount > 0 && (
            <div
              className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
              style={{
                background: 'var(--bg-dark)',
                color: 'var(--accent-brown)',
                border: '2px solid var(--accent-brown)',
              }}
            >
              {completedCount}
            </div>
          )}
        </button>

        <ChallengesModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  if (variant === "icon") {
    return (
      <>
        <button
          onClick={handleOpen}
          className={cn(
            "relative flex items-center justify-center",
            "w-10 h-10 rounded-lg",
            "transition-all duration-200",
            "hover:bg-[var(--bg-card)]",
            "group",
            className
          )}
          style={{
            color: 'var(--text-secondary)',
          }}
        >
          <Trophy className="w-5 h-5 group-hover:text-[var(--accent-brown)] transition-colors" />

          {/* Badge de notification */}
          {hasNewCompletions && (
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}

          {/* Count badge */}
          {completedCount > 0 && (
            <div
              className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold"
              style={{
                background: 'var(--accent-brown)',
                color: 'var(--bg-dark)',
              }}
            >
              {completedCount}
            </div>
          )}
        </button>

        <ChallengesModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  // variant === "default"
  return (
    <>
      <button
        onClick={handleOpen}
        className={cn(
          "relative flex items-center gap-2 px-4 py-2 rounded-lg",
          "transition-all duration-200",
          "group",
          className
        )}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
        }}
      >
        <Trophy className="w-4 h-4 group-hover:text-[var(--accent-brown)] transition-colors" />
        <span className="text-sm font-semibold">Mes Défis</span>

        {/* Badge de notification */}
        {hasNewCompletions && (
          <Sparkles className="w-4 h-4 text-[var(--accent-brown)] animate-pulse" />
        )}

        {/* Count badge */}
        {completedCount > 0 && (
          <div
            className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
            style={{
              background: 'var(--accent-brown)',
              color: 'var(--bg-dark)',
            }}
          >
            {completedCount}
          </div>
        )}
      </button>

      <ChallengesModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
