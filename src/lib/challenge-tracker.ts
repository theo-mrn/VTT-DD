import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
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
import { gameEventBus } from '@/modules/event-bus';

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
      let currentProgress = progressMap[challenge.id];

      // Si le doc n'existe pas encore (joueur qui n'a jamais ouvert la modale),
      // on part d'une progression vierge plutôt que d'ignorer l'événement.
      if (!currentProgress) {
        currentProgress = {
          challengeId: challenge.id,
          status: "in_progress",
          progress: 0,
          attempts: 0,
          lastUpdated: new Date(),
        };
      }

      if (currentProgress.status === "completed") continue;

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
      newProgress = (currentProgress.progress || 0) + value;
      newStatus = "in_progress";
      break;

    case "consecutive":
      // Nécessite consécutivité
      if (challenge.condition.context?.consecutive) {
        if (metadata?.isConsecutive) {
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
      newProgress = (currentProgress.progress || 0) + value;
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
  const finalStatus = isCompleted ? "completed" : newStatus;

  // SKIP write if absolutely nothing changed
  if (
    newProgress === (currentProgress.progress || 0) &&
    finalStatus === (currentProgress.status || "in_progress") &&
    currentStreak === (currentProgress.currentStreak || 0)
  ) {
    return;
  }

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

  // setDoc + merge : crée le doc si le joueur n'a jamais ouvert la modale des défis.
  updateData.challengeId = challenge.id;
  await setDoc(progressRef, updateData, { merge: true });

  // Si complété, attribue la récompense et notifie
  if (isCompleted) {
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
  // Emit to module event bus
  gameEventBus.emit({ type: 'dice:roll', payload: { userId: uid, diceCount: 1, diceFaces: diceType, results: [result], total: result, modifier: 0 } });
  if (isCritical && result === 20) {
    gameEventBus.emit({ type: 'dice:critical_success', payload: { userId: uid, result } });
  } else if (isCritical && result === 1) {
    gameEventBus.emit({ type: 'dice:critical_fail', payload: { userId: uid, result } });
  }

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
  gameEventBus.emit({ type: 'chat:message', payload: { userId: uid, text: '' } });
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
  gameEventBus.emit({ type: 'character:update', payload: { characterId: uid, changes: { niveau: newLevel } } });
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
  gameEventBus.emit({ type: 'combat:end', payload: { winnerId: uid } });
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
  gameEventBus.emit({ type: 'combat:damage', payload: { attackerId: uid, targetId: '', amount: damage } });
  await trackEvent({ uid, event: "damage_dealt", value: damage });
}

/**
 * Crédite des dégâts réellement infligés au joueur propriétaire du personnage
 * attaquant. Appelé côté MJ (qui valide les dégâts dans MJcombat) : on doit donc
 * retrouver l'uid du JOUEUR à partir du persoId de l'attaquant, et non créditer le MJ.
 *
 * Ne crédite rien si l'attaquant n'est pas un personnage joueur (PNJ, monstre…)
 * ou si aucun utilisateur ne possède ce personnage dans la salle.
 */
export async function trackDamageDealtByCharacter(
  roomId: string,
  attackerPersoId: string,
  damage: number
): Promise<void> {
  if (!roomId || !attackerPersoId || !damage || damage <= 0) return;

  try {
    // 1. L'attaquant doit être un personnage de type "joueurs"
    const charSnap = await getDoc(doc(db, `cartes/${roomId}/characters/${attackerPersoId}`));
    if (!charSnap.exists()) return;
    if (charSnap.data().type !== 'joueurs') return;

    // 2. Retrouver l'uid du joueur qui possède ce personnage dans cette salle
    const usersQuery = query(
      collection(db, 'users'),
      where('room_id', '==', roomId),
      where('persoId', '==', attackerPersoId)
    );
    const usersSnap = await getDocs(usersQuery);
    if (usersSnap.empty) return;

    const ownerUid = usersSnap.docs[0].id;
    await trackDamageDealt(ownerUid, damage);
  } catch (error) {
    console.error('Error tracking damage by character:', error);
  }
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

    // Normalisation
    const oldProgress = progress.progress || 0;

    // SKIP write if value hasn't actually progressed
    if (oldProgress === totalMinutes) continue;

    const target = challenge.condition.target;
    const isCompleted = totalMinutes >= target;

    if (isCompleted) {
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

  if (isCompleted) {
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

    // Normalisation des valeurs pour la comparaison
    const oldProgress = progress.progress || 0;
    const oldStatus = progress.status || "in_progress";
    const newStatus = isCompleted ? "completed" : "in_progress";

    // SKIP write if the value is strictly the same and status hasn't changed.
    if (oldProgress === currentValue && oldStatus === newStatus) {
      continue;
    }

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

// ============================================
// RECALCUL COMPLET DEPUIS L'ÉTAT RÉEL
// ============================================

/**
 * Agrège l'état réel du joueur depuis Firestore (perso, inventaire, combats).
 * Sert de source de vérité pour recalculer la progression des défis count/threshold.
 */
interface PlayerStateSnapshot {
  niveau: number;
  maxAttribute: number;
  skillsLearned: number;
  itemCount: number;
  distinctWeapons: number;
}

async function aggregatePlayerState(uid: string): Promise<PlayerStateSnapshot | null> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return null;

  const userData = userSnap.data();
  const roomId: string | undefined = userData.room_id;
  const persoId: string | undefined = userData.persoId;

  const state: PlayerStateSnapshot = {
    niveau: 0,
    maxAttribute: 0,
    skillsLearned: 0,
    itemCount: 0,
    distinctWeapons: 0,
  };

  if (!roomId || !persoId) return state;

  // 1. Personnage : niveau, caractéristiques, compétences apprises (rangs de voies v1..v10)
  const charSnap = await getDoc(doc(db, `cartes/${roomId}/characters/${persoId}`));
  let nomperso: string | undefined;

  if (charSnap.exists()) {
    const c = charSnap.data();
    nomperso = c.Nomperso;
    state.niveau = Number(c.niveau) || 0;

    // Caractéristiques : on prend la valeur finale (_F) si disponible, sinon la base
    const attrKeys = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'] as const;
    state.maxAttribute = Math.max(
      0,
      ...attrKeys.map(k => Number(c[`${k}_F`] ?? c[k]) || 0)
    );

    // Compétences apprises = somme des rangs des voies (chaque rang = 1 compétence débloquée)
    let skills = 0;
    for (let i = 1; i <= 10; i++) {
      skills += Number(c[`v${i}`]) || 0;
    }
    state.skillsLearned = skills;
  }

  // 2. Inventaire : nombre total d'objets + nombre d'armes distinctes
  if (nomperso) {
    const invSnap = await getDocs(collection(db, `Inventaire/${roomId}/${nomperso}`));
    const weaponNames = new Set<string>();
    invSnap.forEach(d => {
      const item = d.data();
      state.itemCount += Number(item.quantity) || 1;
      const cat: string = item.category || '';
      if (cat === 'armes-contact' || cat === 'armes-distance') {
        weaponNames.add(item.message);
      }
    });
    state.distinctWeapons = weaponNames.size;
  }

  // Note : les dégâts totaux ne sont PAS recalculés ici. Les rapports de combat
  // sont supprimés au fil de l'eau, donc ils ne sont pas une source fiable.
  // Le défi "dégâts infligés" (type accumulate) est alimenté en direct par
  // trackDamageDealt() depuis le module de combat.

  return state;
}

/**
 * Associe chaque défi à la valeur réelle calculée depuis l'état du joueur.
 */
function resolveChallengeValue(challenge: Challenge, state: PlayerStateSnapshot): number | null {
  const ctx = challenge.condition.context || {};

  // Défis de seuil (stat)
  switch (ctx.stat) {
    case 'niveau':
      return state.niveau;
    case 'any_attribute':
      return state.maxAttribute;
    case 'inventory_count':
      return state.itemCount;
  }

  // Défis basés sur un événement (count / accumulate)
  switch (ctx.event) {
    case 'skill_learned':
      return state.skillsLearned;
    case 'item_acquired':
      return state.itemCount;
    case 'weapon_acquired':
      return state.distinctWeapons;
  }

  return null; // Géré par un autre mécanisme (dés, chat, temps, dégâts en direct…)
}

/**
 * Recalcule la progression de tous les défis dérivables de l'état du joueur.
 * Idempotent : à appeler à l'ouverture de la modale des défis. Rattrape toute
 * la progression existante sans dépendre d'événements émis au fil de l'eau.
 */
export async function recalculateChallengesFromState(uid: string): Promise<void> {
  if (!uid) return;

  try {
    const state = await aggregatePlayerState(uid);
    if (!state) return;

    const challenges = getAllChallenges();

    for (const challenge of challenges) {
      const currentValue = resolveChallengeValue(challenge, state);
      if (currentValue === null) continue;

      const progressRef = doc(db, `users/${uid}/challenge_progress/${challenge.id}`);
      const progressSnap = await getDoc(progressRef);
      const progress = progressSnap.exists()
        ? (progressSnap.data() as ChallengeProgress)
        : null;

      if (progress?.status === 'completed') continue;

      const target = challenge.condition.target;
      const isCompleted = currentValue >= target;
      const oldProgress = progress?.progress || 0;
      const oldStatus = progress?.status || 'locked';
      const newStatus = isCompleted ? 'completed' : 'in_progress';

      // Rien n'a changé → pas d'écriture
      if (progress && oldProgress === currentValue && oldStatus === newStatus) {
        continue;
      }

      const updateData: any = {
        challengeId: challenge.id,
        progress: currentValue,
        status: newStatus,
        attempts: progress?.attempts || 0,
        lastUpdated: Timestamp.now(),
      };
      if (!progress?.startedAt && currentValue > 0) {
        updateData.startedAt = Timestamp.now();
      }
      if (isCompleted) {
        updateData.completedAt = Timestamp.now();
      }

      // setDoc avec merge : crée le doc s'il n'existe pas encore
      await setDoc(progressRef, updateData, { merge: true });

      if (isCompleted) {
        await awardChallengeReward(uid, challenge);
        notifyChallengeLive(challenge);
      }
    }
  } catch (error) {
    console.error('Error recalculating challenges from state:', error);
  }
}
