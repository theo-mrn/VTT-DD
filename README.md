# 🎲 VTT-DD - Virtual Tabletop pour Dungeons & Dragons

Un Virtual Tabletop (VTT) moderne et complet pour jouer à Dungeons & Dragons en ligne, développé avec Next.js 15, React 18, TypeScript et Firebase.

## 🌟 Fonctionnalités Principales

### 🗺️ Carte Interactive
- **Carte dynamique** avec zoom, déplacement et grille personnalisable
- **Placement de personnages** avec drag & drop
- **Système de brouillard de guerre** par quadrillage
- **Rayon de visibilité** personnalisable pour chaque personnage
- **Tokens** pour représenter joueurs et PNJ
- **Annotations textuelles** directement sur la carte
- **Dessin libre** pour le MJ
- **Upload d'images** pour les fonds de carte

### ⚔️ Système de Combat
- **Combat au tour par tour** avec initiative
- **Système d'attaque** : Contact, Distance, Magie
- **Gestion des PV** en temps réel
- **Interface de combat** dédiée avec statistiques complètes
- **Historique des actions** de combat

### 👥 Gestion des Personnages
- **Fiches de personnages complètes** avec toutes les statistiques D&D
  - Caractéristiques : FOR, DEX, CON, SAG, INT, CHA
  - Stats de combat : PV, Défense, Contact, Distance, Magie, Initiative
  - Niveau et progression
- **Inventaire interactif** avec gestion d'objets
- **Système de compétences** avec recherche et filtrage
- **Création de personnages** avec choix de race et upload d'avatar
- **Bibliothèque d'avatars** pré-générés par race (Humain, Elfe, Nain, Orc, Drakonide, Minotaure, Halfelin)

### 🎵 Lecteur Musical Synchronisé
- **Lecteur YouTube** intégré et synchronisé en temps réel
- **Contrôle MJ** : seul le Maître du Jeu peut charger et contrôler la musique
- **Volume personnel** pour chaque joueur
- **Lecture flottante** : la musique continue même quand le panneau est fermé
- **Synchronisation parfaite** entre tous les joueurs (<1 seconde de décalage)
- **Interface minimaliste** avec titre de la vidéo, play/pause et contrôle de volume

### 🎲 Système de Dés
- **Lanceur de dés** intégré avec support des formules complexes
- **Bibliothèque rpg-dice-roller** pour jets précis
- **Historique des jets** pour tous les joueurs
- **Requêtes de jets** du MJ vers les joueurs

### 🔐 Système d'Authentification & Permissions
- **Authentification Firebase** sécurisée
- **Deux rôles** : Maître du Jeu (MJ) et Joueurs
- **Système de salles** : chaque partie a son propre espace isolé
- **Permissions granulaires** :
  - MJ : contrôle total (carte, personnages, combat, musique)
  - Joueurs : accès limité à leurs personnages et interactions autorisées

### 📚 Wiki & Documentation
- **Système de compétences** avec recherche en temps réel
- **Raccourci clavier** `Ctrl+K` pour recherche rapide
- **Filtrage intelligent** par type et source
- **Descriptions détaillées** des compétences

## 🛠️ Technologies Utilisées

### Frontend
- **Next.js 15** - Framework React avec App Router
- **React 18** - Bibliothèque UI
- **TypeScript** - Typage statique
- **Tailwind CSS** - Framework CSS utility-first
- **shadcn/ui** - Composants UI modernes
- **Framer Motion** - Animations fluides
- **Lucide React** - Icônes

### Backend & Base de Données
- **Firebase Authentication** - Gestion des utilisateurs
- **Firebase Firestore** - Base de données NoSQL pour les données de jeu
- **Firebase Realtime Database** - Synchronisation temps réel pour la musique
- **Firebase Storage** - Stockage des images et avatars

### Bibliothèques Spécialisées
- **react-youtube** - Intégration YouTube
- **@dice-roller/rpg-dice-roller** - Système de dés
- **react-easy-crop** - Recadrage d'images
- **recharts** - Graphiques et statistiques
- **lodash** - Utilitaires JavaScript

## 🚀 Installation

### Prérequis
- Node.js 18+ 
- npm ou pnpm
- Compte Firebase

### Configuration

1. **Cloner le repository**
```bash
git clone <votre-repo>
cd VTT-DD
```

2. **Installer les dépendances**
```bash
npm install
# ou
pnpm install
```

3. **Configuration Firebase**

Créez un projet Firebase et activez :
- Authentication (Email/Password)
- Firestore Database
- Realtime Database
- Storage

Configurez les variables dans `src/lib/firebase.js` :
```javascript
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_AUTH_DOMAIN",
  databaseURL: "VOTRE_DATABASE_URL",
  projectId: "VOTRE_PROJECT_ID",
  storageBucket: "VOTRE_STORAGE_BUCKET",
  messagingSenderId: "VOTRE_MESSAGING_SENDER_ID",
  appId: "VOTRE_APP_ID",
  measurementId: "VOTRE_MEASUREMENT_ID"
};
```

4. **Règles de sécurité Firebase**

