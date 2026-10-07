# Feuille de route : les fonctions d'une table virtuelle

> État au 2026-10-07. Liste des fonctions attendues d'une table virtuelle de jeu de rôle (Roll20,
> Foundry, Owlbear…), croisée avec Yner. Les statuts viennent du code et des docs, pas d'un
> test fonction par fonction.

Légende : ✅ dans le code · 🟡 partiel ou à vérifier · ➕ absent.

## Livré depuis le 2026-10-06

Depuis le 2026-10-07, les changements sont poussés directement sur `main` (PR suspendues).

| Fonction                                                                                          | Où                        |
| ------------------------------------------------------------------------------------------------- | ------------------------- |
| Fonctions de la carte branchables, barre d'outils personnalisable, plein écran                    | `main` (#35)              |
| Raccourcis personnalisables partout, aide-mémoire (`?`), jet rapide                               | `main` (#37)              |
| Langue anglaise (next-intl), langue choisie selon le pays                                         | `main` (#38)              |
| Brouillard d'exploration persistant, réglé dans l'outil Brouillard (« Mémoire »)                  | `main` (#38, #40)         |
| Progression du compte : niveaux, XP, défis ; niveau de l'ancienne app repris ; panneau à la table | `main` (#38, #39)         |
| Trajet de déplacement affiché ; durées en rounds                                                  | `main` (#38)              |
| Service marketplace (code)                                                                        | `main` (#38), pas déployé |
| Rail de la table à hauteur plafonnée, défilant                                                    | `main`                    |
| Capacités D&D : résistances en effets, durée d'activation, usages limités, repos complet          | `main`                    |
| Panneau des dés : tous les bonus, synchronisés avec la fiche, une ligne par compétence            | `main`                    |
| Fiche : capacités rangées par état, « Lancer » vers les dés                                       | `main`                    |

## 1. Compte et social

- ✅ Inscription par e-mail, Google ou Discord ; vérification de l'e-mail ; mot de passe oublié
- ✅ Profil : avatar, bannière, bio, cadres, titres à débloquer, temps de jeu
- ✅ Progression du compte : niveaux, XP, défis du jour et de la semaine
- ✅ Amis, profils publics, recherche de joueurs
- ✅ Sessions actives, clés d'API, export des données, suppression de compte
- ✅ Raccourcis clavier sur le compte
- ✅ Français et anglais, langue selon le pays à la première visite
- ➕ Double authentification (TOTP) : rien dans identity
- 🟡 Accessibilité : bases présentes (aria, clavier), pas d'audit

## 2. Campagnes

- ✅ Création, invitation par code ou lien, rôles MJ, joueur et spectateur
- ✅ Système de jeu imposé par la campagne, règles optionnelles activables
- ✅ Salon de campagne, planification de la prochaine séance (accueil, salon)
- ➕ Export ou import d'une campagne entière
- ➕ Dupliquer ou archiver une campagne ; modèles de campagne prêts à jouer (one-shots)

## 3. Personnages et fiches

- ✅ Assistant de création, fiches calculées par le moteur de règles
- ✅ D&D et Star Wars (Aux confins de l'Empire), arbres de talents
- ✅ Inventaire, sorts, portraits, PNJ créés à partir de modèles
- ✅ Historique des modifications
- ✅ Capacités à activer avec durée (s'éteignent seules), usages limités (par tour, combat,
  jour), repos complet
- 🟡 Capacités D&D : 635 au catalogue, dont environ 290 encore en texte seul. Reste à faire :
  jets de sauvegarde imposés à la cible (~30), réactions sur événement (~20), alliés et auras
  (~30), invocations et compagnons (~40)
- 🟡 États D&D sans mécanique : Saignant, Incapacité, Charmé, Désorienté
- 🟡 **Rôdeur** : les 25 capacités portent des textes du Guerrier dès l'ancienne app, contenu à
  fournir
- 🟡 Progression du personnage : XP, montée de niveau guidée
- ➕ Import de fiches externes (D&D Beyond, PDF)
- ➕ Systèmes supplémentaires (Pathfinder, Call of Cthulhu…), ou un éditeur de systèmes pour les MJ

## 4. Carte

- ✅ Fond image ou vidéo, scènes, bibliothèque de cartes, quadrillage calibré
- ✅ Tokens, barres de vie, états, bibliothèque de PNJ, objets à fouiller
- ✅ Dessin, texte, gomme, calques du MJ
- ✅ Murs, portes, fenêtres, murs à sens unique, pièces ; ligne de vue calculée par le serveur
- ✅ Brouillard, lumières, torches portées, vue simulée d'un joueur
- ✅ Mémoire de l'exploration (ce que le groupe a vu reste en gris), dans l'outil Brouillard
- ✅ Portails, mesures, gabarits de sorts, zones sonores, météo
- ✅ Pings, curseurs partagés, bulles, aimantation, barre personnalisable, plein écran
- ✅ Trajet de déplacement affiché
- ➕ Import de cartes avec murs automatiques (Universal VTT / `.dd2vtt`)
- ➕ Élévation des tokens (vol), étages d'un même bâtiment
- 🟡 Vitesse de déplacement D&D à déclarer (`carte.deplacement.attribut`) pour comparer au trajet

## 5. Combat

- ✅ Initiative, tour par tour, barre de combat du MJ
- ✅ Attaque guidée : visée sur la carte, cibles, jets, rapports, dégâts
- ✅ États, PNJ vaincus, rencontres préparées et générées pour le groupe
- ✅ Effets à durée décomptés par round, usages par tour et par combat rendus automatiquement
- 🟡 Durées « tout le combat » (Rage du berserk, Armure du mage) : à couper à la main

## 6. Dés

- ✅ Dés 3D, skins et boutique, formules et macros, jets cachés, historique, statistiques
- ✅ Raccourcis de dés partout à la table, jet rapide
- ✅ Bonus du personnage dans le lanceur, synchronisés avec la fiche ; capacités à invoquer
- ✅ Bot de dés Discord

## 7. Communication

- ✅ Chat, messages privés, indicateur de frappe
- 🟡 Activité Discord : le bot est en ligne, l'activité côté site reste à faire
- ➕ Voix et vidéo intégrées (aujourd'hui, tout passe par Discord)

## 8. Outils du MJ et contenu

- ✅ Notes (par compte et par personnage), projection d'images et de vidéos, documents
- ✅ Ressources du système (compendium), bestiaire, bibliothèque d'objets
- ✅ Recherche ⌘K partout
- ✅ Chronique des événements de la campagne
- ➕ Résumé de séance rédigé (journal de campagne)
- ➕ Wiki du monde : notes liées entre elles, PNJ, lieux, factions
- ➕ Calendrier et chronologie du monde
- ➕ Générateurs : noms, butin, PNJ, tavernes
- ➕ Assistant IA : résumé de séance, PNJ improvisé, description de salle

## 9. Audio

- ✅ Musique et ambiance par canaux, playlists, soundboard, YouTube
- ✅ Zones sonores spatialisées, mixeur personnel
- 🟡 Spatialisation stéréo : ne marche pas avec YouTube
- ➕ Play/pause de la musique au clavier (le legacy l'avait)

## 10. Monétisation

- ✅ Premium, dés et cadres à l'unité, codes cadeaux
- 🟡 Textes légaux de vente à finir
- 🟡 Marketplace de créateurs : service écrit, à déployer en staging (gitops, secrets, rôles
  PostgreSQL)

## 11. Plateforme

- ✅ Temps réel, observabilité, mesures de performance
- ✅ API publique par clés d'API
- 🟡 Mobile et tablette : à vérifier, surtout sur la carte
- 🟡 CI de `main` toujours en échec (dernières exécutions du 2026-10-07)
- ➕ Application installable (PWA), mode hors connexion pour préparer sans réseau
- ➕ Surcouche OBS pour streamer une partie
- ➕ Extensions communautaires (le gabarit `lib/map/features/<id>` s'y prête)

## Priorités recommandées

| #   | Fonction                                 | Pourquoi                                                                        | Taille | S'appuie sur                                  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| 0   | CI de `main` au vert                     | Tout part sur `main` sans PR : sans CI, rien ne garde la branche                | S      | audit des dépendances, tests front            |
| 1   | Import de cartes UVTT avec murs          | Gros gain de temps pour les MJ                                                  | M      | obstacles, scènes, fond                       |
| 2   | Capacités D&D : sauvegardes et réactions | Les capacités les plus jouées en combat restent du texte                        | M      | moteur de règles, combat                      |
| 3   | Marketplace en staging, textes légaux    | Le service est écrit ; la vente demande des textes légaux complets              | S      | gitops, docs/legal.md                         |
| 4   | Aventures prêtes à jouer (one-shots)     | La première séance demande moins de travail au MJ ; vitrine pour la marketplace | M      | campagnes, modèles de PNJ et d'objets, scènes |
| 5   | Wiki du monde lié aux notes              | Fidélise les MJ sur la durée                                                    | M      | notes (compte et personnage), recherche ⌘K    |

Tailles estimées (S : quelques jours, M : une à deux semaines, L : plus), à préciser à la
conception de chaque chantier.
