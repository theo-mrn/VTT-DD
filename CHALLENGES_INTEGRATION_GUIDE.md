# Guide d'Intégration du Système de Défis

Ce guide explique comment intégrer le système de défis dans votre application VTT-DD.

## Fichiers Créés

1. **`/src/lib/challenges.ts`** - Définitions des défis et fonctions Firebase
2. **`/src/lib/challenge-tracker.ts`** - Système de tracking d'événements
3. **`/src/components/(challenges)/challenge-card.tsx`** - Composant carte de défi
4. **`/src/components/(challenges)/challenges-modal.tsx`** - Modal principal des défis

## Intégrations Requises

### 1. Dans `src/components/(dices)/dice-roller.tsx`

Ajouter après chaque lancer de dés :

```typescript
import { trackDiceRoll } from '@/lib/challenge-tracker';
import { auth } from '@/lib/firebase';

// Dans la fonction handleRoll, après avoir sauvegardé le roll
const isCritical = diceFaces === 20; // ou votre logique de détection
const result = results[0]; // Le résultat du dé

if (auth.currentUser) {
  await trackDiceRoll(
    auth.currentUser.uid,
    diceFaces,
    result,
    isCritical
  );
}
```

**Emplacement**: Ligne ~200-250, après `await addDoc(...)`

### 2. Dans `src/components/(chat)/Chat.tsx`

Ajouter après l'envoi d'un message :

```typescript
import { trackChatMessage } from '@/lib/challenge-tracker';
import { auth } from '@/lib/firebase';

// Dans handleSendMessage, après addDoc
if (auth.currentUser) {
  await trackChatMessage(auth.currentUser.uid);
}
```

**Emplacement**: Ligne ~130-150, après l'envoi du message

### 3. Dans `src/components/(inventaire)/Inventaire.tsx`

Ajouter après l'ajout d'un objet :

```typescript
import { trackItemAcquired } from '@/lib/challenge-tracker';
import { auth } from '@/lib/firebase';

// Dans handleLooting ou handleAddItem, après addDoc
if (auth.currentUser) {
  await trackItemAcquired(
    auth.currentUser.uid,
    category // "armes-contact", "potions", etc.
  );
}
```

**Emplacement**: Ligne ~110-140, après l'ajout d'item

### 4. Dans `src/contexts/CharacterContext.tsx`

Ajouter lors du level up :

```typescript
import { trackLevelUp } from '@/lib/challenge-tracker';
import { auth } from '@/lib/firebase';

// Quand le niveau change
if (auth.currentUser && newLevel > oldLevel) {
  await trackLevelUp(auth.currentUser.uid, newLevel);
}
```

**Emplacement**: Dans la fonction qui met à jour le niveau

### 5. Dans `src/components/TimeTracker.tsx`

Ajouter dans l'intervalle de mise à jour :

```typescript
import { trackTimeSpent } from '@/lib/challenge-tracker';

// Dans le setInterval, après updateDoc
if (user?.uid) {
  await trackTimeSpent(user.uid, totalMinutes);
}
```

**Emplacement**: Ligne ~60, dans le setInterval

### 6. Ajouter un bouton d'accès aux défis

Dans `src/components/profile/tabs/ProfileTab.tsx`, ajouter :

```typescript
import { useState } from 'react';
import { ChallengesModal } from '@/components/(challenges)/challenges-modal';
import { Trophy } from 'lucide-react';

// Dans le composant
const [isChallengesOpen, setIsChallengesOpen] = useState(false);

// Ajouter un bouton quelque part dans l'UI
<button
  onClick={() => setIsChallengesOpen(true)}
  className="flex items-center gap-2"
>
  <Trophy className="w-4 h-4" />
  Mes Défis
</button>

// Ajouter le modal à la fin du return
<ChallengesModal
  isOpen={isChallengesOpen}
  onClose={() => setIsChallengesOpen(false)}
/>
```

### 7. Dans la navigation principale

Ajouter un lien vers les défis dans le menu principal de votre app.

## Tracking des Compétences

