# Feuille de route : les fonctions d'une table virtuelle

> État au 2026-10-06. Liste des fonctions attendues d'une table virtuelle de jeu de rôle (Roll20,
> Foundry, Owlbear…), croisée avec Yner. Les statuts viennent du code et des docs, pas d'un
> test fonction par fonction.

Légende : ✅ dans le code · 🟡 partiel ou à vérifier · ➕ absent.

## Livré le 2026-10-06

| Fonction                                                                           | Où                 |
| ---------------------------------------------------------------------------------- | ------------------ |
| Fonctions de la carte branchables (`lib/map/features/<id>`), barre déclarative     | `main`, en staging |
| Barre d'outils de la carte personnalisable (clic droit), disposition sur le compte | `main`, en staging |
| Bouton plein écran                                                                 | PR #35             |
| Correctif : styles des composants de la carte (Tailwind)                           | PR #36             |
| Raccourcis personnalisables partout, raccourcis créés, aide-mémoire (`?`)          | PR #37             |
| Raccourcis de dés panneau fermé, jet rapide (Espace puis Entrée)                   | PR #37             |

Ordre de merge : #36, #35, puis #37 (elle contient les deux autres). Migrations identity `0013`
et `0014` au déploiement.

## 1. Compte et social

- ✅ Inscription par e-mail, Google ou Discord ; vérification de l'e-mail ; mot de passe oublié
- ✅ Profil : avatar, bannière, bio, cadres, titres à débloquer, temps de jeu
- ✅ Amis, profils publics, recherche de joueurs
- ✅ Sessions actives, clés d'API, export des données, suppression de compte
- ✅ Raccourcis clavier sur le compte
- ➕ Double authentification (TOTP) : rien dans identity
- ➕ Langues autres que le français (aucune traduction en place)
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
- 🟡 Progression : XP, montée de niveau guidée
- ➕ Import de fiches externes (D&D Beyond, PDF)
- ➕ Systèmes supplémentaires (Pathfinder, Call of Cthulhu…), ou un éditeur de systèmes pour les MJ

## 4. Carte

- ✅ Fond image ou vidéo, scènes, bibliothèque de cartes, quadrillage calibré
- ✅ Tokens, barres de vie, états, bibliothèque de PNJ, objets à fouiller
- ✅ Dessin, texte, gomme, calques du MJ
- ✅ Murs, portes, fenêtres, murs à sens unique, pièces ; ligne de vue calculée par le serveur
- ✅ Brouillard, lumières, torches portées, vue simulée d'un joueur
- ✅ Portails, mesures, gabarits de sorts, zones sonores, météo
- ✅ Pings, curseurs partagés, bulles, aimantation, barre personnalisable, plein écran (#35)
- ➕ **Brouillard d'exploration persistant** (garder ce qu'un joueur a déjà vu) : la landing
  annonce « la carte se dévoile au fil de l'exploration », la vision actuelle ne garde rien
- ➕ Import de cartes avec murs automatiques (Universal VTT / `.dd2vtt`)
- ➕ Élévation des tokens (vol), étages d'un même bâtiment
- ➕ Trajet de déplacement affiché, avec le coût en cases

## 5. Combat

- ✅ Initiative, tour par tour, barre de combat du MJ
- ✅ Attaque guidée : visée sur la carte, cibles, jets, rapports, dégâts
- ✅ États, PNJ vaincus, rencontres préparées
- 🟡 Effets à durée (« pendant 3 rounds ») décomptés automatiquement
- ➕ Générateur de rencontres équilibrées selon le niveau du groupe

## 6. Dés

- ✅ Dés 3D, skins et boutique, formules et macros, jets cachés, historique
- ✅ Raccourcis de dés partout à la table, jet rapide (#37)
- ✅ Bot de dés Discord
- ➕ Statistiques des jets (moyennes, chance de chaque joueur)

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
- ➕ Marketplace de créateurs : cartes, aventures et skins vendus par la communauté

## 11. Plateforme

- ✅ Temps réel, observabilité, mesures de performance
- ✅ API publique par clés d'API
- 🟡 Mobile et tablette : à vérifier, surtout sur la carte
- 🟡 CI de `main` en échec avant ces chantiers : audit des dépendances (vulnérabilités hautes),
  et tests front qui lisent `public/systemes/dnd-classic.json` sans le générer
- ➕ Application installable (PWA), mode hors connexion pour préparer sans réseau
- ➕ Surcouche OBS pour streamer une partie
- ➕ Extensions communautaires (le gabarit `lib/map/features/<id>` s'y prête)

## Priorités recommandées

| #   | Fonction                             | Pourquoi                                                                                               | Taille | S'appuie sur                                      |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------- |
| 1   | Brouillard d'exploration persistant  | Très attendu des joueurs, et promis par la landing                                                     | M      | `@vtt/vision` (même calcul front et serveur), fog |
| 2   | Import de cartes UVTT avec murs      | Gros gain de temps pour les MJ                                                                         | M      | obstacles, scènes, fond                           |
| 3   | Langue anglaise                      | Condition pour sortir du marché francophone ; plus tôt elle arrive, moins il y a de textes à reprendre | L      | aucune base i18n aujourd'hui                      |
| 4   | Aventures prêtes à jouer (one-shots) | La première séance demande moins de travail au MJ ; vitrine pour la marketplace plus tard              | M      | campagnes, modèles de PNJ et d'objets, scènes     |
| 5   | Wiki du monde lié aux notes          | Fidélise les MJ sur la durée                                                                           | M      | notes (compte et personnage), recherche ⌘K        |

Tailles estimées (S : quelques jours, M : une à deux semaines, L : plus), à préciser à la
conception de chaque chantier.

À traiter avant ou en parallèle : remettre la CI de `main` au vert (§ 11), et finir les textes
légaux de vente (§ 10).
