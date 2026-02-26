# Système de Défis - VTT-DD

Un système complet de défis (challenges/achievements) pour récompenser et engager les joueurs.

## Fonctionnalités

✅ **29 défis uniques** répartis en 7 catégories
✅ **4 niveaux de difficulté** (Facile, Moyen, Difficile, Légendaire)
✅ **Récompenses automatiques** (Titres et skins de dés)
✅ **Tracking en temps réel** de tous les événements du jeu
✅ **UI moderne** avec progression visuelle
✅ **Notifications** à la complétion
✅ **Persistance Firebase** complète

## Architecture

```
/src/lib/
  challenges.ts          # Définitions des défis et opérations Firebase
  challenge-tracker.ts   # Système de tracking d'événements

/src/components/(challenges)/
  challenge-card.tsx     # Carte individuelle de défi
  challenges-modal.tsx   # Modal principal avec filtres
  challenges-button.tsx  # Bouton d'accès rapide (3 variantes)
```

## Catégories de Défis

### 🎲 Dés
- Lancers de dés
- Critiques (succès et échecs)
- Moyennes et statistiques
- Séquences consécutives

### ⚔️ Combat
- Victoires en combat
- Dégâts infligés
- Survie héroïque
- Boss spéciaux (dragons)

### 🗺️ Exploration
- Temps de jeu
- Sessions continues
- Découvertes

### 💬 Social
- Messages de chat
- Participation aux discussions
- Roleplay

### 📈 Progression
- Montée en niveau
- XP accumulée
- Caractéristiques

### 🎒 Collection
- Objets obtenus
- Armes collectées
- Richesse accumulée

### 🎓 Maîtrise
- Compétences apprises
- Expertise technique

## Utilisation Rapide

### 1. Ajouter le bouton dans votre UI

```tsx
import { ChallengesButton } from '@/components/(challenges)/challenges-button';

// Bouton classique
<ChallengesButton variant="default" />

// Icône seule (pour navbar)
<ChallengesButton variant="icon" />

// Bouton flottant (en bas à droite)
<ChallengesButton variant="floating" />
```

### 2. Tracker un événement

```tsx
import { trackDiceRoll, trackChatMessage } from '@/lib/challenge-tracker';

// Après un lancer de dés
await trackDiceRoll(uid, 20, result, isCritical);

// Après un message
await trackChatMessage(uid);
```

## Défis Disponibles

### Dés (8 défis)
1. **Premier Lancer** - Lancez votre premier dé → Titre
2. **Enthousiaste des Dés** - Lancez 50 dés → Titre
3. **Maître des Dés** - Lancez 500 dés → Skin "Os Ancien"
4. **Coup Critique** - Obtenez un 20 naturel → Titre
5. **Triple Chance** - 3 critiques consécutifs → Skin "Lumière Stellaire"
6. **Survivant Malchanceux** - 10 échecs critiques → Titre
7. **Grand Parieur** - Moyenne 15+ sur 20 d20 → Skin "Écaille de Dragon"
8. **Sept Chanceux** - 7 critiques au total → Skin "Pierre de Lune"

### Social (3 défis)
1. **Première Parole** - Premier message → Titre
2. **Bavard** - 100 messages → Titre
3. **Conteur Légendaire** - 500 messages → Titre

### Progression (3 défis)
1. **Aventurier Confirmé** - Niveau 5 → Titre
2. **Héros Accompli** - Niveau 10 → Skin "Marbre Royal"
3. **Légende Vivante** - Niveau 20 → Skin "Cosmos"

### Collection (4 défis)
1. **Premier Trésor** - Premier objet → Titre
2. **Accumulateur** - 50 objets → Titre
3. **Fortuné** - 1000 pièces d'or → Skin "Merveille"
4. **Collectionneur d'Armes** - 10 armes → Titre

### Exploration (3 défis)
1. **Première Aventure** - 5 minutes → Titre
2. **Aventurier Chevronné** - 10 heures → Skin "Écorce Ancienne"
3. **Marathonien** - 50 heures → Skin "Nébuleuse"

