/**
 * EXEMPLE D'INTÉGRATION DU SYSTÈME DE DÉFIS DANS LE PROFIL
 *
 * Ce fichier montre comment intégrer facilement le système de défis
 * dans ProfileTab.tsx (ou n'importe quel autre composant).
 *
 * Il suffit d'ajouter quelques lignes de code !
 */

import { ChallengesButton } from '@/components/(challenges)/challenges-button';
import { Trophy } from 'lucide-react';

// ==========================================
// OPTION 1: Ajouter un onglet "Défis"
// ==========================================

// Dans ProfileTab.tsx, ajouter un nouvel onglet :

const tabs = [
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'titles', label: 'Titres', icon: Crown },
  { id: 'challenges', label: 'Défis', icon: Trophy }, // ⭐ NOUVEAU
  { id: 'settings', label: 'Paramètres', icon: Settings }
];

// Dans le rendu des tabs :
{activeTab === 'challenges' && (
  <div className="space-y-6">
    <div className="flex items-center gap-2 mb-4">
      <Trophy className="w-5 h-5 text-[var(--accent-brown)]" />
      <h3 className="text-lg font-bold">Mes Défis</h3>
    </div>

    {/* Le bouton ouvre automatiquement le modal */}
    <ChallengesButton variant="default" />
  </div>
)}

// ==========================================
// OPTION 2: Bouton rapide dans le header
// ==========================================

// Dans le header du profil, ajouter :
<div className="flex items-center gap-2">
  <Button onClick={() => setActiveTab('profile')}>Profil</Button>
  <ChallengesButton variant="icon" /> {/* ⭐ Icône compacte */}
</div>

// ==========================================
// OPTION 3: Section "Statistiques" avec preview
// ==========================================

import { useState, useEffect } from 'react';
import { getUserChallengesProgress } from '@/lib/challenges';
import { auth } from '@/lib/firebase';

export default function ProfileTab({ uid, userData }: ProfileTabProps) {
  const [challengeStats, setChallengeStats] = useState({
    total: 0,
    completed: 0,
    inProgress: 0
  });

  useEffect(() => {
    const loadChallengeStats = async () => {
      if (!uid) return;

      try {
        const progress = await getUserChallengesProgress(uid);
        const progressArray = Object.values(progress);

        setChallengeStats({
          total: progressArray.length,
          completed: progressArray.filter(p => p.status === "completed").length,
          inProgress: progressArray.filter(p => p.status === "in_progress").length
        });
      } catch (error) {
        console.error('Error loading challenge stats:', error);
      }
    };

    loadChallengeStats();
  }, [uid]);

  return (
    <div className="space-y-6">
      {/* ... autres sections ... */}

      {/* Section Statistiques de Défis */}
      <div
        className="p-5 rounded-2xl bg-[var(--bg-darker)] border border-[var(--border-color)]"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[var(--accent-brown)]" />
            <h3 className="text-sm font-semibold">Défis</h3>
          </div>
          <ChallengesButton variant="icon" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent-brown)]">
              {challengeStats.completed}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Complétés</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {challengeStats.inProgress}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">En cours</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--text-secondary)]">
              {challengeStats.total}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Total</div>
          </div>
        </div>

        {/* Barre de progression globale */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[var(--text-secondary)]">Progression</span>
            <span className="font-bold text-[var(--accent-brown)]">
              {Math.round((challengeStats.completed / challengeStats.total) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-[var(--bg-card)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-brown)] transition-all duration-500"
              style={{
                width: `${(challengeStats.completed / challengeStats.total) * 100}%`
              }}
            />
          </div>
        </div>

        {/* Bouton pour voir tous les défis */}
        <ChallengesButton
          variant="default"
          className="w-full mt-4"
        />
      </div>

      {/* ... autres sections ... */}
    </div>
  );
}

// ==========================================
// OPTION 4: Bouton flottant global
// ==========================================

// Dans le layout principal de l'app (_app.tsx ou layout.tsx) :

import { ChallengesButton } from '@/components/(challenges)/challenges-button';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}

        {/* Bouton flottant accessible partout */}
        <ChallengesButton variant="floating" />
      </body>
    </html>
  );
}

// ==========================================
// OPTION 5: Card compacte avec derniers défis
// ==========================================

import { getAllChallenges, getUserChallengesProgress } from '@/lib/challenges';
import { ChallengeCard } from '@/components/(challenges)/challenge-card';

export default function ProfileTab({ uid, userData }: ProfileTabProps) {
  const [recentChallenges, setRecentChallenges] = useState([]);

  useEffect(() => {
    const loadRecentChallenges = async () => {
      if (!uid) return;

      const progress = await getUserChallengesProgress(uid);
      const challenges = getAllChallenges();

      // Derniers 3 défis en cours
      const inProgress = challenges
        .filter(c => progress[c.id]?.status === "in_progress")
        .slice(0, 3)
        .map(c => ({ challenge: c, progress: progress[c.id] }));

      setRecentChallenges(inProgress);
    };

    loadRecentChallenges();
  }, [uid]);

  return (
    <div className="space-y-6">
      {/* Section Défis Actifs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--accent-brown)]" />
            Défis en cours
          </h3>
          <ChallengesButton variant="icon" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {recentChallenges.map(({ challenge, progress }) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              progress={progress}
            />
          ))}
        </div>

        {recentChallenges.length === 0 && (
          <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
            Aucun défi en cours. Commencez à jouer pour débloquer des défis !
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// RÉSUMÉ DES IMPORTS NÉCESSAIRES
// ==========================================

/*
Pour une intégration complète, ajoutez ces imports :

import { ChallengesButton } from '@/components/(challenges)/challenges-button';
import { ChallengeCard } from '@/components/(challenges)/challenge-card';
import {
  getAllChallenges,
  getUserChallengesProgress,
  getChallengesByCategory
} from '@/lib/challenges';
import { Trophy } from 'lucide-react';
*/

// ==========================================
// TRACKING AUTOMATIQUE
// ==========================================

/*
N'oubliez pas d'ajouter les hooks de tracking dans :

1. dice-roller.tsx → trackDiceRoll()
2. Chat.tsx → trackChatMessage()
3. Inventaire.tsx → trackItemAcquired()
4. CharacterContext.tsx → trackLevelUp()
5. TimeTracker.tsx → trackTimeSpent()

Voir CHALLENGES_INTEGRATION_GUIDE.md pour les détails.
*/