**Firestore :**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /cartes/{roomId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Realtime Database :**
```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        "music": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}
```

5. **Lancer le projet**
```bash
npm run dev
```

Le projet sera accessible sur `http://localhost:3000`

## 📁 Structure du Projet

```
VTT-DD/
├── public/
│   ├── Assets/          # Avatars pré-générés par race
│   ├── Cartes/          # Fonds de carte (Forêt, Village, etc.)
│   ├── Musics/          # Musiques d'ambiance locales
│   ├── Photos/          # Banque d'images de personnages
│   ├── Token/           # Tokens pour la carte
│   └── tabs/            # Données JSON des compétences
├── src/
│   ├── app/
│   │   ├── [roomid]/    # Pages de salle de jeu
│   │   │   ├── map/     # Carte interactive
│   │   │   └── dice/    # Lanceur de dés
│   │   ├── auth/        # Authentification
│   │   ├── creation/    # Création de personnage
│   │   ├── personnages/ # Liste des personnages
│   │   └── profile/     # Profil utilisateur
│   ├── components/
│   │   ├── ui/          # Composants shadcn/ui
│   │   ├── SyncedYouTubePlayer.tsx    # Lecteur musical
│   │   ├── FloatingMusic.tsx          # Panneau musical flottant
│   │   ├── CharacterSheet.tsx         # Fiche de personnage
│   │   ├── combat2.tsx                # Système de combat
│   │   ├── dice-roller.tsx            # Lanceur de dés
│   │   └── ...
│   ├── contexts/
│   │   ├── GameContext.tsx            # État global du jeu
│   │   └── CompetencesContext.tsx     # Système de compétences
│   └── lib/
│       ├── firebase.js                # Configuration Firebase
│       └── utils.ts                   # Utilitaires
└── README.md
```

## 🎮 Guide d'Utilisation

### Pour le Maître du Jeu (MJ)

1. **Créer une salle** et partager le code avec les joueurs
2. **Uploader une carte** de fond
3. **Ajouter des personnages** (joueurs et PNJ) sur la carte
4. **Gérer le brouillard de guerre** pour révéler la carte progressivement
5. **Lancer un combat** et gérer l'initiative
6. **Charger de la musique d'ambiance** via YouTube
7. **Créer des annotations** et dessiner sur la carte

### Pour les Joueurs

1. **Rejoindre une salle** avec le code fourni par le MJ
2. **Sélectionner ou créer un personnage**
3. **Déplacer votre token** sur la carte (si autorisé)
4. **Gérer votre fiche de personnage** (inventaire, compétences, stats)
5. **Participer au combat** lors de votre tour
6. **Lancer des dés** pour vos actions
7. **Ajuster le volume** de la musique d'ambiance

## 🔑 Raccourcis Clavier

- `Ctrl + K` / `Cmd + K` : Recherche de compétences
- `Ctrl + M` / `Cmd + M` : Ouvrir le lecteur musical (si configuré dans Sidebar)

## 🎨 Personnalisation

### Thème
Le projet utilise Tailwind CSS avec support du mode sombre via `next-themes`.

### Avatars
- Ajoutez vos propres avatars dans `public/Photos/[Race]/`
- Format recommandé : WebP pour optimisation

### Cartes
- Ajoutez vos cartes dans `public/Cartes/[Type]/`
- Formats supportés : WebP, PNG, JPG

### Musiques
- Utilisez YouTube via le lecteur synchronisé
- Ou ajoutez des fichiers MP3 dans `public/Musics/[Type]/`

## 🐛 Débogage

### Problèmes courants

**La musique ne se synchronise pas :**
- Vérifiez que Realtime Database est activé dans Firebase
- Vérifiez les règles de sécurité
- Ouvrez la console (F12) pour voir les logs

**Les personnages ne s'affichent pas :**
- Vérifiez que vous êtes bien dans une salle
- Vérifiez les permissions Firestore
- Rechargez la page

**Erreur d'authentification :**
- Vérifiez la configuration Firebase
- Vérifiez que Authentication est activé

## 📊 Statistiques du Projet

- **2696 lignes** dans la page principale de carte
- **480+ lignes** pour le lecteur musical synchronisé
- **1500+ assets** (avatars, cartes, tokens)
- **160+ fichiers JSON** de compétences
- Support de **7 races** jouables

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :
- Reporter des bugs
- Proposer de nouvelles fonctionnalités
- Améliorer la documentation
- Ajouter des assets (cartes, tokens, avatars)

## 📝 License

Ce projet est destiné à un usage personnel et éducatif.

## 🎯 Roadmap

- [ ] Système de chat en temps réel
- [ ] Macros personnalisables
- [ ] Import/Export de personnages
- [ ] Système de sons d'ambiance avec zones
- [ ] Animations de combat
- [ ] Feuilles de personnages personnalisables
- [ ] Support de plus de systèmes de jeu
- [ ] Mode spectateur
- [ ] Enregistrement de sessions

## 💡 Inspirations

Ce projet s'inspire de VTT populaires comme Roll20, Foundry VTT et Owlbear Rodeo, tout en apportant une expérience moderne et optimisée pour D&D 5e.

---

**Développé avec ❤️ pour la communauté JDR**

🎲 Bon jeu ! 🎲
