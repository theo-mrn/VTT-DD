import {
  db,
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  Timestamp
} from '@/lib/firebase';
import {
  Challenge,
  ChallengeProgress,
  getChallengeById,
  getAllChallenges,
  checkAndCompleteChallenge
} from '@/lib/challenges';
import { generateSlug } from '@/lib/titles';
import { toast } from 'sonner';

/**
 * Type d'événement trackable
 */
export type TrackableEvent =
  | "dice_roll"
  | "critical_success"
  | "critical_fail"
  | "chat_message"
  | "item_acquired"
  | "weapon_acquired"
  | "skill_learned"
  | "level_up"
  | "combat_won"
  | "damage_dealt"
  | "dragon_defeated"
  | "time_spent";

/**
 * Données d'événement
 */
export interface EventData {
  uid: string;
  event: TrackableEvent;
  value?: number;
  metadata?: any;
}

/**
 * Vérifie et met à jour les défis affectés par un événement
 */
export async function trackEvent(eventData: EventData): Promise<void> {
  const { uid, event, value = 1, metadata = {} } = eventData;

  if (!uid) return;

  try {
    // Récupère tous les défis
    const challenges = getAllChallenges();

    // Filtre les défis concernés par cet événement
    const relevantChallenges = challenges.filter(challenge =>
      challenge.condition.context?.event === event
    );

    if (relevantChallenges.length === 0) return;

    // Récupère la progression actuelle de l'utilisateur
    const progressRef = collection(db, `users/${uid}/challenge_progress`);
    const progressSnap = await getDocs(progressRef);

    const progressMap: Record<string, ChallengeProgress> = {};
    progressSnap.forEach((doc) => {
      const data = doc.data();
      progressMap[doc.id] = {
        ...data,
        startedAt: data.startedAt?.toDate(),
        completedAt: data.completedAt?.toDate(),
        lastUpdated: data.lastUpdated?.toDate()
      } as ChallengeProgress;
    });

    // Met à jour chaque défi concerné
    for (const challenge of relevantChallenges) {
      const currentProgress = progressMap[challenge.id];
      if (!currentProgress || currentProgress.status === "completed") continue;

      await updateChallengeForEvent(uid, challenge, currentProgress, event, value, metadata);
    }
  } catch (error) {
    console.error('Error tracking event:', error);
  }
}

/**
 * Met à jour un défi spécifique en fonction d'un événement
 */
async function updateChallengeForEvent(
  uid: string,
  challenge: Challenge,
  currentProgress: ChallengeProgress,
  event: TrackableEvent,
  value: number,
  metadata: any
): Promise<void> {
  const progressRef = doc(db, `users/${uid}/challenge_progress/${challenge.id}`);

  let newProgress = currentProgress.progress;
  let newStatus = currentProgress.status;
  let currentStreak = currentProgress.currentStreak || 0;

  // Gère les différents types de conditions
  switch (challenge.condition.type) {
    case "reach_count":
      // Simple compteur
      newProgress += value;
      newStatus = "in_progress";
      break;

    case "consecutive":
      // Nécessite consécutivité
      if (challenge.condition.context?.consecutive) {
        if (metadata.isConsecutive) {
          currentStreak += value;
          newProgress = currentStreak;
        } else {
          currentStreak = 0;
          newProgress = 0;
        }
        newStatus = "in_progress";
      }
      break;

    case "accumulate":
      // Accumule une valeur totale (ex: dégâts)
      newProgress += value;
      newStatus = "in_progress";
      break;

    case "threshold":
      // Vérifie un seuil (sera géré séparément dans checkThresholdChallenges)
      return;

    case "time_based":
      // Géré par le TimeTracker
      return;

    default:
      return;
  }

  // Vérifie si le défi est complété
  const isCompleted = newProgress >= challenge.condition.target;

  // Met à jour la progression
  const updateData: any = {
    progress: newProgress,
    status: isCompleted ? "completed" : newStatus,
    lastUpdated: Timestamp.now(),
    attempts: currentProgress.attempts + 1
  };

  if (challenge.condition.type === "consecutive") {
    updateData.currentStreak = currentStreak;
  }

  if (newStatus === "in_progress" && !currentProgress.startedAt) {
    updateData.startedAt = Timestamp.now();
  }

  if (isCompleted) {
    updateData.completedAt = Timestamp.now();
  }

  await updateDoc(progressRef, updateData);

  // Si complété, attribue la récompense et notifie
  if (isCompleted && currentProgress.status !== "completed") {
    await awardChallengeReward(uid, challenge);
    notifyChallengeLive(challenge);
  }
}

/**
 * Attribue la récompense d'un défi
 */
