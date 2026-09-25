import { db, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from '@/lib/firebase';
import { Timestamp } from 'firebase/firestore';

export type ChallengeCategory =
  | "dice"           // Lancers de dés
  | "combat"         // Combat et actions héroïques
  | "exploration"    // Découverte et aventure
  | "social"         // Communication et RP
  | "progression"    // Montée en niveau et XP
  | "collection"     // Objets et équipements
  | "mastery";       // Maîtrise et expertise

export type ChallengeDifficulty = "easy" | "medium" | "hard" | "legendary";

export type ChallengeConditionType =
  | "reach_count"        // Atteindre X occurrences
  | "consecutive"        // X fois consécutives
  | "threshold"          // Atteindre un seuil (stat, niveau, etc.)
  | "time_based"         // Basé sur le temps
  | "accumulate";        // Accumuler une valeur totale

export type RewardType = "dice_skin" | "title" | "badge" | "points";

export interface ChallengeCondition {
  type: ChallengeConditionType;
  target: number;
  context?: {
    event?: string;           // Type d'événement à tracker
    stat?: string;            // Stat à vérifier
    value?: any;              // Valeur spécifique à atteindre
    consecutive?: boolean;    // Nécessite consécutivité
  };
}

export interface ChallengeReward {
  type: RewardType;
  value: string;              // ID du skin, titre, ou badge
  points?: number;            // Points bonus optionnels
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  condition: ChallengeCondition;
  reward: ChallengeReward;
  icon?: string;              // Emoji ou icon name
  active: boolean;
  order: number;
  requiredLevel?: number;     // Niveau minimum requis
  isPremium?: boolean;        // Réservé aux premium
}

export interface ChallengeProgress {
  challengeId: string;
  status: "locked" | "in_progress" | "completed";
  progress: number;           // Valeur actuelle (ex: 5 sur 10)
  startedAt?: Date;
  completedAt?: Date;
  attempts: number;
  lastUpdated: Date;
  currentStreak?: number;     // Pour les défis consécutifs
  metadata?: any;             // Données additionnelles spécifiques
}

// ============================================
// DÉFINITIONS DES DÉFIS
// ============================================

export const CHALLENGES: Record<string, Challenge> = {
  // ==================== DICE CHALLENGES ====================
  first_roll: {
    id: "first_roll",
    title: "Premier Lancer",
    description: "Lancez votre premier dé",
    category: "dice",
    difficulty: "easy",
    condition: { type: "reach_count", target: 1, context: { event: "dice_roll" } },
    reward: { type: "title", value: "Apprenti Lanceur" },
    icon: "🎲",
    active: true,
    order: 1
  },

  dice_enthusiast: {
    id: "dice_enthusiast",
    title: "Enthousiaste des Dés",
    description: "Lancez 50 dés au total",
    category: "dice",
    difficulty: "easy",
    condition: { type: "reach_count", target: 50, context: { event: "dice_roll" } },
    reward: { type: "title", value: "Lanceur Enthousiaste" },
    icon: "🎲",
    active: true,
    order: 2
  },

  dice_master: {
    id: "dice_master",
    title: "Maître des Dés",
    description: "Lancez 200 dés au total",
    category: "dice",
    difficulty: "hard",
    condition: { type: "reach_count", target: 200, context: { event: "dice_roll" } },
    reward: { type: "dice_skin", value: "ancient_bone" },
    icon: "🎲",
    active: true,
    order: 3
  },

  first_critical: {
    id: "first_critical",
    title: "Coup Critique",
    description: "Obtenez votre premier 20 naturel",
    category: "dice",
    difficulty: "easy",
    condition: { type: "reach_count", target: 1, context: { event: "critical_success" } },
    reward: { type: "title", value: "Chanceux" },
    icon: "⭐",
    active: true,
    order: 4
  },

  triple_critical: {
    id: "triple_critical",
    title: "Triple Chance",
    description: "Obtenez 3 critiques (20) consécutifs",
    category: "dice",
    difficulty: "legendary",
    condition: { type: "consecutive", target: 3, context: { event: "critical_success", consecutive: true } },
    reward: { type: "dice_skin", value: "celestial_starlight" },
    icon: "✨",
    active: false, // DÉSACTIVÉ
    order: 5
  },

  critical_fail_survivor: {
    id: "critical_fail_survivor",
    title: "Survivant Malchanceux",
    description: "Obtenez 10 échecs critiques (1) et continuez à jouer",
    category: "dice",
    difficulty: "medium",
    condition: { type: "reach_count", target: 10, context: { event: "critical_fail" } },
    reward: { type: "title", value: "Éternel Malchanceux" },
    icon: "😅",
    active: true,
    order: 6
  },

  high_roller: {
    id: "high_roller",
    title: "Grand Parieur",
    description: "Obtenez une moyenne de 15+ sur 20 lancers d20",
    category: "dice",
    difficulty: "hard",
    condition: { type: "threshold", target: 15, context: { stat: "average_d20", value: 20 } },
    reward: { type: "dice_skin", value: "dragon_scale" },
    icon: "🎰",
    active: false, // DÉSACTIVÉ
    order: 7
  },

  lucky_seven: {
    id: "lucky_seven",
    title: "Sept Chanceux",
    description: "Obtenez 7 critiques (20) au total",
    category: "dice",
    difficulty: "medium",
    condition: { type: "reach_count", target: 7, context: { event: "critical_success" } },
    reward: { type: "dice_skin", value: "moonstone" },
    icon: "🍀",
    active: true,
    order: 8
  },

  // ==================== SOCIAL CHALLENGES ====================
  first_message: {
    id: "first_message",
    title: "Première Parole",
    description: "Envoyez votre premier message dans le chat",
    category: "social",
    difficulty: "easy",
    condition: { type: "reach_count", target: 1, context: { event: "chat_message" } },
    reward: { type: "title", value: "Orateur Novice" },
    icon: "💬",
    active: true,
    order: 9
  },

  socialite: {
    id: "socialite",
    title: "Bavard",
    description: "Envoyez 50 messages dans le chat",
    category: "social",
    difficulty: "medium",
    condition: { type: "reach_count", target: 50, context: { event: "chat_message" } },
    reward: { type: "title", value: "Conteur Bavard" },
    icon: "💬",
    active: true,
    order: 10
  },

  storyteller: {
    id: "storyteller",
    title: "Conteur Légendaire",
    description: "Envoyez 200 messages dans le chat",
    category: "social",
    difficulty: "hard",
    condition: { type: "reach_count", target: 200, context: { event: "chat_message" } },
    reward: { type: "title", value: "Barde Légendaire" },
    icon: "📖",
    active: true,
    order: 11
  },

  // ==================== PROGRESSION CHALLENGES ====================
  level_5: {
    id: "level_5",
    title: "Aventurier Confirmé",
    description: "Atteignez le niveau 5",
    category: "progression",
    difficulty: "easy",
    condition: { type: "threshold", target: 5, context: { stat: "niveau" } },
    reward: { type: "title", value: "Aventurier Confirmé" },
    icon: "⬆️",
    active: true,
    order: 12
  },

  level_10: {
    id: "level_10",
    title: "Héros Accompli",
    description: "Atteignez le niveau 10",
    category: "progression",
    difficulty: "medium",
    condition: { type: "threshold", target: 10, context: { stat: "niveau" } },
    reward: { type: "dice_skin", value: "royal_marble" },
    icon: "⬆️",
    active: true,
    order: 13
  },

  level_20: {
    id: "level_20",
    title: "Légende Vivante",
    description: "Atteignez le niveau 20",
    category: "progression",
    difficulty: "legendary",
    condition: { type: "threshold", target: 20, context: { stat: "niveau" } },
    reward: { type: "dice_skin", value: "cosmos" },
    icon: "👑",
    active: true,
    order: 14
  },

  // ==================== COLLECTION CHALLENGES ====================
  first_item: {
    id: "first_item",
    title: "Premier Trésor",
    description: "Obtenez votre premier objet",
    category: "collection",
    difficulty: "easy",
    condition: { type: "reach_count", target: 1, context: { event: "item_acquired" } },
    reward: { type: "title", value: "Collectionneur Débutant" },
    icon: "🎒",
    active: true,
    order: 15
  },

  hoarder: {
    id: "hoarder",
    title: "Accumulateur",
    description: "Possédez 50 objets dans votre inventaire",
    category: "collection",
    difficulty: "medium",
    condition: { type: "threshold", target: 50, context: { stat: "inventory_count" } },
    reward: { type: "title", value: "Accumulateur Compulsif" },
    icon: "📦",
    active: true,
    order: 16
  },

  wealthy: {
    id: "wealthy",
    title: "Fortuné",
    description: "Accumulez 1000 pièces d'or",
    category: "collection",
    difficulty: "hard",
    condition: { type: "threshold", target: 1000, context: { stat: "gold_count" } },
    reward: { type: "dice_skin", value: "merveille" },
    icon: "💰",
    active: false, // DÉSACTIVÉ
    order: 17
  },

  weapon_collector: {
    id: "weapon_collector",
    title: "Collectionneur d'Armes",
    description: "Possédez 10 armes différentes",
    category: "collection",
    difficulty: "medium",
    condition: { type: "reach_count", target: 10, context: { event: "weapon_acquired" } },
    reward: { type: "title", value: "Maître d'Armes" },
    icon: "⚔️",
    active: true,
    order: 18
  },

  // ==================== EXPLORATION CHALLENGES ====================
  first_session: {
    id: "first_session",
    title: "Première Aventure",
    description: "Jouez votre première session (5 minutes)",
    category: "exploration",
    difficulty: "easy",
    condition: { type: "time_based", target: 5, context: { event: "time_spent" } },
    reward: { type: "title", value: "Novice Aventurier" },
    icon: "🗺️",
    active: true,
    order: 19
  },

  seasoned_adventurer: {
    id: "seasoned_adventurer",
    title: "Aventurier Chevronné",
    description: "Jouez 10 heures au total",
    category: "exploration",
    difficulty: "medium",
    condition: { type: "time_based", target: 600, context: { event: "time_spent" } },
    reward: { type: "dice_skin", value: "ecorce_ancienne" },
    icon: "⏱️",
    active: true,
    order: 20
  },

  marathon_player: {
    id: "marathon_player",
    title: "Marathonien",
    description: "Jouez 50 heures au total",
    category: "exploration",
    difficulty: "legendary",
    condition: { type: "time_based", target: 3000, context: { event: "time_spent" } },
    reward: { type: "dice_skin", value: "galactic_nebula" },
    icon: "🏃",
    active: true,
    order: 21
  },

  // ==================== MASTERY CHALLENGES ====================
  skill_learner: {
    id: "skill_learner",
    title: "Étudiant Assidu",
    description: "Apprenez 5 compétences différentes",
    category: "mastery",
    difficulty: "easy",
    condition: { type: "reach_count", target: 5, context: { event: "skill_learned" } },
    reward: { type: "title", value: "Étudiant" },
    icon: "📚",
    active: true,
    order: 22
  },

  skill_master: {
    id: "skill_master",
    title: "Polyvalent",
    description: "Apprenez 15 compétences différentes",
    category: "mastery",
    difficulty: "hard",
    condition: { type: "reach_count", target: 15, context: { event: "skill_learned" } },
    reward: { type: "dice_skin", value: "parchemin_ancien" },
    icon: "🎓",
    active: true,
    order: 23
  },

  stat_maxed: {
    id: "stat_maxed",
    title: "Perfection Absolue",
    description: "Atteignez 20 dans une caractéristique",
    category: "mastery",
    difficulty: "legendary",
    condition: { type: "threshold", target: 20, context: { stat: "any_attribute" } },
    reward: { type: "dice_skin", value: "cyber_neon" },
    icon: "💪",
    active: true,
    order: 24
  },

  // ==================== COMBAT CHALLENGES ====================
  first_kill: {
    id: "first_kill",
    title: "Première Victoire",
    description: "Remportez votre premier combat",
    category: "combat",
    difficulty: "easy",
    condition: { type: "reach_count", target: 1, context: { event: "combat_won" } },
    reward: { type: "title", value: "Combattant Novice" },
    icon: "⚔️",
    active: false, // DÉSACTIVÉ
    order: 25
  },

  veteran_warrior: {
    id: "veteran_warrior",
    title: "Vétéran de Guerre",
    description: "Remportez 25 combats",
    category: "combat",
    difficulty: "medium",
    condition: { type: "reach_count", target: 25, context: { event: "combat_won" } },
    reward: { type: "title", value: "Vétéran de Guerre" },
    icon: "🛡️",
    active: false, // DÉSACTIVÉ
    order: 26
  },

  survivor: {
    id: "survivor",
    title: "Survivant Ultime",
    description: "Survivez avec moins de 5% de vos PV maximum",
    category: "combat",
    difficulty: "hard",
    condition: { type: "threshold", target: 5, context: { stat: "hp_percentage" } },
    reward: { type: "dice_skin", value: "blood_pact" },
    icon: "❤️",
    active: false, // DÉSACTIVÉ
    order: 27
  },

  damage_dealer: {
    id: "damage_dealer",
    title: "Destructeur",
    description: "Infligez 1000 points de dégâts au total",
    category: "combat",
    difficulty: "hard",
    condition: { type: "accumulate", target: 1000, context: { event: "damage_dealt" } },
    reward: { type: "dice_skin", value: "roche_volcanique" },
    icon: "💥",
    active: true,
    order: 28
  },

  dragon_slayer: {
    id: "dragon_slayer",
    title: "Tueur de Dragons",
    description: "Terrassez un dragon (niveau 15+)",
    category: "combat",
    difficulty: "legendary",
    condition: { type: "reach_count", target: 1, context: { event: "dragon_defeated" } },
    reward: { type: "title", value: "Fléau des Dragons" },
    icon: "🐉",
    active: false, // DÉSACTIVÉ
    order: 29
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Récupère tous les défis actifs
 */
export function getAllChallenges(): Challenge[] {
  return Object.values(CHALLENGES).filter(c => c.active).sort((a, b) => a.order - b.order);
}

/**
 * Récupère les défis par catégorie
 */
export function getChallengesByCategory(category: ChallengeCategory): Challenge[] {
  return getAllChallenges().filter(c => c.category === category);
}

/**
 * Récupère les défis par difficulté
 */
export function getChallengesByDifficulty(difficulty: ChallengeDifficulty): Challenge[] {
  return getAllChallenges().filter(c => c.difficulty === difficulty);
}

/**
 * Récupère un défi par ID
 */
export function getChallengeById(id: string): Challenge | undefined {
  return CHALLENGES[id];
}

// ============================================
// FIREBASE OPERATIONS
// ============================================

/**
 * Initialise la progression des défis pour un utilisateur
 */
export async function initializeUserChallenges(uid: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) return;

  const challengeProgressRef = collection(db, `users/${uid}/challenge_progress`);
  const challenges = getAllChallenges();

  for (const challenge of challenges) {
    const progressRef = doc(challengeProgressRef, challenge.id);
    const progressSnap = await getDoc(progressRef);

    if (!progressSnap.exists()) {
      const initialProgress: ChallengeProgress = {
        challengeId: challenge.id,
        status: "locked",
        progress: 0,
        attempts: 0,
        lastUpdated: new Date()
      };

      await setDoc(progressRef, {
        ...initialProgress,
        lastUpdated: Timestamp.now()
      });
    }
  }
}

/**
 * Récupère la progression d'un utilisateur pour tous les défis
 */
export async function getUserChallengesProgress(uid: string): Promise<Record<string, ChallengeProgress>> {
  const progressMap: Record<string, ChallengeProgress> = {};
  const progressRef = collection(db, `users/${uid}/challenge_progress`);
  const snapshot = await getDocs(progressRef);

  snapshot.forEach((doc) => {
    const data = doc.data();
    progressMap[doc.id] = {
      ...data,
      startedAt: data.startedAt?.toDate(),
      completedAt: data.completedAt?.toDate(),
      lastUpdated: data.lastUpdated?.toDate()
    } as ChallengeProgress;
  });

  return progressMap;
}

/**
 * Met à jour la progression d'un défi
 */
export async function updateChallengeProgress(
  uid: string,
  challengeId: string,
  updates: Partial<ChallengeProgress>
): Promise<void> {
  const progressRef = doc(db, `users/${uid}/challenge_progress/${challengeId}`);

  const updateData: any = {
    ...updates,
    lastUpdated: Timestamp.now()
  };

  if (updates.startedAt) {
    updateData.startedAt = Timestamp.fromDate(updates.startedAt);
  }
  if (updates.completedAt) {
    updateData.completedAt = Timestamp.fromDate(updates.completedAt);
  }

  await updateDoc(progressRef, updateData);
}

/**
 * Marque un défi comme complété et attribue la récompense
 */
export async function completeChallenge(uid: string, challengeId: string): Promise<void> {
  const challenge = getChallengeById(challengeId);
  if (!challenge) return;

  // Met à jour la progression
  await updateChallengeProgress(uid, challengeId, {
    status: "completed",
    completedAt: new Date(),
    progress: challenge.condition.target
  });

  // Attribue la récompense
  const userRef = doc(db, 'users', uid);

  if (challenge.reward.type === "title") {
    // Débloquer le titre
    await updateDoc(userRef, {
      [`titles.${challenge.reward.value}`]: "unlocked"
    });
  } else if (challenge.reward.type === "dice_skin") {
    // Ajouter le skin aux dés possédés
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const diceInventory = userSnap.data().dice_inventory || [];
      if (!diceInventory.includes(challenge.reward.value)) {
        await updateDoc(userRef, {
          dice_inventory: [...diceInventory, challenge.reward.value]
        });
      }
    }
  }
}

/**
 * Vérifie si un défi est complété et le marque si nécessaire
 */
export async function checkAndCompleteChallenge(
  uid: string,
  challengeId: string,
  currentProgress: ChallengeProgress
): Promise<boolean> {
  const challenge = getChallengeById(challengeId);
  if (!challenge) return false;

  const isCompleted = currentProgress.progress >= challenge.condition.target;

  if (isCompleted && currentProgress.status !== "completed") {
    await completeChallenge(uid, challengeId);
    return true;
  }

  return false;
}

/**
 * Seed les défis dans Firestore (optionnel, pour admin)
 */
export async function seedChallenges(): Promise<void> {
  const challenges = getAllChallenges();

  for (const challenge of challenges) {
    const challengeRef = doc(db, 'challenges', challenge.id);
    await setDoc(challengeRef, challenge, { merge: true });
  }
}