### Maîtrise (3 défis)
1. **Étudiant Assidu** - 5 compétences → Titre
2. **Polyvalent** - 15 compétences → Skin "Parchemin Ancien"
3. **Perfection Absolue** - 20 dans une stat → Skin "Cyber Neon"

### Combat (5 défis)
1. **Première Victoire** - Premier combat → Titre
2. **Vétéran de Guerre** - 25 combats → Titre
3. **Survivant Ultime** - <5% PV → Skin "Pacte de Sang"
4. **Destructeur** - 1000 dégâts → Skin "Roche Volcanique"
5. **Tueur de Dragons** - Tuer un dragon 15+ → Titre

## Intégration

Voir [CHALLENGES_INTEGRATION_GUIDE.md](../../../CHALLENGES_INTEGRATION_GUIDE.md) pour le guide complet d'intégration.

### Points d'intégration essentiels

1. **dice-roller.tsx** - Tracking des lancers
2. **Chat.tsx** - Tracking des messages
3. **Inventaire.tsx** - Tracking des objets
4. **CharacterContext.tsx** - Tracking des niveaux
5. **TimeTracker.tsx** - Tracking du temps

## API du Tracker

### Fonctions principales

```typescript
// Dés
trackDiceRoll(uid, diceType, result, isCritical)

// Social
trackChatMessage(uid)

// Collection
trackItemAcquired(uid, category?)

// Progression
trackLevelUp(uid, newLevel)
trackSkillLearned(uid)

// Combat
trackCombatWon(uid, enemyType?, enemyLevel?)
trackDamageDealt(uid, damage)

// Temps
trackTimeSpent(uid, minutes)

// Vérifications périodiques
checkThresholdChallenges(uid, userData, characterData)
```

## Structure Firebase

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
        - currentStreak: number
        - metadata: object
```

## Personnalisation

### Ajouter un nouveau défi

Dans `/src/lib/challenges.ts` :

```typescript
export const CHALLENGES: Record<string, Challenge> = {
  // ... défis existants

  my_new_challenge: {
    id: "my_new_challenge",
    title: "Mon Nouveau Défi",
    description: "Description du défi",
    category: "dice", // ou autre catégorie
    difficulty: "medium",
    condition: {
      type: "reach_count",
      target: 10,
      context: { event: "dice_roll" }
    },
    reward: {
      type: "title", // ou "dice_skin"
      value: "Mon Titre"
    },
    icon: "🎯",
    active: true,
    order: 30
  }
};
```

### Ajouter une nouvelle récompense de skin

Utilisez un ID de skin existant de `/src/components/(dices)/dice-definitions.ts` :

```typescript
reward: {
  type: "dice_skin",
  value: "jade" // ou n'importe quel skin existant
}
```

## Notifications

Le système utilise `sonner` pour afficher des toasts :

```typescript
🏆 Défi complété: Premier Lancer
Titre débloqué: Apprenti Lanceur
```

## Performance

- Les défis sont vérifiés uniquement quand un événement pertinent se produit
- Mise à jour en temps réel via Firestore listeners
- Caching local du compteur de défis complétés
- Rechargement périodique (5s) quand le modal est ouvert

## Support Premium

Pour restreindre des défis aux premium :

```typescript
my_premium_challenge: {
  // ...
  isPremium: true,
  // ...
}
```

Puis filtrer dans l'UI selon `userData.premium`.

## Debug

Pour tester rapidement un défi :

```typescript
import { trackEvent } from '@/lib/challenge-tracker';

// Déclencher manuellement un événement
await trackEvent({
  uid: 'USER_ID',
  event: 'dice_roll',
  value: 50 // Compléter directement
});
```

## Compatibilité

✅ Next.js 14+
✅ React 18+
✅ Firebase v9+
✅ TypeScript
✅ Tailwind CSS

## Licence

Système propriétaire pour VTT-DD