async function awardChallengeReward(uid: string, challenge: Challenge): Promise<void> {
  const userRef = doc(db, 'users', uid);

  try {
    if (challenge.reward.type === "title") {
      // Débloquer le titre en utilisant le slug généré
      const titleSlug = generateSlug(challenge.reward.value);
      await updateDoc(userRef, {
        [`titles.${titleSlug}`]: "unlocked"
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
    } else if (challenge.reward.type === "badge") {
      // Système de badges (à implémenter si besoin)
      await updateDoc(userRef, {
        [`badges.${challenge.reward.value}`]: true
      });
    } else if (challenge.reward.type === "points") {
      // Points (à implémenter si besoin)
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const currentPoints = userSnap.data().challenge_points || 0;
        await updateDoc(userRef, {
          challenge_points: currentPoints + (challenge.reward.points || 0)
        });
      }
    }
  } catch (error) {
    console.error('Error awarding challenge reward:', error);
  }
}

/**
 * Notifie l'utilisateur qu'un défi est complété
 */
function notifyChallengeLive(challenge: Challenge): void {
  const rewardText = challenge.reward.type === "title"
    ? `Titre débloqué: ${challenge.reward.value}`
    : challenge.reward.type === "dice_skin"
      ? `Nouveau dé: ${challenge.reward.value.split('_').join(' ')}`
      : "Récompense débloquée!";

  toast.success(`🏆 Défi complété: ${challenge.title}`, {
    description: rewardText,
    duration: 5000,
  });
}

// ============================================
// FONCTIONS SPÉCIALISÉES PAR TYPE D'ÉVÉNEMENT
// ============================================

/**
 * Track un lancer de dés
 */
export async function trackDiceRoll(
  uid: string,
  diceType: number,
  result: number,
  isCritical: boolean = false
): Promise<void> {
  // Track le lancer basique
  await trackEvent({ uid, event: "dice_roll", value: 1 });

  // Track les critiques
  if (isCritical && result === 20) {
    await trackEvent({ uid, event: "critical_success", value: 1 });
  } else if (isCritical && result === 1) {
    await trackEvent({ uid, event: "critical_fail", value: 1 });
  }

  // Vérifie les défis de moyenne (sera fait périodiquement)
  await checkAverageChallenge(uid, diceType, result);
}

/**
 * Track un message de chat
 */
export async function trackChatMessage(uid: string): Promise<void> {
  await trackEvent({ uid, event: "chat_message", value: 1 });
}

/**
 * Track l'acquisition d'un objet
 */
export async function trackItemAcquired(
  uid: string,
  category?: string
): Promise<void> {
  await trackEvent({ uid, event: "item_acquired", value: 1 });

  // Track spécifiquement les armes
  if (category === "armes-contact" || category === "armes-distance") {
    await trackEvent({ uid, event: "weapon_acquired", value: 1 });
  }
}

/**
 * Track l'apprentissage d'une compétence
 */
export async function trackSkillLearned(uid: string): Promise<void> {
  await trackEvent({ uid, event: "skill_learned", value: 1 });
}

/**
 * Track un level up
 */
export async function trackLevelUp(uid: string, newLevel: number): Promise<void> {
  await trackEvent({ uid, event: "level_up", value: 1, metadata: { newLevel } });

  // Vérifie les défis de seuil de niveau
  await checkLevelThresholdChallenges(uid, newLevel);
}

/**
 * Track une victoire en combat
 */
export async function trackCombatWon(
  uid: string,
  enemyType?: string,
  enemyLevel?: number
): Promise<void> {
  await trackEvent({ uid, event: "combat_won", value: 1, metadata: { enemyType, enemyLevel } });

  // Vérifie si c'est un dragon
  if (enemyType?.toLowerCase().includes("dragon") && enemyLevel && enemyLevel >= 15) {
    await trackEvent({ uid, event: "dragon_defeated", value: 1 });
  }
}

/**
 * Track des dégâts infligés
 */
export async function trackDamageDealt(uid: string, damage: number): Promise<void> {
  await trackEvent({ uid, event: "damage_dealt", value: damage });
}

/**
 * Track le temps passé (appelé depuis TimeTracker)
 */
export async function trackTimeSpent(uid: string, minutes: number): Promise<void> {
  await checkTimeBasedChallenges(uid, minutes);
}

// ============================================
// VÉRIFICATIONS SPÉCIALISÉES
// ============================================

/**
 * Vérifie les défis basés sur le temps
 */
async function checkTimeBasedChallenges(uid: string, totalMinutes: number): Promise<void> {
  const challenges = getAllChallenges().filter(
    c => c.condition.type === "time_based"
  );

  for (const challenge of challenges) {
    const progressRef = doc(db, `users/${uid}/challenge_progress/${challenge.id}`);
    const progressSnap = await getDoc(progressRef);

    if (!progressSnap.exists()) continue;

    const progress = progressSnap.data() as ChallengeProgress;

    if (progress.status === "completed") continue;

    const target = challenge.condition.target;
    const isCompleted = totalMinutes >= target;

    if (isCompleted && progress.status !== "completed") {
      await updateDoc(progressRef, {
        progress: totalMinutes,
        status: "completed",
        completedAt: Timestamp.now(),
        lastUpdated: Timestamp.now()
      });

      await awardChallengeReward(uid, challenge);
      notifyChallengeLive(challenge);
    } else if (totalMinutes < target) {
      await updateDoc(progressRef, {
        progress: totalMinutes,
        status: "in_progress",
        lastUpdated: Timestamp.now()
      });
    }
  }
}

/**
 * Vérifie les défis de seuil de niveau
 */
async function checkLevelThresholdChallenges(uid: string, currentLevel: number): Promise<void> {
  const challenges = getAllChallenges().filter(
    c => c.condition.type === "threshold" && c.condition.context?.stat === "niveau"
  );

  for (const challenge of challenges) {
    const progressRef = doc(db, `users/${uid}/challenge_progress/${challenge.id}`);
    const progressSnap = await getDoc(progressRef);

    if (!progressSnap.exists()) continue;

    const progress = progressSnap.data() as ChallengeProgress;

    if (progress.status === "completed") continue;

    const target = challenge.condition.target;
    const isCompleted = currentLevel >= target;

    if (isCompleted) {
      await updateDoc(progressRef, {
        progress: currentLevel,
        status: "completed",
        completedAt: Timestamp.now(),
        lastUpdated: Timestamp.now()
      });

      await awardChallengeReward(uid, challenge);
      notifyChallengeLive(challenge);
    } else {
      await updateDoc(progressRef, {
        progress: currentLevel,
        status: "in_progress",
        lastUpdated: Timestamp.now()
      });
    }
  }
}

/**
 * Vérifie les défis de moyenne de dés (ex: moyenne >= 15 sur 20 lancers)
 */
async function checkAverageChallenge(uid: string, diceType: number, result: number): Promise<void> {
  if (diceType !== 20) return; // Pour l'instant, seulement pour d20

  const challenge = getChallengeById("high_roller");
  if (!challenge) return;

  const progressRef = doc(db, `users/${uid}/challenge_progress/${challenge.id}`);
  const progressSnap = await getDoc(progressRef);

  if (!progressSnap.exists()) return;

  const progress = progressSnap.data() as ChallengeProgress;

  if (progress.status === "completed") return;

  // Récupère ou initialise les métadonnées de tracking
  const metadata = progress.metadata || { rolls: [], totalRolls: 0 };
  metadata.rolls = metadata.rolls || [];
  metadata.totalRolls = metadata.totalRolls || 0;

  // Ajoute le nouveau résultat
  metadata.rolls.push(result);
  metadata.totalRolls += 1;

  // Garde seulement les 20 derniers lancers
  if (metadata.rolls.length > 20) {
    metadata.rolls.shift();
  }

  // Calcule la moyenne
  const sum = metadata.rolls.reduce((a: number, b: number) => a + b, 0);
  const average = sum / metadata.rolls.length;

  // Vérifie si le défi est complété
  const isCompleted = metadata.rolls.length >= 20 && average >= 15;

  await updateDoc(progressRef, {
    progress: metadata.rolls.length,
    status: isCompleted ? "completed" : "in_progress",
    metadata: metadata,
    lastUpdated: Timestamp.now(),
    ...(isCompleted && { completedAt: Timestamp.now() })
  });

  if (isCompleted && progress.status !== "completed") {
    await awardChallengeReward(uid, challenge);
    notifyChallengeLive(challenge);
  }
}

/**
 * Vérifie périodiquement tous les défis de seuil (inventaire, stats, etc.)
 */
export async function checkThresholdChallenges(
  uid: string,
  userData: any,
  characterData?: any
): Promise<void> {
  const challenges = getAllChallenges().filter(
    c => c.condition.type === "threshold"
  );

  for (const challenge of challenges) {
    const progressRef = doc(db, `users/${uid}/challenge_progress/${challenge.id}`);
    const progressSnap = await getDoc(progressRef);

    if (!progressSnap.exists()) continue;

    const progress = progressSnap.data() as ChallengeProgress;

    if (progress.status === "completed") continue;

    const stat = challenge.condition.context?.stat;
    let currentValue = 0;

    // Détermine la valeur actuelle selon le stat
    switch (stat) {
      case "inventory_count":
        currentValue = userData.inventory_count || 0;
        break;
      case "gold_count":
        currentValue = userData.gold_count || 0;
        break;
      case "niveau":
        currentValue = characterData?.niveau || 0;
        break;
      case "hp_percentage":
        if (characterData?.PV && characterData?.PV_Max) {
          const percentage = (characterData.PV / characterData.PV_Max) * 100;
          currentValue = percentage;
        }
        break;
      case "any_attribute":
        if (characterData) {
          const attrs = [
            characterData.FOR || 0,
            characterData.DEX || 0,
            characterData.CON || 0,
            characterData.SAG || 0,
            characterData.INT || 0,
            characterData.CHA || 0
          ];
          currentValue = Math.max(...attrs);
        }
        break;
      default:
        continue;
    }

    const target = challenge.condition.target;
    const isCompleted = currentValue >= target;

    if (isCompleted) {
      await updateDoc(progressRef, {
        progress: currentValue,
        status: "completed",
        completedAt: Timestamp.now(),
        lastUpdated: Timestamp.now()
      });

      await awardChallengeReward(uid, challenge);
      notifyChallengeLive(challenge);
    } else {
      await updateDoc(progressRef, {
        progress: currentValue,
        status: "in_progress",
        lastUpdated: Timestamp.now()
      });
    }
  }
}
