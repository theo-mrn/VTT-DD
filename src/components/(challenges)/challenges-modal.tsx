"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAllChallenges,
  Challenge,
  ChallengeProgress,
  getUserChallengesProgress,
  initializeUserChallenges,
} from '@/lib/challenges';
import { ChallengeCard } from './challenge-card';
import {
  Trophy,
  X,
  Loader2,
  List,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { db, doc, onSnapshot } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';

interface ChallengesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "in_progress" | "completed";

export function ChallengesModal({ isOpen, onClose }: ChallengesModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("in_progress");
  const [mounted, setMounted] = useState(false);
  const [isLoadingChallenges, setIsLoadingChallenges] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [challengesProgress, setChallengesProgress] = useState<Record<string, ChallengeProgress>>({});
  const { user: gameUser } = useGame();

  // Portal lifecycle
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const uid = gameUser?.uid;
    if (!uid) {
      setChallengesProgress({});
      setIsLoadingChallenges(false);
      return;
    }

    setUid(uid);

    let unsubscribeProgress: () => void = () => { };

    const loadChallenges = async () => {
      try {
        await initializeUserChallenges(uid);

        const { collection } = await import('@/lib/firebase');

        // Récupère l'état initial
        const initialProgress = await getUserChallengesProgress(uid);
        setChallengesProgress(initialProgress);
        setIsLoadingChallenges(false);

        // Puis écoute les changements en temps réel pendant que le component est monté
        const progressRef = collection(db, `users/${uid}/challenge_progress`);
        unsubscribeProgress = onSnapshot(progressRef, (snapshot) => {
          setChallengesProgress(prev => {
            const newProgress = { ...prev };
            let changed = false;

            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added' || change.type === 'modified') {
                const data = change.doc.data() as any;

                // Adapter le format du Timestamp pour le ChallengeProgress
                const formattedProgress: ChallengeProgress = {
                  challengeId: data.challengeId || change.doc.id,
                  status: data.status,
                  progress: data.progress,
                  startedAt: data.startedAt?.toDate(),
                  completedAt: data.completedAt?.toDate(),
                  lastUpdated: data.lastUpdated?.toDate(),
                  attempts: data.attempts || 0,
                  currentStreak: data.currentStreak,
                  metadata: data.metadata,
                };

                // Petite vérification pour éviter des re-renders inutiles
                if (JSON.stringify(newProgress[change.doc.id]) !== JSON.stringify(formattedProgress)) {
                  newProgress[change.doc.id] = formattedProgress;
                  changed = true;
                }
              }
            });

            return changed ? newProgress : prev;
          });
        }, (error) => console.error("Error listening to real-time challenges:", error));

      } catch (error) {
        console.error('Error loading challenges:', error);
        setIsLoadingChallenges(false);
      }
    };

    loadChallenges();

    return () => {
      unsubscribeProgress();
    };
  }, [gameUser?.uid]);

  // Le rechargement périodique de 5 secondes a été supprimé. Le onSnapshot gère déjà le temps réel.

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Filtrage des défis par statut
  const allChallenges = getAllChallenges();

  const completedChallenges = allChallenges.filter(challenge => {
    const progress = challengesProgress[challenge.id];
    return progress && progress.status === "completed";
  });

  // "En cours" = tous les défis NON complétés (locked + in_progress)
  const nonCompletedChallenges = allChallenges.filter(challenge => {
    const progress = challengesProgress[challenge.id];
    return !progress || progress.status !== "completed";
  });

  const displayedChallenges = activeTab === "in_progress" ? nonCompletedChallenges : completedChallenges;

  // Stats globales
  const totalChallenges = allChallenges.length;
  const completedCount = completedChallenges.length;
  const nonCompletedCount = nonCompletedChallenges.length;

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div
      data-challenges-portal
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4"
      style={{
        pointerEvents: isVisible ? 'auto' : 'none',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-4xl h-full max-h-[85vh] flex flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          background: 'var(--bg-dark)',
          border: '1px solid var(--border-color)',
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.97) translateY(12px)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent line top */}
        <div
          className="absolute inset-x-0 top-0 h-px z-20 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, var(--accent-brown) 50%, transparent 100%)',
            opacity: 0.5
          }}
        />

        {/* Header */}
        <div
          className="relative px-5 py-3.5 shrink-0 flex items-center justify-between"
          style={{ background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-color)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <Trophy className="w-4 h-4" style={{ color: 'var(--accent-brown)' }} />
            </div>
            <div>
              <h2
                className="text-sm font-bold tracking-wide"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title, serif)' }}
              >
                Défis et Récompenses
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {completedCount} / {totalChallenges} complétés · {nonCompletedCount} restants
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150"
            style={{ color: 'var(--text-secondary)', border: '1px solid transparent' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tabs - En cours / Complétés */}
        <div
          className="flex items-center gap-2 px-5 py-3 shrink-0"
          style={{ background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-color)' }}
        >
          <button
            onClick={() => setActiveTab("in_progress")}
            className="relative flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all duration-200 rounded-lg"
            style={{
              color: activeTab === "in_progress" ? 'var(--accent-brown)' : 'var(--text-secondary)',
              background: activeTab === "in_progress" ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'transparent',
              border: activeTab === "in_progress" ? '1px solid var(--accent-brown)' : '1px solid transparent',
            }}
          >
            <List className="w-4 h-4" />
            À faire
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: activeTab === "in_progress"
                  ? 'color-mix(in srgb, var(--accent-brown) 30%, transparent)'
                  : 'var(--bg-card)',
                color: activeTab === "in_progress" ? 'var(--accent-brown)' : 'var(--text-secondary)',
              }}
            >
              {nonCompletedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className="relative flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all duration-200 rounded-lg"
            style={{
              color: activeTab === "completed" ? 'var(--accent-brown)' : 'var(--text-secondary)',
              background: activeTab === "completed" ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'transparent',
              border: activeTab === "completed" ? '1px solid var(--accent-brown)' : '1px solid transparent',
            }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Complétés
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: activeTab === "completed"
                  ? 'color-mix(in srgb, var(--accent-brown) 30%, transparent)'
                  : 'var(--bg-card)',
                color: activeTab === "completed" ? 'var(--accent-brown)' : 'var(--text-secondary)',
              }}
            >
              {completedCount}
            </span>
          </button>
        </div>

        {/* Content - Liste en une seule colonne */}
        <div className="flex-1 overflow-hidden relative" style={{ background: 'var(--bg-dark)' }}>
          {isLoadingChallenges ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-brown)' }} />
              <span className="text-xs animate-pulse" style={{ color: 'var(--text-secondary)' }}>
                Chargement des défis...
              </span>
            </div>
          ) : (
            <ScrollArea className="h-full w-full">
              <div className="p-5 sm:p-6 min-h-full">
                {displayedChallenges.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-20">
                    <Trophy className="w-10 h-10 opacity-20" style={{ color: 'var(--text-secondary)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {activeTab === "in_progress"
                        ? "Aucun défi disponible."
                        : "Aucun défi complété pour le moment."}
                    </p>
                  </div>
                ) : (
                  // UNE SEULE COLONNE
                  <div className="flex flex-col gap-3 pb-20">
                    {displayedChallenges.map((challenge) => {
                      const progress = challengesProgress[challenge.id] || {
                        challengeId: challenge.id,
                        status: "locked",
                        progress: 0,
                        attempts: 0,
                        lastUpdated: new Date()
                      };

                      return (
                        <ChallengeCard
                          key={challenge.id}
                          challenge={challenge}
                          progress={progress}
                          onClaim={() => {
                            toast.success(`Récompense réclamée: ${challenge.reward.value}!`);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
