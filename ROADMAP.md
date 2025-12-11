# 🗺️ Roadmap & Features Manquantes - VTT D&D

Suite à l'analyse de ta codebase, voici la liste des fonctionnalités essentielles qui manquent actuellement pour transformer ton projet en un Virtual Tabletop (VTT) complet et compétitif (type FoundryVTT ou Roll20).

## 🚨 Phase 1 : Cœur du Gameplay (Priorité Haute)

Ce sont les éléments bloquants pour une partie fluide.

### 1. Combat Tracker (Tour par Tour)
**État actuel :** *Inexistant.* Le combat est géré action par action dans une modale, mais il n'y a pas de vue globale.
**À ajouter :**
- [ ] Une **Sidebar "Initiative"** qui liste tous les combattants triés par score d'initiative.
- [ ] Bouton "Tour Suivant" pour le MJ qui cycle automatiquement le tour du joueur actif.
- [ ] Indicateur visuel sur la Map et dans la liste pour montrer qui doit jouer.
- [ ] Gestion des **Conditions/Effets** (ex: Empoisonné, À terre) avec compteurs de tours.

### 2. Gestion des Calques (Layers) sur la Map
**État actuel :** *Monocouche.* Tout est mélangé (Joueurs, PNJ, Dessins, Notes).
**À ajouter :**
- [ ] **Background Layer** : Juste pour la carte (images), inaltérable par les joueurs.
- [ ] **Token Layer** : Pour les personnages et monstres.
- [ ] **Object/Drawing Layer** : Pour les notes, dessins tactiques.
- [ ] **GM Layer** : Tokens et notes visibles UNIQUEMENT par le MJ (ex: monstres cachés, pièges).

### 3. Fiches de Personnage & Statuts Liés
**État actuel :** *Partiel.* Les fiches existent mais la liaison avec les tokens sur la map est limitée.
**À ajouter :**
- [ ] **Barres de vie dynamiques** au-dessus des tokens sur la map (visibles au survol).
- [ ] Synchronisation temps réel : Modifier les HP sur la map met à jour la fiche et inversement.

---

## 🎲 Phase 2 : Immersion (Priorité Moyenne)

Pour "l'effet Wow" et le plaisir de jeu.

### 4. Dés 3D (Physics)
**État actuel :** *Texte uniquement.* Le lanceur de dés est fonctionnel mais purement mathématique.
**À ajouter :**
- [ ] Intégration de **React-Three-Fiber** + Cannon.js pour de vrais dés 3D qui roulent sur l'écran par-dessus l'interface.
- [ ] Personnalisation des couleurs de dés par joueur.

### 5. Soundboard (SFX)
**État actuel :** *Musique YouTube uniquement.* Pas de sons instantanés.
**À ajouter :**
- [ ] Une grille de boutons pour le MJ pour lancer des **SFX** (bruit d'épée, explosion, cri de monstre).
- [ ] Upload de fichiers MP3/WAV courts dans Firebase Storage.

---

## ⚡ Phase 3 : Automatisation & QoL (Priorité Basse)

Pour accélérer le jeu.

### 6. Chat Amélioré & Commandes
**État actuel :** *Basique.* Juste du texte et des images.
**À ajouter :**
- [ ] **Slash Commands** : `/roll 1d20+5`, `/w [nom] message` (chuchoter).
- [ ] **Lancers cliquables** : Si je clique sur "Attaque" dans le chat, ça peut relancer les dégâts.

### 7. Compendium Drag & Drop
**État actuel :** *Wiki statique.*
**À ajouter :**
- [ ] Une base de données (Sorts, Items, Monstres) dans une sidebar.
- [ ] **Drag & Drop** : Glisser une épée depuis le compendium vers l'inventaire d'un joueur pour l'ajouter automatiquement.

### 8. Zone de Mesure & Gabarits (Templates)
**État actuel :** *Zéro.* Impossible de mesurer précisément les distances.
**À ajouter :**
- [ ] **Règle** : Tirer un trait qui affiche la distance en mètres/pieds (ex: "9m").
- [ ] **Gabarits de sorts** : Cercles (Boule de feu), Cônes (Souffle de dragon), Carrés.

---

## 🛠️ Suggestions Techniques

- **Drag & Drop** : Utiliser `dnd-kit` ou `react-dnd` pour gérer les mouvements entre les fenêtres.
- **Canvas** : Si la map devient lente avec beaucoup d'objets, envisager de migrer le rendu de la map vers `Konva.js` ou `PixiJS` au lieu du Canvas HTML5 natif brut.