Si vous avez un système de compétences, ajouter :

```typescript
import { trackSkillLearned } from '@/lib/challenge-tracker';

// Quand une compétence est apprise
if (auth.currentUser) {
  await trackSkillLearned(auth.currentUser.uid);
}
```

## Tracking du Combat

Si vous avez un système de combat, ajouter :

```typescript
import { trackCombatWon, trackDamageDealt } from '@/lib/challenge-tracker';

// Après une victoire en combat
if (auth.currentUser) {
  await trackCombatWon(
    auth.currentUser.uid,
    enemyType, // "Dragon", "Gobelin", etc.
    enemyLevel // niveau de l'ennemi
  );
}

// Après avoir infligé des dégâts
if (auth.currentUser) {
  await trackDamageDealt(auth.currentUser.uid, damageAmount);
}
```

## Initialisation au Premier Login

Dans votre logique d'authentification principale :

```typescript
import { initializeUserChallenges } from '@/lib/challenges';

// Après qu'un utilisateur se connecte
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await initializeUserChallenges(user.uid);
  }
});
```

## Vérification Périodique des Défis de Seuil

Dans `TimeTracker.tsx` ou un composant similaire :

```typescript
import { checkThresholdChallenges } from '@/lib/challenge-tracker';

// Toutes les 30 secondes par exemple
setInterval(async () => {
  if (user?.uid && userData && characterData) {
    await checkThresholdChallenges(user.uid, userData, characterData);
  }
}, 30000);
```

## Seed Initial des Défis (Optionnel)

Pour peupler Firestore avec les définitions de défis :

```typescript
import { seedChallenges } from '@/lib/challenges';

// À exécuter une seule fois (dans un script admin ou console)
await seedChallenges();
```

## Structure Firebase Attendue

Le système créera automatiquement ces collections :

```
users/
  {uid}/
    challenge_progress/
      {challengeId}/
        - challengeId: string
        - status: "locked" | "in_progress" | "completed"
        - progress: number
        - attempts: number
        - startedAt: timestamp
        - completedAt: timestamp
        - lastUpdated: timestamp
        - currentStreak: number (pour défis consécutifs)
        - metadata: object (données additionnelles)

challenges/ (optionnel, pour admin)
  {challengeId}/
    - [Définition complète du défi]
```

## Nouveaux Titres à Ajouter

Les défis débloqueront ces titres automatiquement. Assurez-vous qu'ils existent dans votre système de titres :

- "Apprenti Lanceur"
- "Lanceur Enthousiaste"
- "Chanceux"
- "Éternel Malchanceux"
- "Orateur Novice"
- "Conteur Bavard"
- "Barde Légendaire"
- "Aventurier Confirmé"
- "Héros Accompli"
- "Légende Vivante"
- "Collectionneur Débutant"
- "Accumulateur Compulsif"
- "Maître d'Armes"
- "Novice Aventurier"
- "Étudiant"
- "Combattant Novice"
- "Vétéran de Guerre"
- "Fléau des Dragons"

## Testing

Pour tester le système :

1. Lancez plusieurs dés → devrait débloquer "Premier Lancer"
2. Envoyez un message → devrait débloquer "Première Parole"
3. Ajoutez un objet → devrait débloquer "Premier Trésor"
4. Jouez 5 minutes → devrait débloquer "Première Aventure"

Vérifiez dans la console Firebase que les données sont bien créées et mises à jour.

## Notifications

Le système affiche automatiquement des notifications toast quand un défi est complété grâce à `sonner` (déjà installé dans votre projet).

## Personnalisation

Vous pouvez facilement :
- Ajouter de nouveaux défis dans `challenges.ts`
- Modifier les récompenses
- Ajuster les seuils de difficulté
- Créer de nouvelles catégories

## Support Premium

Pour restreindre certains défis aux utilisateurs premium :

```typescript
// Dans challenges.ts
my_challenge: {
  // ... autres propriétés
  isPremium: true,
  // ...
}
```

Puis dans l'UI, filtrez les défis selon le statut premium de l'utilisateur.
