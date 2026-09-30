# Combat : conception

Document de référence du chantier « combat ». Il remplace la page d'attaque et le tableau de bord
du MJ de l'ancienne app (`legacy/src/components/(combat)/`), le surlignage des cibles sur la carte
(`legacy/src/hooks/map/useActiveAttackTargets.ts`) et le panneau « MJ » du nouveau front
(`frontend/src/components/table/onglets/mj.tsx`).

- Contrat : `packages/contracts/src/combat.ts` (Zod), exporté par `@vtt/contracts`.
- Règles : [regles.md](regles.md) (§ 7, « Briques d'une action », « Ce qui relève de l'état de
  partie »), `packages/rules`, `packages/systemes`.
- Carte : [carte.md](carte.md). Dés : [api-dice.md](api-dice.md), [dice-3d.md](dice-3d.md).
- API existante : [api-campaign.md](api-campaign.md) § Combat, [api-character.md](api-character.md).

Tout agent qui touche au combat lit ce document en entier avant d'écrire du code. Une décision
qui s'en écarte est d'abord écrite ici. Les routes et les événements décrits ici sont **prévus** :
les agents d'implémentation les reportent dans `docs/api-*.md` au fur et à mesure.

## 1. Ce que veut la table

1. **Des combats propres à chaque système**, avec leurs règles particulières et leurs nuances,
   sans une ligne de code propre à un jeu.
2. **Un menu d'attaque complet** : l'action, ses options, une ou plusieurs cibles, prises sur la
   carte ou dans une liste.
3. **Les tours à la place du panneau du MJ** : round, suivant, précédent, initiative de tous, et
   ce que chaque système fait autrement (créneaux par camp de Star Wars).
4. **Rien n'est appliqué d'office.** L'attaque rend tout ce qu'elle a produit, cible par cible.
5. **Le MJ décide** : appliquer, ne pas appliquer, modifier (dégâts par cible, résistance, moitié,
   critique, effets), puis annuler s'il s'est trompé.
6. **L'animation 3D fait foi** : les dés d'une attaque roulent, les faces lues à l'arrêt comptent.
7. **Aucune fuite** : un joueur ne voit jamais les statistiques d'un PNJ.
8. **Rien de l'ancienne app ne se perd.**

## 2. L'ancienne app : inventaire et devenir

### 2.1 Page d'attaque (`combat.tsx`, 1 818 lignes)

| #   | Fonctionnalité              | Ancienne app                                                                                                                                                                                      | Devient                                                                                                                                               |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Ouverture                   | « Attaquer » dans le menu d'un token (pastille et onglet Actions) ; MJ : l'attaquant est le personnage actif du tour (erreur s'il n'y en a pas) ; joueur : son personnage                         | menu d'attaque (§ 12.1), ouvert depuis le token, la barre de la sélection, la fiche, le panneau Combat ou un gabarit ; l'attaquant se choisit (§ 5.2) |
| A2  | Attaque de zone             | « Attaquer la zone » d'une mesure : cibles = personnages dont la position est dans la forme, attaquant compris ; attaquant : mon personnage, sinon (MJ) le token sélectionné, l'actif, le premier | « Attaquer la zone (n) » d'un gabarit ou de la mesure récente : tokens vus dans la forme ; jet commun si l'action le déclare                          |
| A3  | Zone d'un vaisseau          | gabarit posé depuis un objet (`startAreaAttack`) : liste des cibles touchées, sans jet                                                                                                            | « Sélectionner les personnages dans la zone (n) » d'un gabarit le fait déjà (carte) ; entités de groupe et véhicules hors de ce chantier (§ 13.3)     |
| A4  | Plein écran                 | portail, défilement bloqué, gestes tactiles iOS, autres dialogues masqués                                                                                                                         | panneau flottant non modal (la carte reste visible pour viser), plein écran sur mobile                                                                |
| A5  | En-tête « versus »          | portrait et nom de l'attaquant ; popover des stats (jauges valeur/max, caractéristiques visibles, bonus d'attaque) ; portraits des cibles (« N cibles »)                                          | en-tête du menu : bandeau de la fiche (présentation) ; puces des cibles                                                                               |
| A6  | Types d'attaque (numérique) | une carte par `combatAttackKeys` avec son bonus (base + bonus en direct) ; « Custom » : NdF + mod                                                                                                 | les actions du système qui ont une cible, paramètres générés ; « Custom » = `attaque-libre`, `degats-libres` (D&D)                                    |
| A7  | Jet d'attaque               | 1d20 + bonus par `Math.random` dans le navigateur ; grand chiffre, dés + mod = total ; choix de l'arme 1,5 s après                                                                                | jet de l'action résolu par le serveur avec les faces des dés 3D (§ 6), détail par cible (§ 5.5)                                                       |
| A8  | Actions de PNJ              | liste `Actions` (Nom, Description, Toucher) à la place des types ; jet saisi (1d20 + 0) comparé au « Seuil » ; dés de dégâts saisis                                                               | attaques enregistrées du personnage (§ 8.3), reprises des actions du bestiaire                                                                        |
| A9  | Choix de l'arme (numérique) | armes de l'inventaire (`NdF`, `damageStatKeys` ajoutés), « compétences » à dés (`Bonus`), dégâts libres                                                                                           | paramètre `entree` de l'action (exemplaires compris) ; dégâts par la formule de l'arme ; capacités par leurs actions                                  |
| A10 | Son d'arme                  | icône son sur chaque arme : bibliothèque plein écran (recherche, catégories, écoute, « Silencieux ») ; `soundId` sur l'objet ; joué à tous au jet de dégâts (numérique) ou à la touche (symboles) | `soundAssetId` sur l'exemplaire (character), choisi parmi les effets de la campagne ; joué à la touche (§ 7.7, Q2)                                    |
| A11 | Dégâts                      | grand chiffre, détail des modificateurs ; « Nouvelle attaque », « Terminer » ; dégâts lancés même sur un raté                                                                                     | dégâts calculés par l'action (`apres`), seulement si elle touche ; « Nouvelle attaque », « Mêmes cibles », « Fermer »                                 |
| A12 | Mode à symboles (EotE)      | arme (dont « Mains nues »), compétence d'attaque avec aperçu du pool ; mains nues sans compétence : `unarmedBaseDice` dés de base                                                                 | action `attaque` de Star Wars : arme (mains nues `toujoursDisponible`), portée, options des talents ; compétence lue sur l'arme                       |
| A13 | Compteurs du pool           | un compteur par dé du système, pré-rempli depuis la fiche, surchargeable (point sur une valeur forcée), « Réinitialiser »                                                                         | paramètres de l'action (difficulté, améliorations, Fortune…) ; ajustements libres du pool, marqués dans le rapport (§ 5.2)                            |
| A14 | Résultat à symboles         | touché si succès nets ≥ 1 ; dégâts = base + succès nets ; critique déclenchable ×N (+10 par activation en plus) ; badges des symboles ; détail des dés ; conseils de dépense                      | résultat de l'action (réussite, valeurs visibles, symboles avec les icônes de la présentation), table des blessures critiques tirée (§ 13.3)          |
| A15 | Rapport                     | un document par cible sous l'attaquant : jet, dégâts, arme, cible, touché si jet ≥ Défense (10 par défaut), symboles, critique                                                                    | attaque et rapport en base (campaign), une entrée par cible, résultat complet (§ 5, § 7)                                                              |
| A16 | Cibles engagées             | marqueur écrit au lancer (15 s) pour le surlignage du MJ                                                                                                                                          | déclaration (`combat.attack_updated`), visée en direct (`combat.aim`), surlignage tant que le rapport est ouvert (§ 12.5)                             |

### 2.2 Tableau de bord du MJ (`MJcombat.tsx`, 2 160 lignes)

| #   | Fonctionnalité        | Ancienne app                                                                                                                                                                    | Devient                                                                                                                                  |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Participants          | tous les personnages de la salle filtrés par scène (joueurs et alliés qui suivent le groupe ou y sont, PNJ de la scène)                                                         | participants explicites (existant), présélectionnés depuis les tokens de la scène ; ajout et retrait en cours (§ 4.2)                    |
| B2  | Tri                   | initiative décroissante, départage, joueur avant PNJ à égalité ; l'ordre tourne (l'actif en tête)                                                                               | tri par les clés du système, camp `players` d'abord à égalité (existant) ; l'ordre ne tourne plus, le tour courant est surligné          |
| B3  | Initiative par camp   | pool de compétence : compétence des joueurs, des ennemis, override par personnage (« Camp (défaut) ») ; état local perdu au rechargement                                        | paramètres de l'action d'initiative par camp et par participant, enregistrés (§ 4.4)                                                     |
| B4  | Relancer l'initiative | tout le monde : formule, pool (rang, départage) ou repli 1d20 + stat ; `initDetails` ; créneaux ou joueur actif                                                                 | `…/initiative` (existant) + par camp, sous-ensemble, relance individuelle, saisie, jet demandé aux joueurs                               |
| B5  | Suivant               | supprime les rapports de l'actif, fait tourner, `activePlayer`                                                                                                                  | `…/next` (existant) ; les rapports restent (§ 7)                                                                                         |
| B6  | Précédent             | rotation arrière, rien d'autre                                                                                                                                                  | `…/previous` : retour propre au passage précédent, durées rendues (§ 4.3)                                                                |
| B7  | Créneaux (EotE)       | barre : round, suite J/E ; « qui agit ? » dans le camp (déjà agi : coché, peut rejouer) ; avancer purge les rapports ; reculer rend l'acteur du créneau                         | mode `slots` (existant) + acteur du créneau (`…/slot-actor`, `force` pour rejouer), journal des passages (§ 4.3)                         |
| B8  | Personnage actif      | portrait, DEF, PV ; détail : type, INIT et son détail, override de compétence, PV modifiables, états, caractéristiques et modificateurs                                         | fiche du participant dans le panneau Combat (§ 12.3)                                                                                     |
| B9  | Personnage consulté   | clic dans l'ordre : carte « Consulté »                                                                                                                                          | même fiche du participant                                                                                                                |
| B10 | Cibles des rapports   | bouton « Cibles (n) » : liste puis détail (DEF, PV, états, stats)                                                                                                               | chaque rapport montre ses cibles ; un clic ouvre la fiche du participant                                                                 |
| B11 | Ordre du tour         | position, portrait, nom, PV, détail d'initiative, icônes d'états, « + » (PV)                                                                                                    | liste du panneau Combat (§ 12.3)                                                                                                         |
| B12 | Ajuster les PV        | tiroir ±1, journal ; PNJ à 0 PV (ou au seuil pour une jauge qui monte) : confirmer la suppression                                                                               | bloc Ressources de la fiche ; hors de combat par la règle du système (§ 4.5)                                                             |
| B13 | États                 | Empoisonné, Étourdi, Aveuglé (en dur) + état libre ; journal ; icônes sur le token                                                                                              | états du catalogue (effets, durée) + état libre (bonus libre sans effet) ; badges sur le token (§ 12.5)                                  |
| B14 | Rapports              | ceux de l'actif seulement ; arme, cible, touché, jet, dégâts, symboles, dés, critique, « AUTO-ATTAQUE », appliqué grisé, « x/y appliqués »                                      | tous les rapports, filtres, `selfTarget` (§ 12.4)                                                                                        |
| B15 | Appliquer             | cible modifiable, détail de l'encaissement, dégâts ±1 pré-remplis (dégâts − encaissement), sens selon `recoversToZero`, toast, défi « dégâts infligés », journal des deux côtés | décision du MJ (§ 7.1) : valeurs des règles (encaissement, résistances comptés), corrigeables, réattribution ; événements (§ 10) ; défis |
| B16 | Tout appliquer        | revue groupée : dégâts modifiables, cases, ajustement global ±1 ; morts regroupées                                                                                              | `…/attacks/apply` (§ 7.4), même revue                                                                                                    |
| B17 | PNJ tombés            | dialogue groupé, cases (« boss à seconde phase »), suppression des PNJ et de leurs rapports                                                                                     | dialogue « Hors de combat » : garder, retirer du combat, supprimer l'instance (§ 7.4)                                                    |
| B18 | Mort d'un personnage  | ses rapports, sa fiche supprimés, le tour passe                                                                                                                                 | suppression de l'instance de PNJ (carte), le combat le retire (existant)                                                                 |
| B19 | Mobile                | carte active, rapports, ordre                                                                                                                                                   | panneau adaptatif                                                                                                                        |
| B20 | Décor                 | `LightRays` (7 calques flous animés)                                                                                                                                            | non repris : décor coûteux ; le design system suffit                                                                                     |

### 2.3 Carte

| #   | Fonctionnalité     | Ancienne app                                                                                                                               | Devient                                                                                    |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| C1  | Personnage actif   | anneau rouge chez le MJ ; un joueur voit son propre personnage en rouge                                                                    | anneau du tour pour tous (participant vu), mon personnage marqué pour moi                  |
| C2  | Cibles attaquées   | anneau orange chez le MJ : cibles du marqueur et des rapports de l'actif s'il est un personnage joueur ; visible même bordures coupées (J) | anneau des cibles de toute attaque ouverte (MJ), toujours visible, bordures coupées ou non |
| C3  | États sur le token | icônes à côté du nom, libellé au survol                                                                                                    | badges d'états (icônes de la présentation), libellé au survol                              |
| C4  | Menu du token      | « Attaquer »                                                                                                                               | « Attaquer » (menu et barre de la sélection)                                               |
| C5  | Menu d'une mesure  | « Attaquer la zone »                                                                                                                       | « Attaquer la zone (n) » à côté de « Sélectionner les personnages dans la zone (n) »       |

### 2.4 Règles des systèmes (ancien `GameSystemDefinition`)

| Ancien champ                                                            | Sens                     | Devient (données du système)                                                              |
| ----------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `combatDefenseKey`, `combatAttackKeys`                                  | Défense comparée, scores | formule de réussite (`total >= @cible.Defense`), paramètre `attribut` (`score`)           |
| `combat.skillKeys`                                                      | compétences d'attaque    | compétence lue sur l'arme (`arme.competence`)                                             |
| `defaultDifficulty`, `difficultyDieKey`, `bonusDieKey`, `penaltyDieKey` | dés du pool              | `jet.pool`, `jet.ameliorations` et paramètres de l'action                                 |
| `successStatKey`                                                        | touche                   | `jet.reussite` (`succesNets >= 1`)                                                        |
| `soakStatKey`                                                           | encaissement             | `apres` (`@cible.encaissement - arme.perforant`)                                          |
| `advantageStatKey`, `triumphStatKey`                                    | critique                 | `apres.activationsCritique`, `tables`                                                     |
| `unarmedBaseDice`                                                       | mains nues               | arme « Mains nues » `toujoursDisponible`                                                  |
| `initiative.formula`, `skillKeys`, `rankStatKey`, `tieStatKey`          | initiative               | `initiative.action`, `initiative.tri` ; créneaux : `initiative.mode` (§ 14)               |
| `StatDefinition.recoversToZero`, `maxFormula`                           | sens des dégâts, mort    | opération de la conséquence (`ajouter`, `retirer`) ; `horsCombat` du type d'entité (§ 14) |
| `CONDITIONS` (3, en dur dans `MJcombat.tsx`)                            | états                    | sorte d'états du catalogue (`etat`), déclarée par la présentation                         |

### 2.5 Ce qui n'allait pas

- **Dés du navigateur** : `Math.random`, jamais animés en 3D, absents de l'historique des dés ; un
  joueur pouvait tricher.
- **Aucun droit** : écritures Firestore directes ; n'importe qui écrivait un rapport, des PV, un état.
- **Rapports perdus** : rangés sous l'attaquant, le MJ ne lisait que ceux du personnage actif (une
  attaque hors tour était invisible) ; « Suivant » les supprimait, sans trace.
- **Multi-cibles** : un seul jet et un seul dégât pour toutes, sans choix possible.
- **D&D en dur** : « DEF », « PV », `floor((v - 10) / 2)`, Défense 10 par défaut, type « joueurs » ;
  dégâts lancés même sur un raté.
- **État volatil** : compétence d'initiative par camp et overrides perdus au rechargement ;
  « Précédent » sans retour des durées ; aucun moyen d'annuler des dégâts appliqués.
- **Fuites** : le journal public disait « 3 PV restants » d'un PNJ.
- **États décoratifs** : aucune conséquence mécanique.

### 2.6 Le panneau « MJ » du nouveau front

`onglets/mj.tsx` montre les héros de la table (personnages engagés, création terminée) : portrait,
nom, résumé (`tagline`), joueur qui l'incarne ou « non incarné », lien vers la fiche (panneau
Personnages) et le bloc Ressources de la fiche, modifiable. Il devient l'onglet **Héros** du panneau
Combat, à l'identique (§ 12.3).

## 3. Principes

1. **Le serveur fait autorité, les règles décident.** campaign orchestre (droits, tours, attaques,
   rapports, événements) ; character résout avec `@vtt/rules` (fiches, formules, dés). Aucun calcul
   de règle dans campaign ni dans le front, hormis l'aperçu local.
2. **Résoudre n'est pas appliquer.** Une résolution produit un rapport figé : dés, issue,
   variables, modifications proposées. Appliquer écrit ces modifications, ou celles corrigées par le
   MJ, sans jamais relancer un dé. Annuler rend les valeurs d'avant.
3. **L'animation fait foi.** Les dés d'une attaque roulent en 3D chez qui lance ; les faces lues à
   l'arrêt partent au serveur, qui résout avec elles. Le serveur ne tire qu'en repli, et aucune face
   n'est jamais imposée à une animation.
4. **Zéro clé de jeu.** Actions, paramètres, formulaires, dés, symboles, états, tables et ressources
   viennent du système et de sa présentation. Le code ne connaît ni « PV », ni « Défense ».
5. **Aucune fuite.** Un joueur ne reçoit jamais une valeur d'un PNJ : ni dans un rapport, ni dans
   le jet de l'historique des dés, ni dans un événement, ni dans l'état du combat. Le serveur filtre.
6. **Tracé et réversible.** Chaque étape est un événement (history) ; un passage de tour et une
   application s'annulent proprement.
7. **Code en anglais, textes en français, design system** (pas de hex, `color-mix()`).

## 4. Modèle

### 4.1 Combat

Un combat actif par campagne (existant : `campaign_combats`). Champs existants inchangés : `id`,
`round`, `mode`, `order`, `currentIndex`, `slots`, `initiativeRolled`, `version`. Ajouts
(`CombatState`) :

| Champ            | Rôle                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `settings`       | réglages du MJ (§ 9.2)                                                                                       |
| `currentActorId` | participant qui agit : celui de `currentIndex` (individual) ; celui désigné pour le créneau (slots), ou null |
| `turn`           | compteur des passages de tour, croissant                                                                     |
| `canGoBack`      | un passage peut être annulé (MJ)                                                                             |
| `startedAt`      | début du combat                                                                                              |
| `redacted`       | vue d'un joueur ou d'un spectateur (§ 9.3)                                                                   |

**Mode.** Sans `mode` au démarrage, celui que déclare le système (`initiative.mode`, § 14) :
`creneaux` donne `slots`, sinon `individual`. Le `mode` explicite reste accepté (existant).

### 4.2 Participants

Personnages engagés dans la campagne (joueurs, alliés, PNJ posés), comme aujourd'hui
(`campaign_combat_participants`) : `characterId`, `side` (camp de l'engagement), `sortKeys`,
`hasActed`. Ajouts (`CombatParticipant`) : `visibleToPlayers`, `initiative` (détail, paramètres,
source, date, jet de l'historique), `initiativePending`, `joinedRound`, `defeated`.

- **Démarrer.** Le front présélectionne les tokens de la scène du groupe (joueurs, alliés, PNJ) ;
  les PNJ `hidden` ou `invisible` sont pré-cochés « cachés » (`hidden` de `StartCombat`). Le MJ
  coche, puis lance l'initiative (tout de suite, `rollInitiative`, ou plus tard).
- **Rejoindre** (`POST …/participants`) : initiative tirée, demandée au joueur, saisie, ou aucune ;
  le participant entre à sa place d'initiative ; s'il entre avant le tour courant, `currentIndex`
  suit (le tour ne change pas de main). En mode slots, un créneau de son camp s'ajoute à sa place.
- **Quitter** (`DELETE …/participants/:characterId`) : règle `remove` existante. Un personnage
  retiré de la campagne, ou un PNJ supprimé, quitte le combat (existant).
- **Caché** (`visibleToPlayers: false`) : absent de la vue des joueurs (§ 9.3). Indépendant de la
  visibilité du token : on rend le participant visible à la révélation de l'embuscade.
- **Hors de combat** (`defeated`) : § 4.5.

### 4.3 Tours, rounds, retour arrière

- **Individual** (existant) : `next` marque le participant `hasActed` et passe au suivant ; après
  le dernier, un nouveau round commence, `hasActed` revient à faux, les durées sont décomptées.
- **Slots** (existant) : le créneau courant donne un camp. Son **acteur** est désigné
  (`…/slot-actor`) ou implicite : le premier participant du camp qui déclare une attaque pendant le
  créneau. `next` le marque `hasActed`. Un participant qui a déjà agi ce round ne se désigne
  qu'avec `force` (MJ) : l'ancienne app le laissait rejouer sans limite.
- **Qui passe le tour** : le MJ, ou le joueur qui incarne le participant qui agit (existant).
- **Donner le tour** (`…/turn`, MJ) : saute à un participant ou à un créneau, sans marquer personne.
- **Réordonner** (`PUT …/order`, MJ) : glisser dans la liste ; le tour reste au même participant.
- **Journal des passages** (`campaign_combat_turns`) : chaque passage (`next`, `new_round`,
  `slot_actor`, `turn_set`) enregistre l'état d'avant (round, participant ou créneau courant **par
  identité**, `hasActed` de chacun, acteur du créneau) et l'identifiant du décompte des durées
  (`tick:<combatId>:<round>`) s'il y en a eu un.
- **Précédent** (`…/previous`, MJ) : annule le dernier passage du journal. L'état d'avant revient ;
  le tour revient au même participant (pas au même index : l'ordre a pu changer). Si ce passage
  avait ouvert un round, character rend les durées décomptées (§ 11.2) : un état expiré revient avec
  sa durée d'avant. Plusieurs « Précédent » remontent le journal ; un participant retiré depuis
  n'est pas remis. Réponse : l'état, avec `durationUpdates` et `durationFailures`.
- **Les rapports ne dépendent pas des tours** : rien n'est supprimé en passant (contrairement à
  l'ancienne app). Ils restent en attente jusqu'à la décision du MJ.

### 4.4 Initiative

Chaque participant exécute l'action d'initiative du système (`initiative.action`) ; l'ordre suit
ses clés (`initiative.tri`, la plus importante d'abord). À égalité parfaite : camp `players`
d'abord, puis ordre stable (existant ; règle de l'ancienne app pour tous les systèmes).

| Système   | Action                                                                          | Tri                           | Mode       | Paramètres                                                   |
| --------- | ------------------------------------------------------------------------------- | ----------------------------- | ---------- | ------------------------------------------------------------ |
| D&D       | `initiative` : `1d20 + @INIT`                                                   | `total`                       | individuel | aucun                                                        |
| Nooblies  | `initiative` : `1d20 + @INIT`                                                   | `total`                       | individuel | aucun                                                        |
| Star Wars | `initiative` : pool de la compétence choisie (étiquette `initiative`), Fortune… | `succesNets`, `avantagesNets` | créneaux   | compétence (Sang-froid, Vigilance), Réaction rapide (stress) |

- **Paramètres.** Formulaire généré depuis les paramètres de l'action d'initiative : un par camp
  (`paramsBySide` : joueurs surpris, ennemis embusqués) et, à la demande, par participant
  (`params`, prioritaire). Ils sont enregistrés dans `initiative.params` : une relance individuelle
  reprend les mêmes.
- **Pour tous** (MJ, existant) : le serveur tire. **« Les joueurs lancent »** (`askPlayers`) : les
  participants du camp `players` incarnés passent `initiativePending` ; leur joueur reçoit l'invite
  (bandeau, § 12.6) et lance en 3D (§ 6) ; le serveur tire pour les autres ; le MJ tire à la place
  d'un joueur absent.
- **Relance individuelle** (`POST …/participants/:characterId/initiative`), **saisie** (MJ :
  `PATCH` avec `sortKeys`, source `manual`, pour des dés lancés à la table), **participant qui
  rejoint** (§ 4.2).
- **Historique des dés** : le jet est transmis par character (existant) ; celui d'un PNJ en
  visibilité `gm`.

### 4.5 États, durées, hors de combat

- **États** = entrées du catalogue d'une sorte déclarée par la présentation (`combat.etats`,
  § 14), avec leurs effets ; donnés avec une durée en rounds, ou jusqu'au retrait. **État libre** =
  bonus libre sans effet (nom, durée) : il remplace l'état saisi à la main de l'ancienne app.
- **Gestion** : fiche du participant (panneau Combat) : ajouter (liste du système, état libre),
  durée, retirer ; par les routes de character (`POST /possessions` avec `duree`, à ajouter ;
  `bonus`). Les actions en donnent aussi (conséquence `donner` avec `duree` : sort qui étourdit).
- **Décompte** : fin de round (existant), rendu idempotent par `tickId` et annulable (§ 4.3).
- **Fin de combat** : option « Retirer les états à durée » (`clearTimedStates`).
- **Hors de combat** : formule `horsCombat` du type d'entité (§ 14 : D&D `@PV <= 0`, Star Wars
  `@neutralise`), évaluée par character après chaque application. Vraie : `defeated`, événement
  `combat.participant_defeated`, dialogue du MJ (§ 7.4). Sans formule dans le système, pas de
  détection : le MJ coche lui-même (`PATCH { defeated }`).

## 5. Attaque : de l'intention au rapport

### 5.1 Cycle de vie

```
déclarer ─► awaiting_reactions ─► awaiting_dice ─► pending ─► applied
   │              │                     │             │    └─► dismissed
   │              │                     └─► failed    └── annuler une application : retour à pending
   └──────────────┴──► cancelled (auteur ou MJ, avant la résolution)
```

| Statut               | Sens                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| `awaiting_reactions` | au moins une cible peut réagir (défense active, § 5.3)                        |
| `awaiting_dice`      | des dés physiques sont à lancer (`pendingSteps`, § 6)                         |
| `pending`            | résolue : le rapport attend le MJ ; une cible non décidée garde l'attaque ici |
| `applied`            | toutes les cibles décidées, au moins une appliquée                            |
| `dismissed`          | toutes les cibles décidées, rien appliqué                                     |
| `cancelled`          | abandonnée avant la résolution                                                |
| `failed`             | refusée par les règles à la résolution (toutes les cibles)                    |

Par cible : `status` (`awaiting_reaction`, `awaiting_dice`, `resolved`, `failed`) et `decision`
(`pending`, `applied`, `skipped`, `reverted`). Une cible refusée par les règles (`failed`, avec son
message) n'empêche pas les autres.

### 5.2 Déclarer

`POST /v1/campaigns/:id/attacks` (`DeclareAttack`).

- **Attaquant** : pour un joueur, un personnage qu'il incarne ; pour le MJ, tout personnage engagé
  (participant qui agit, token sélectionné, PNJ de la liste).
- **Action** : les actions du système qui déclarent une `cible`, permises au type d'entité de
  l'attaquant (`pour`) et dont l'`exige` est vrai pour lui ; groupées par la présentation
  (`combat.groupes`, § 14), attaques enregistrées du personnage en tête (§ 8.3). Ce sont toutes les
  actions à cible, pas seulement les attaques : sorts, soins (D&D `soins-legers`, Star Wars
  `soins`, `stimpack`), test contre un personnage, Protecteur. Même déroulé, même rapport : la fiche
  écarte déjà ces actions (« les attaques se jouent en combat »), et l'ancien tiroir « Appliquer »
  servait aussi aux soins (dégâts négatifs).
- **Paramètres** : formulaire généré (`nombre`, `booleen`, `attribut`, `entree` avec ses
  exemplaires) ; un paramètre dont l'`exige` est faux est caché ; un paramètre `par: cible` n'est
  jamais demandé à l'attaquant (§ 5.3). Composant partagé avec le lanceur d'actions de la fiche.
- **Ajustements libres** (`adjustments`) : dés à symboles ajoutés ou retirés par sorte, bonus au
  total d'un jet numérique. C'est l'ancien compteur de pool « forcé » : hors règles, appliqué après
  les effets, marqué « ajusté à la main » dans le rapport et le déroulé.
- **Cibles** : 1 à 50, depuis la carte (§ 12.1) ou la liste des participants. Un joueur ne vise que
  des personnages qu'il voit (liste filtrée de la campagne, token vu) : 404 `target_not_found`
  sinon. L'attaquant peut se viser (`selfTarget`, l'ancienne « auto-attaque »).
- **Mode de jet** (`rollMode`) : un jet par cible ou un jet commun (§ 5.4) ; défaut : ce que déclare
  l'action (`multicible.jet`, § 14), sinon un jet par cible ; bascule dans le menu dès deux cibles.
- **Dés** (`dice`) : le front envoie `server` si l'animation 3D est coupée dans les préférences de
  l'attaquant ; sans valeur, `physical` si le combat le permet (`physicalDice`), sinon `server` (§ 6).
- **Visibilité** : `public`, `private`, `gm` ; défaut `gm` pour le MJ si `gmRollsHidden`.
- **Tour** : en combat, avec `playersActOutsideTurn` faux, un joueur n'attaque qu'avec le
  participant qui agit (409 `not_their_turn`) ; sinon l'attaque est permise et marquée `outOfTurn`.
  Hors combat : permise, rapport sans combat (`combatId` null). En mode slots, la première attaque
  d'un participant du camp courant le désigne acteur du créneau.
- **Refus des règles** (arme non possédée, hors de portée, option indisponible) : 422
  `action_refused` avec les messages de l'action ; refus propre à une cible : cette cible `failed`.
- **Aperçu** (front, `@vtt/rules` sur la fiche de l'attaquant) : formule ou pool, bonus des effets
  de l'attaquant ; ce qui dépend de la cible s'affiche « selon la cible » (un joueur n'a pas sa
  fiche). Le MJ voit l'aperçu par cible.
- **Idempotence** : en-tête `Idempotency-Key` (double clic, reprise réseau).

### 5.3 Réactions de la cible (défense active)

Le moteur connaît deux défenses :

- **Automatiques** : effets de jet `cote: cible` des possessions de la cible (talents, états,
  armure). Rien à demander.
- **Choisies** : paramètres `par: cible` de l'action dont l'`exige` est vrai pour la cible (Esquive
  de Star Wars : du stress pour améliorer la difficulté). Ils sont proposés à qui incarne la cible
  (`reactionParams`) ; l'attaque attend en `awaiting_reactions`.

Le joueur ciblé voit l'invite (« Un adversaire vous attaque » si l'attaquant lui est caché), répond
ou passe (`…/reactions`, `skip`) ; le MJ répond pour n'importe quelle cible, ou passe pour tous. Pas
de délai automatique : le MJ tranche.

**Jets de sauvegarde** (D&D : « test de DEX pour la moitié ») : jet lancé par la cible elle-même.
Brique proposée (`sauvegarde` de l'action, § 14, étape D) : une étape de dés `roller: target`, lancée
par le joueur de la cible. En attendant, le MJ applique « Moitié » (§ 7.1), comme dans l'ancienne
app où ce jet se faisait à la main.

### 5.4 Résolution

- **Par character**, sur un **instantané des fiches** pris à la déclaration (attaquant et cibles,
  avec les règles optionnelles de la campagne) : la résolution ne bouge pas pendant qu'on lance les
  dés ; l'application, elle, s'écrit sur l'état du moment (§ 7.2). L'instantané reste dans campaign
  (colonne réservée au serveur) jusqu'à la résolution, puis disparaît.
- **Une exécution de l'action par cible** : le moteur ne connaît qu'une cible par exécution.
  Paramètres : ceux de l'attaquant, plus la réaction de la cible.
- **Jet par cible** (`per_target`) : chaque cible a ses dés ; trois cibles, trois d20 lancés ensemble.
- **Jet commun** (`shared`) : les dés sont partagés **par phase et par position**, à nombre de faces
  égal : le d20 d'une attaque de zone, les 4d6 d'une boule de feu sont lancés une fois pour toutes.
  Un dé que seule une cible demande (bonus contre les morts-vivants, botte contre une Défense
  basse) est lancé pour elle seule. Les coûts de l'attaquant (§ 7.1) ne comptent qu'une fois.
- **Phases** : jet, après, tables. Les dés d'une phase ne sont connus qu'une fois la précédente
  résolue : pas de dés de dégâts sur un raté, dés doublés d'un critique, table tirée seulement si
  le critique passe.
- **Formule en échec** : valeur par défaut et `errors`, comme le moteur aujourd'hui.

### 5.5 Résultat d'une cible (MJ)

`AttackTargetResult` : issue (`success`, `critical`, `fumble`) ; jet numérique (formule, chaque dé
avec sa source `physical` ou `server`, gardé ou écarté, explosion, bonus des effets avec leur côté :
action, attaquant, cible) ou pool à symboles (construction étape par étape avec son côté, dés et
faces, symboles, résultats du système) ; toutes les variables de l'action ; modifications proposées
(attribut, opération, valeur, type de dégâts, dégâts bruts, résistances de la cible, ou entrée
donnée avec sa durée) ; tables tirées (valeur, ligne, entrée) ; déroulé ; erreurs.

### 5.6 Ce que voit l'attaquant

`AttackTargetView`, calculée par character (`vueActeur`, § 14) :

- ses dés et leur total, ou son pool ; les lignes venues de la cible sont anonymisées
  (« Défense de la cible : 1 Difficulté → Défi ») ;
- l'issue (touché, critique, échec critique), comme l'ancienne app ;
- les valeurs que le système déclare `visibilite: acteur` (dégâts lancés), avec leur nom ;
- un déroulé reconstruit à partir de ces seules parties.

Jamais : un attribut, une variable, une résistance, une modification ou une table de la cible. La
même vue sert au jet transmis à l'historique des dés (§ 7.7). Après la décision, l'attaquant voit
le statut (appliqué, écarté) sans les montants, sauf pour un personnage du camp des joueurs.

## 6. Dés : l'animation fait foi

### 6.1 Étapes de dés

Une attaque en dés physiques avance par **étapes** (`RollStep`) : les dés d'une phase, pour toutes
les cibles, lancés ensemble. Chaque dé demandé (`RollDieRequest`) porte un identifiant stable, sa
cible (null pour un dé commun), son nombre de faces, et pour un dé à symboles sa sorte (`die`) :
le front construit les `Die3D` avec `numericDice3D` et `symbolDice3D` (présentation : skin,
symboles), comme le lanceur.

Exemples :

| Attaque                                  | Étape 1 (jet)                                     | Étape 2 (après)                        | Étape 3 (tables) |
| ---------------------------------------- | ------------------------------------------------- | -------------------------------------- | ---------------- |
| D&D, épée contre 2 cibles, jet par cible | 2 d20 (un par cible)                              | dés de l'arme des cibles touchées      | —                |
| D&D, boule de feu, 4 cibles, jet commun  | 1 d20                                             | 4d6 communs (+ d6 propres à une cible) | —                |
| Star Wars, blaster                       | pool (Aptitude, Maîtrise, Difficulté, Infortune…) | —                                      | d100 si critique |

### 6.2 Protocole

```
front                          campaign                           character
  │ POST /attacks ──────────────►│ droits, tour, cibles vues          │
  │                              │── prepare ────────────────────────►│ règles, instantané,
  │                              │◄── réactions, étape 1 ─────────────│ plan de l'étape 1
  │◄── 201 attaque (pendingSteps)│                                    │
  │ lance les dés 3D, lit les faces à l'arrêt                         │
  │ POST /attacks/:id/dice ─────►│── resolve (instantané + faces) ───►│ rejoue les faces,
  │                              │◄── étape 2, ou résultats ──────────│ planifie la suite
  │◄── attaque (étape 2 | rapport)                                    │
```

- Le serveur **rejoue** les faces reçues dans l'ordre de leurs identifiants : même instantané,
  mêmes faces, même résultat (le moteur est déterministe).
- Il planifie l'étape suivante avec les dés que les formules demandent **réellement** une fois la
  phase précédente connue (§ 6.4). Une explosion (`1d6!`) demande un dé de plus : nouvelle étape,
  le dé qui explose est relancé en 3D, comme à la table.
- Faces invalides (hors de 1..faces, dé inconnu de l'étape) : 400 `invalid_physical_result`,
  l'attaque ne bouge pas. Étape périmée (`stepId` déjà passé) : 409 `step_outdated`.
- Qui lance : l'auteur de l'attaque (ou le MJ à sa place) ; une étape `roller: target` : le joueur
  de la cible (ou le MJ).
- La confiance dans les faces est celle du lanceur de dés (service dice) : le client lit la
  physique. Le MJ voit la source de chaque face (`physical`, `server`) ; il peut imposer le serveur
  à toute la table (`physicalDice: false`).

### 6.3 Repli serveur

Le serveur tire lui-même (`aleatoireCrypto`), sans animation, quand :

- l'attaque est déclarée en `server` (3D coupée dans les préférences, `physicalDice` faux, PNJ en
  masse, choix du MJ) ;
- un dé n'a pas de forme 3D (d100, d7…) ou dépasse la limite du lanceur (15 dés, `MAX_3D_DICE`) : il
  est absent des résultats, le serveur le tire (source `server`, rapport « mixte ») ;
- les dés ne se sont pas arrêtés à temps (délais de `lib/dice-throw.ts`) ou le client envoie
  `serverFallback` ;
- l'auteur est parti : le MJ tire la suite par `…/dice { serverFallback: true }`.

Un résultat tiré par le serveur ne s'anime jamais ensuite : il s'affiche comme un résultat, sans dé
qui roule vers une face choisie.

### 6.4 Moteur : générateur planifié (`@vtt/rules`, § 14)

- `Generateur.entier(max, contexte?)` : le contexte dit la sorte d'un dé à symboles (Aptitude et
  Difficulté sont deux d8 : il faut les distinguer).
- `Generateur.phase?(nom)` : appelé par `executer` au début du jet, d'`apres`, des tables et à la fin.
- `aleatoirePlanifie(faces)` : rejoue les faces fournies ; épuisées, il répond une valeur provisoire
  (1 : ni explosion ni branche coûteuse) et **note** les dés demandés jusqu'à la fin de la phase ;
  au changement de phase suivant, il lève `DesRequis` avec le plan. Aucun calcul n'est rendu avec
  une valeur provisoire.
- `executerMulticible` : une exécution par cible, jet commun par phase et par position (§ 5.4).
- `DemandeAction.ajustements` (dés et bonus libres) et `DemandeAction.forcer` (issue corrigée, § 7.5).

### 6.5 Initiative en dés physiques

Même protocole, sur le participant : `POST …/participants/:characterId/initiative` avec
`dice: 'physical'` rend `ParticipantInitiativeResult` (`pendingStep`), puis `…/initiative/dice`.

### 6.6 Découpage honnête

Le mode physique demande le générateur planifié, l'instantané et les étapes : c'est la partie la plus
lourde. Le chantier se fait donc en deux temps, **sans rien perdre** :

1. **Étape B** : tout le combat avec des dés tirés par le serveur (le repli de § 6.3). Ce n'est pas
   une régression : l'ancienne page d'attaque ne lançait jamais les dés en 3D (`Math.random`), et
   aucune face n'est imposée à une animation ; le contrat porte déjà les étapes.
2. **Étape C** : les dés physiques, pour les attaques puis l'initiative. Le combat n'est pas « fini »
   avant cette étape.

## 7. Rapport d'attaque et application

### 7.1 Décisions du MJ

Pour chaque cible, et pour les **coûts de l'attaquant** (stress d'une option de talent, munitions,
stimpack consommé : modifications `acteur`, un bloc à part) :

- **Appliquer tel quel** : les modifications du rapport.
- **Ne pas appliquer** (`skipped`) : raté narratif, cible déjà tombée…
- **Modifier puis appliquer** : le MJ envoie les modifications à appliquer à la place de celles du
  rapport (`AttackModificationInput`). Le front propose des raccourcis, qui produisent des valeurs :
  - valeur par valeur (dégâts, soins, stress), ±1 et saisie ;
  - « Moitié » (arrondi inférieur), « Double », « Résistance − n », « Aucun dégât » ;
  - type de dégâts changé ;
  - état ajouté ou retiré, avec sa durée ;
  - table : appliquer ou non la ligne tirée, ou choisir une autre entrée de la table ;
  - réattribuer à un autre personnage engagé (`redirectTo`, l'ancien « Cible » du tiroir), valeurs
    inchangées, marqué « réattribué ».
- **Écarter tout le rapport** (`…/dismiss`).
- **Note** facultative (500 caractères), gardée avec la décision.

Une décision peut ne porter que sur certaines cibles ; les autres restent en attente. Les valeurs
proposées tiennent déjà compte de la cible (encaissement, RD, résistances, immunités), contrairement
à l'ancienne app qui ne soustrayait que l'encaissement au moment d'appliquer.

### 7.2 Appliquer sans relancer

- campaign envoie à character les modifications décidées, avec un `applicationId` (UUIDv7) :
  `POST /internal/modifications/apply` (§ 11.2). Toutes les fiches touchées (cibles, réattributions,
  attaquant) sont verrouillées et écrites **dans une transaction** : tout ou rien.
- **Aucun dé** : les valeurs viennent du rapport ou de la décision. Une table appliquée donne
  l'entrée de sa ligne (`appliquerTirage`, aujourd'hui jamais appelé par le service).
- Idempotent par `applicationId` : une reprise ne compte pas deux fois.
- character garde le **diff** de chaque fiche (`changes`, le même que `character.updated`) et
  renvoie par fiche : nouvelle version, diff, `defeated` (formule `horsCombat`).
- Un attribut ou une entrée inconnus du système, une valeur hors bornes : 422 avec le détail, rien
  n'est écrit.

### 7.3 Annuler une application

`POST …/attacks/:attackId/revert` (MJ) : character rend, pour chaque chemin du diff, la valeur
d'avant, si la valeur actuelle est toujours celle d'après. Sinon 409 `revert_conflict` avec les
chemins en cause (la fiche a changé entre-temps) ; `force` rend quand même. Les cibles repassent en
`reverted` (non décidées) : le MJ peut décider à nouveau. Événement `combat.attack_reverted`. Le
même mécanisme rend les durées d'un round (§ 4.3).

### 7.4 Tout appliquer, hors de combat

- **Revue groupée** (« Tout appliquer (n) ») : tous les rapports en attente, cases à cocher,
  valeurs modifiables une à une, ajustement global ±1 (comme l'ancienne app), puis
  `POST …/attacks/apply` : une application par rapport, un seul appel à character.
- **Hors de combat** : les personnages devenus `defeated` sont réunis dans un seul dialogue (pas un
  par personnage) : pour chacun, **Garder** (grisé, reste dans l'ordre : boss à seconde phase),
  **Retirer du combat**, **Supprimer le PNJ** (instance et token, route de la carte, § 11.1).

### 7.5 Corriger l'issue

`POST …/attacks/:attackId/override` (MJ, étape D) : « c'est un critique » (état paralysé à portée),
« c'est raté ». character rejoue la résolution avec les **mêmes faces** et l'issue forcée
(`forcer`) ; les dés en plus (dés doublés du critique) sont tirés par le serveur, ou lancés en 3D
par le MJ (`dice: physical`). Le rapport est remplacé, sa version change.

### 7.6 Qui voit quoi

| Donnée                                         | MJ  | Auteur (joueur)          | Joueur ciblé                              | Autres joueurs, spectateurs                         |
| ---------------------------------------------- | --- | ------------------------ | ----------------------------------------- | --------------------------------------------------- |
| Rapport complet (`result`, `actor`, `applied`) | oui | non                      | non                                       | non                                                 |
| Vue de l'attaquant (`view`), statut, décision  | oui | oui                      | non                                       | non                                                 |
| Invite de réaction                             | oui | —                        | oui (sa cible)                            | non                                                 |
| Jet dans l'historique des dés                  | oui | oui (vue de l'attaquant) | selon la visibilité                       | selon la visibilité (`public`)                      |
| Annonce (`combat.attack_announced`)            | oui | si `public`              | si `public`                               | si `public`                                         |
| Conclusion (`combat.attack_concluded`)         | oui | si `public`              | si `public`                               | si `public` ; montants : camp des joueurs seulement |
| Attaque d'un PNJ caché, jet `gm`               | oui | —                        | la cible ne voit que l'effet sur sa fiche | rien                                                |

Un joueur ne voit que ses rapports (auteur, ou attaquant qu'il incarne). Un attaquant ou une cible
caché aux joueurs n'apparaît dans aucune annonce (attaquant null, cible retirée).

### 7.7 Historique, défis, son d'arme

- **history** enregistre tout (bus) ; la chronique du front (`components/historique/format.ts`)
  rend `combat.attack_announced` et `combat.attack_concluded` pour tous, `combat.attack_resolved` et
  `combat.attack_decided` pour le MJ (dés, valeurs, résistances : « jet d'attaque : 2 succès nets,
  dégâts 7 − encaissement 3 »), `combat.participant_defeated`, les tours. `combat.attack_updated`
  (signal) n'y paraît pas. L'agrégat `attack` et `actor.characterId` (l'attaquant) rangent l'attaque
  dans l'historique « par personnage » de l'attaquant ; les modifications de la cible y sont par
  `character.updated` (existant).
- **Jet** : character transmet à dice la vue de l'attaquant (jamais le déroulé complet, qui nomme
  les défenses de la cible), avec la visibilité de l'attaque.
- **Défis** (« dégâts infligés », `trackDamageDealtByCharacter` de l'ancienne app) : identity écoute
  `combat.attack_decided` (montants appliqués, attaquant) ; hors de ce chantier, la donnée est là.
- **Son d'arme** (Q2) : à la résolution, si une cible est touchée et que l'exemplaire utilisé a un
  `soundAssetId`, campaign demande à audio de jouer l'effet pour la table (auteur système).

## 8. PNJ

### 8.1 Le MJ attaque

Comme un joueur, avec n'importe quel personnage engagé comme attaquant ; visibilité `gm` par défaut
(`gmRollsHidden`). Le menu propose d'abord le participant qui agit s'il est un PNJ.

### 8.2 À la suite, en masse

- **À la suite** : sélection de plusieurs PNJ sur la carte, « Attaquer avec la sélection » : le
  menu prend chaque PNJ l'un après l'autre (« Suivant »), en gardant l'action, les paramètres
  communs et les cibles du précédent.
- **En masse** : « Même attaque pour tous » : `POST …/attacks/batch` (20 au plus), dés du serveur
  par défaut ; les rapports arrivent ensemble, prêts pour « Tout appliquer ». En dés physiques, les
  étapes des attaques se lancent ensemble (dans la limite du lanceur).

### 8.3 Attaques enregistrées

Les « Actions » de PNJ de l'ancienne app (nom, description, toucher, dés saisis à chaque fois)
deviennent des **attaques enregistrées** du personnage : identifiant, nom, description, action du
système, paramètres et son d'arme facultatif. Elles vivent dans character (colonne à part, comme la
mise en page), éditables par qui écrit la fiche (MJ pour un PNJ) : `PUT /v1/characters/:id/presets`.
Le menu les propose en tête ; une déclaration porte `presetId`. Elles viennent :

- du bestiaire : une action imprimée du bestiaire qui déclare son action et ses paramètres
  (`BestiaryAction.action`, `parametres`, § 14) devient une attaque enregistrée à l'instanciation ;
  sinon, elle est reprise comme texte (nom, description) sans action, et le MJ la complète une fois ;
- du modèle (« Mes PNJ ») : copiées avec l'état ;
- de l'import Firebase : `Actions` des fiches de l'ancienne app, en texte (lot character).

## 9. Droits, réglages, vue des joueurs

### 9.1 Droits

| Opération                                                    | MJ                     | Joueur                                                                  | Spectateur             |
| ------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------- | ---------------------- |
| Démarrer, terminer, réglages, participants, ordre, précédent | oui                    | non                                                                     | non                    |
| Initiative de tous, relance ou saisie d'un participant       | oui                    | son personnage, quand l'initiative lui est demandée                     | non                    |
| Suivant                                                      | oui                    | quand le participant qui agit est son personnage (existant)             | non                    |
| Acteur du créneau                                            | oui                    | son personnage, créneau de son camp, s'il n'a pas agi                   | non                    |
| Déclarer une attaque                                         | tout personnage engagé | un personnage qu'il incarne ; cibles qu'il voit ; tour selon le réglage | non                    |
| Réagir                                                       | toute cible            | une cible qu'il incarne                                                 | non                    |
| Lancer une étape de dés                                      | oui                    | ses attaques ; étape `target` de sa cible                               | non                    |
| Abandonner une attaque non résolue                           | oui                    | ses attaques                                                            | non                    |
| Appliquer, écarter, annuler, corriger l'issue                | oui                    | non                                                                     | non                    |
| Lire                                                         | tout                   | ses attaques (vue de l'attaquant) ; combat en vue expurgée              | combat en vue expurgée |

« Incarner » = `campaign_characters.played_by` (existant). Un joueur n'agit jamais avec le
personnage d'un autre, même du camp des joueurs, sauf s'il l'incarne.

### 9.2 Réglages du combat

`CombatSettings`, choisis au démarrage ou par `PATCH …/combat/settings` (MJ) :

| Réglage                 | Défaut | Sens                                                                                            |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `playersActOutsideTurn` | vrai   | un joueur attaque hors du tour de son personnage (réaction), attaque marquée « hors tour » (Q1) |
| `gmRollsHidden`         | vrai   | les attaques du MJ sont cachées par défaut (Q3)                                                 |
| `physicalDice`          | vrai   | dés 3D permis ; faux : le serveur tire tous les dés du combat                                   |

### 9.3 Vue du combat pour un joueur

`GET …/combat`, le `combat` du détail de la campagne et les événements, pour un joueur ou un
spectateur (`redacted: true`) :

- participants `visibleToPlayers: false` retirés ; `currentIndex` = index dans cette liste, ou -1
  quand le participant dont c'est le tour est caché (« Tour d'un adversaire ») ;
- `sortKeys` et `initiative` des camps autres que `players` vidés (l'initiative d'un PNJ trahit sa
  stat) ;
- en mode slots, les créneaux ne sont jamais retirés (un PNJ caché y garde son créneau : pour une
  embuscade, l'ajouter au combat à sa révélation) ;
- `combat.turn_changed` : l'événement complet (`order`, `added`, `removed`) part aux MJ ; un second,
  de même version, sans ces champs et sans identifiant de participant caché (`acted`,
  `currentActorId` à null), part aux autres ;
- `combat.started` (public) ne liste que les participants visibles ; le MJ relit l'état complet.

## 10. Temps réel

### 10.1 Événements

Sujet `vtt.<campaignId>.combat.<action>`, par l'outbox de campaign, dans la transaction de la
donnée. Agrégat `combat` (tours) ou `attack` (attaques). Charges : `CombatEventPayloads`.

| Type                          | Visibilité                                                                   | Charge                                 | Usage                                                           |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `combat.started`              | public (existant)                                                            | mode, participants visibles, round     | panneau, bandeau, chronique                                     |
| `combat.turn_changed`         | MJ complet + public expurgé (§ 9.3)                                          | cause, round, tour, acteur             | panneau, bandeau, carte, chronique                              |
| `combat.ended`                | public (existant)                                                            | round                                  | idem                                                            |
| `combat.settings_updated`     | public                                                                       | réglages, version                      | menu d'attaque                                                  |
| `combat.participant_defeated` | MJ                                                                           | personnage, attaque                    | dialogue « Hors de combat »                                     |
| `combat.attack_updated`       | MJ + `visibleToUsers` (auteur, joueurs dont une cible doit réagir ou lancer) | id, étape, statut, version             | signal : le client relit l'attaque (REST filtré)                |
| `combat.attack_resolved`      | MJ                                                                           | l'attaque complète                     | chronique du MJ ; l'auteur reçoit l'enveloppe expurgée et relit |
| `combat.attack_announced`     | public, pour une attaque `public`                                            | qui attaque qui, issue                 | chronique, carte (touché, raté)                                 |
| `combat.attack_decided`       | MJ                                                                           | décision complète                      | chronique du MJ, défis                                          |
| `combat.attack_concluded`     | public, pour une attaque `public`                                            | décision, montants du camp des joueurs | chronique                                                       |
| `combat.attack_reverted`      | MJ                                                                           | application annulée                    | chronique du MJ                                                 |

Les fiches modifiées publient `character.updated` (existant : `gm_only` + le joueur qui incarne).

### 10.2 Direct

- **`combat.aim`** (canal éphémère, `gmOnly`) : pendant que l'attaquant choisit ses cibles,
  l'attaquant (`a`) et les cibles (`t`) partent à chaque changement, puis `end` à la déclaration
  ou à l'abandon. Le MJ voit en direct qui vise qui (traits sur la carte), plus tôt que l'ancien
  marqueur écrit au lancer.
- Les dés 3D ne sont pas relayés : chacun voit le résultat (rapport, historique des dés), pas la
  physique d'un autre.

## 11. Routes prévues

### 11.1 campaign (public, gateway `/v1/campaigns/*`)

Existant, étendu :

| Méthode | Route                                 | Corps                    | Réponse, règles                                                                                |
| ------- | ------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/combat`            | —                        | `CombatState` ; vue expurgée pour un joueur (§ 9.3)                                            |
| POST    | `/v1/campaigns/:id/combat`            | `StartCombat`            | 201 `CombatState` ; + `hidden`, `settings`, `rollInitiative`, `paramsBySide` ; mode du système |
| POST    | `/v1/campaigns/:id/combat/initiative` | `RollCombatInitiative`   | `CombatState` ; + `paramsBySide`, `participants`, `askPlayers`                                 |
| POST    | `/v1/campaigns/:id/combat/next`       | `NextTurn`               | `CombatTurnResponse` ; + `version` ; journal                                                   |
| POST    | `/v1/campaigns/:id/combat/end`        | `EndCombat` (facultatif) | 204 ; + `pendingAttacks`, `clearTimedStates`                                                   |

Nouveau :

| Méthode | Route                                                                | Corps                       | Réponse, règles                                                                  |
| ------- | -------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| POST    | `/v1/campaigns/:id/combat/previous`                                  | `PreviousTurn`              | `CombatTurnResponse` (MJ) ; 409 `nothing_to_undo`                                |
| POST    | `/v1/campaigns/:id/combat/turn`                                      | `SetTurn`                   | `CombatState` (MJ)                                                               |
| POST    | `/v1/campaigns/:id/combat/slot-actor`                                | `ChooseSlotActor`           | `CombatState` ; 409 `not_their_turn`, `already_acted` (sans `force`)             |
| PUT     | `/v1/campaigns/:id/combat/order`                                     | `ReorderCombat`             | `CombatState` (MJ) ; 400 si la liste n'est pas exactement celle des participants |
| PATCH   | `/v1/campaigns/:id/combat/settings`                                  | `UpdateCombatSettings`      | `CombatState` (MJ)                                                               |
| POST    | `/v1/campaigns/:id/combat/participants`                              | `AddCombatParticipants`     | `CombatState` (MJ) ; 422 `character_not_engaged`, 409 `already_participant`      |
| PATCH   | `/v1/campaigns/:id/combat/participants/:characterId`                 | `UpdateCombatParticipant`   | `CombatState` (MJ)                                                               |
| DELETE  | `/v1/campaigns/:id/combat/participants/:characterId`                 | —                           | `CombatState` (MJ)                                                               |
| POST    | `/v1/campaigns/:id/combat/participants/:characterId/initiative`      | `RollParticipantInitiative` | `ParticipantInitiativeResult` (MJ, ou joueur si l'initiative lui est demandée)   |
| POST    | `/v1/campaigns/:id/combat/participants/:characterId/initiative/dice` | `SubmitRollDice`            | `ParticipantInitiativeResult`                                                    |
| POST    | `/v1/campaigns/:id/attacks`                                          | `DeclareAttack`             | 201 `Attack` ; `Idempotency-Key`                                                 |
| POST    | `/v1/campaigns/:id/attacks/batch`                                    | `DeclareAttacks`            | 201 `{ attacks: Attack[] }` (MJ)                                                 |
| GET     | `/v1/campaigns/:id/attacks`                                          | `ListAttacksQuery`          | `AttackPage`, filtrée pour l'appelant                                            |
| GET     | `/v1/campaigns/:id/attacks/:attackId`                                | —                           | `Attack`, filtrée ; 404 si l'appelant ne la voit pas                             |
| POST    | `/v1/campaigns/:id/attacks/:attackId/reactions`                      | `AttackReaction`            | `Attack`                                                                         |
| POST    | `/v1/campaigns/:id/attacks/:attackId/dice`                           | `SubmitRollDice`            | `Attack` ; 400 `invalid_physical_result`, 409 `step_outdated`                    |
| POST    | `/v1/campaigns/:id/attacks/:attackId/cancel`                         | `CancelAttack`              | `Attack` ; 409 `already_resolved`                                                |
| POST    | `/v1/campaigns/:id/attacks/:attackId/apply`                          | `ApplyAttack`               | `Attack` (MJ) ; 409 `version_conflict` ; 422 modification invalide               |
| POST    | `/v1/campaigns/:id/attacks/apply`                                    | `ApplyAttacks`              | `{ attacks: Attack[] }` (MJ), tout ou rien                                       |
| POST    | `/v1/campaigns/:id/attacks/:attackId/dismiss`                        | `DismissAttack`             | `Attack` (MJ)                                                                    |
| POST    | `/v1/campaigns/:id/attacks/:attackId/revert`                         | `RevertAttack`              | `Attack` (MJ) ; 409 `revert_conflict` (chemins en cause)                         |
| POST    | `/v1/campaigns/:id/attacks/:attackId/override`                       | `OverrideAttackOutcome`     | `Attack` (MJ, étape D)                                                           |

Suppression d'un PNJ tombé : route existante de la carte (`DELETE …/tokens/:tokenId?character=delete`).

Erreurs communes : 404 `no_combat`, `attack_not_found`, `target_not_found` ; 403 (rôle, personnage
non incarné) ; 409 `not_their_turn`, `version_conflict`, `combat_changed` ; 422 `action_refused`,
`no_initiative` ; 502 `character_unavailable` (rien n'est écrit). Base : nouveaux changesets
`campaign_combat_turns`, `campaign_attacks`, `campaign_attack_targets`, `campaign_attack_applications`,
colonnes ajoutées à `campaign_combats` (`settings`, `current_actor_id`, `turn`, `started_at`) et à
`campaign_combat_participants` (`visible_to_players`, `initiative`, `initiative_pending`,
`joined_round`, `defeated`).

### 11.2 character

Internes (secret `INTERNAL_API_SECRET`, appelées par campaign) :

| Méthode | Route                                       | Rôle                                                                                                                                                                                                                |
| ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/internal/actions/prepare`                 | `{ actorId, action, params, targetIds, rollMode, adjustments?, userId, campaignId }` → règles vérifiées (422 `action_refusee`), `snapshot` (opaque), réactions par cible, première étape ou résultats (dés serveur) |
| POST    | `/internal/actions/resolve`                 | `{ snapshot, params, reactions, faces, rollMode, serverFallback?, forcer?, diceHistory }` → étape suivante, ou résultats par cible (complet et vue de l'attaquant), coûts de l'attaquant, jet transmis à dice       |
| POST    | `/internal/modifications/apply`             | `{ applications: [{ applicationId, userId, campaignId, items: [{ characterId, modifications, tables }] }] }` → par fiche : version, `changes`, `defeated` ; transaction unique, idempotent                          |
| POST    | `/internal/modifications/revert`            | `{ applicationId, characterIds?, force? }` → rendues, conflits (409)                                                                                                                                                |
| POST    | `/internal/characters/:id/durees/decompter` | existant + `tickId` : idempotent, annulable par `modifications/revert` (`applicationId = tickId`)                                                                                                                   |

Publiques : `POST /possessions` accepte `duree` (états) et `soundAssetId` (son d'un exemplaire) ;
`PUT /v1/characters/:id/presets` (attaques enregistrées) ; la fiche d'un PNJ ennemi n'est plus lisible
par les joueurs (Q4). L'action publique `…/actions/:action` avec `appliquer` et une cible reste pour
la compatibilité ; le front n'y passe plus pour attaquer.

#### Forme exacte des routes internes (fixée par le lot 2)

Champs en anglais ; types du contrat (`@vtt/contracts`, `combat.ts`) quand ils existent. Erreurs en
problem+json : 400 `validation_failed`, 404 `character_not_found` (un personnage absent ou
supprimé, rien n'est écrit), 422 `action_refusee` (règles), 422 `modification_invalide`.

**`POST /internal/actions/prepare`**

```
{ actorId, action, params?, targetIds (1..50, uniques, l'attaquant permis),
  rollMode?,            // absent : multicible.jet de l'action, sinon per_target
  adjustments?,         // RollAdjustments
  dice?,                // 'server' (défaut) | 'physical' ; étape B : toujours server
  userId, campaignId,
  diceHistory? }        // { campaignId, authorId, visibility } : jet transmis à dice si résolu ici
→ 200 { snapshot,       // objet opaque : le rendre tel quel à resolve (colonne réservée de campaign)
        action: { id, name },
        rollMode, dice,  // retenus
        targets: [{ characterId, error: string | null, reactionParams: string[] }],
        step: RollStep | null,               // dés physiques à lancer (étape C)
        resolution: ActionResolution | null } // résolu tout de suite : dés serveur, aucune réaction
```

- `params` : ceux de l'attaquant ; un paramètre `par: cible` envoyé ici est ignoré.
- `reactionParams` : paramètres `par: cible` proposés à cette cible (leur `exige` est vrai pour
  elle). Dès qu'une cible en a, `resolution` est null : campaign attend les réactions, puis appelle
  resolve (même avec des dés serveur).
- Refus de toutes les cibles, ou refus propre à l'attaquant (paramètre, `exige`) : 422
  `action_refusee`, `detail` = les messages. Refus d'une partie des cibles : `error` renseigné,
  la cible est `failed` dans la résolution, les autres continuent.

**`POST /internal/actions/resolve`**

```
{ snapshot, params?, rollMode, adjustments?, dice?,
  reactions?: [{ characterId, params?, skipped? }],  // absente ou skipped : valeurs par défaut
  stepId?, faces?: [{ id, value }], serverFallback?, // étape C (étape B : le serveur tire tout)
  forcer?: [{ characterId, success?, critical? }],   // étape D (§ 7.5)
  diceHistory? }
→ 200 { step: RollStep | null, resolution: ActionResolution | null }  // l'un ou l'autre

ActionResolution = {
  targets: [{ characterId, status: 'resolved' | 'failed', error: string | null,
              result: AttackTargetResult | null,    // MJ seul
              view: AttackTargetView | null }],     // attaquant (vueActeur)
  actor: { modifications: AttackModification[] } }  // coûts de l'attaquant, comptés une fois
```

- Déterministe : même instantané, mêmes paramètres, mêmes faces, même résultat.
- `result.modifications` : celles de la cible (`entity: target`) ; celles de l'attaquant sont dans
  `actor` (celles de la première cible résolue, une seule fois, quel que soit `rollMode`).
- Jet de l'historique (`diceHistory`) : transmis à dice après la résolution, réduit à la vue de
  l'attaquant ; un par cible en `per_target`, un seul en `shared` (les dés communs).

**`POST /internal/modifications/apply`**

```
{ applications: [{                       // 1..50, une seule transaction : tout ou rien
    applicationId,                       // texte (UUIDv7 de campaign) ; idempotence
    userId?, campaignId,                 // auteur (MJ) et campagne des événements character.updated
    items: [{ characterId,               // 1..100 ; un personnage peut revenir (auto-attaque)
              modifications: AttackModificationInput[],
              tables?: [{ table, entry: string | null }] }] }] }  // entrée d'une ligne de la table
→ 200 { applications: [{ applicationId, replayed: boolean,     // déjà appliquée : réponse d'origine
        items: [{ characterId, version, changes, defeated }] }] } // un par personnage
```

- Aucun dé : les valeurs sont appliquées telles quelles ; une ressource est ramenée dans ses bornes
  (un dépassement du maximum reste permis si elle n'est pas plafonnée).
- `defeated` : formule `horsCombat` du type d'entité sur la fiche après application (faux sans
  formule). 422 `modification_invalide` (attribut qui n'est ni de base ni une ressource, entrée
  inconnue ou non possédable, table inconnue, entrée absente de la table), avec `errors:
[{ characterId, message }]` ; rien n'est écrit.

**`POST /internal/modifications/revert`**

```
{ applicationId, characterIds?, force?, userId? }
→ 200 { applicationId,
        items: [{ characterId, status: 'reverted' | 'already_reverted' | 'missing',
                  version, changes, defeated }] }
```

- 404 `application_not_found` ; 409 `revert_conflict`, `conflicts: [{ characterId, paths }]`
  (chemins au format de `changes` : `etat.valeurs.PV`, `etat.possessions[entree#exemplaire]`,
  `etat.bonus[id]`), rien n'est écrit ; `force` rend quand même. `missing` : personnage supprimé
  depuis, ignoré. Une fiche touchée deux fois dans une application (auto-attaque : cible et coûts
  de l'attaquant) se rend en entier.
- Un décompte de durées se rend de la même façon : `applicationId = tickId`.

**`POST /internal/characters/:id/durees/decompter`** : corps existant + `tickId?` (texte,
`tick:<combatId>:<round>`) ; réponse existante (`modifie`, `retirees`, `version`) + `replayed`. Même
`tickId` et même personnage : rien n'est décompté une seconde fois, la réponse d'origine revient.

### 11.3 audio (Q2)

`POST /internal/campaigns/:id/cues { assetId }` (auteur système) : joue un effet de la bibliothèque
de la campagne, avec la limite de débit des effets. Seul appelant : campaign, son d'arme.

## 12. Interfaces

### 12.1 Menu d'attaque

Panneau flottant non modal, ancré à gauche de la carte (plein écran sur mobile) : la carte reste
visible et cliquable pour viser.

**Entrées :**

- menu contextuel d'un token : « Attaquer » (cible : ce token ; attaquant : mon personnage, ou pour
  le MJ le participant qui agit, sinon le choix) ;
- barre de la sélection (MJ) : « Attaquer avec » (le PNJ sélectionné attaque) et « Attaquer » (la
  sélection devient les cibles) ; « Attaquer avec la sélection » (plusieurs PNJ, § 8.2) ; pour un
  joueur, « Attaquer » s'affiche au clic sur un token qui n'est pas à lui (`forPlayers`) ;
- gabarit ou mesure récente : « Attaquer la zone (n) » (tokens vus dans la forme, jet commun si
  l'action le déclare) ;
- fiche : bouton « Attaquer » du bloc Actions (les actions à cible y sont aujourd'hui écartées) ;
- panneau Combat : « Attaquer » sur le participant qui agit ;
- clavier : `Y` (encore libre, carte.md § 6), sélection = cibles (proposition).

**Déroulé (une seule vue, de haut en bas) :**

1. **Attaquant** : bandeau de la fiche (portrait, ressources, attributs de la présentation), menu
   pour en changer (MJ).
2. **Action** : attaques enregistrées, puis actions groupées par la présentation ; description.
3. **Paramètres** : formulaire généré ; son d'arme à côté d'un paramètre d'exemplaire (choix parmi
   les effets de la campagne, écoute, « Silencieux », enregistré sur l'exemplaire).
4. **Cibles** : puces (portrait, nom connu de moi) ; mode visée : curseur de visée, un clic sur un
   token ajoute ou retire (⇧ : plusieurs), Échap termine ; « Cibles dans la zone » ; liste des
   participants. `combat.aim` part au MJ à chaque changement.
5. **Jet** : un jet par cible ou commun (dès deux cibles), dés 3D ou serveur, visibilité (MJ),
   ajustements libres (repliés).
6. **Aperçu** : formule ou pool de l'attaquant, « selon la cible » pour le reste.
7. **Attaquer** : invite de réaction s'il y a lieu (« En attente de la défense de … »), puis dés 3D
   (§ 12.2), puis résultat par cible : issue (Touché, Raté, Critique, Échec critique), dés et
   total, valeurs visibles, symboles (icônes de la présentation), « Rapport envoyé au MJ » puis son
   statut en direct (appliqué, écarté). Boutons : « Nouvelle attaque », « Mêmes cibles », « Fermer ».

« Mes attaques » : les attaques du combat de ce joueur, avec leur statut.

### 12.2 Dés dans le menu

- Une étape = un lancer 3D (`useDiceThrowStore`, `lib/dice-throw.ts`) ; chaque dé porte un repère
  de sa cible (couleur ou initiale) quand il y en a plusieurs.
- Faces lues à l'arrêt → `…/dice` ; l'étape suivante se lance dès qu'elle arrive.
- Repli (délai, pas de forme 3D, au-delà de 15 dés) comme le lanceur (§ 6.3), signalé.
- Aucune animation d'un résultat tiré par le serveur.

### 12.3 Panneau Combat (MJ) : remplace « MJ »

Entrée du registre `combat` (libellé « Combat », touche M, rôles `gm`, largeur `medium`, ancré à
gauche : la carte reste visible) ; `?panneau=mj` y mène. Trois onglets :

- **Tours** (par défaut en combat) :
  - hors combat : « Démarrer un combat » (tokens de la scène présélectionnés, cases, cachés,
    initiative tout de suite, paramètres par camp, réglages) ;
  - en-tête : round, mode, Initiative (tous, par camp : formulaire de l'action d'initiative),
    Précédent, Suivant, Terminer (rapports en attente : garder ou écarter ; états à durée) ;
  - mode slots : barre des créneaux J/E (courant surligné), « Qui agit ? » : participants du camp,
    coche sur ceux qui ont agi, « Rejouer » (force) ;
  - ordre : position, portrait, nom, jauge de la ressource principale, initiative et son détail,
    badges d'états avec durée, œil (caché aux joueurs), hors de combat grisé ; glisser pour
    réordonner ; menu : relancer ou saisir l'initiative, donner le tour, attaquer avec, fiche,
    retirer ; « Ajouter » (tokens de la scène, personnages engagés) ;
  - fiche du participant (tiroir) : bandeau de la présentation, ressources modifiables, états (liste
    du système, état libre, durée), initiative et ses paramètres (l'ancien override par personnage),
    « Ouvrir la fiche ».
- **Rapports** (pastille : nombre en attente) : § 12.4.
- **Héros** : l'ancien panneau MJ à l'identique (§ 2.6).

### 12.4 Rapports (MJ)

- Filtres : en attente, décidés, tous ; ce combat, hors combat.
- Carte d'un rapport : attaquant → cibles, action et paramètres clés (arme), « hors tour »,
  « auto-attaque », « ajusté à la main », source des dés (3D, mixte, serveur), heure.
- Une ligne par cible : issue, dés (repliés), modifications proposées (valeur, type, résistances
  appliquées en info-bulle), table tirée, puis **Appliquer**, **Modifier**, **Ne pas appliquer** ;
  coûts de l'attaquant sur une ligne à part.
- Modifier : tiroir avec les raccourcis de § 7.1, aperçu de la ressource avant et après.
- Décidé : grisé, ce qui a été appliqué, « Annuler l'application ».
- « Tout appliquer (n) » : revue groupée (§ 7.4). « Détail » : déroulé complet, construction du pool.

### 12.5 Carte

Nouveau module `lib/map/modules/combat/` (surcouches, sans entité) :

- anneau du tour sur le token du participant qui agit, pour tous s'il est vu ;
- anneau des cibles de toute attaque ouverte (non décidée), MJ, **toujours visible** (même bordures
  et badges coupés) ; un joueur voit les cibles de ses propres attaques ouvertes ;
- traits de visée en direct (`combat.aim`, MJ) ;
- badges d'états sur le token (icônes de la présentation, libellé au survol, durée) ;
- token hors de combat grisé (MJ ; joueurs pour un personnage vu) ;
- outil de visée du menu d'attaque (curseur, clic sur un token), qui ne vole aucun autre geste.

Entrées de menu : `lib/map/modules/tokens/menu.ts`, `components/map/selection-bar.tsx`,
`lib/map/modules/measurements/kind.ts`.

### 12.6 Vue des tours pour les joueurs

Bandeau d'initiative en haut de la table (HUD) : portraits dans l'ordre (vue expurgée), tour courant
surligné, round ; « À vous ! » quand c'est le tour d'un personnage que j'incarne, avec « Terminer mon
tour » ; en mode slots, suite J/E et « Je prends ce créneau » pour mon personnage si le créneau est à
mon camp ; invite d'initiative à lancer ; invite de réaction. Les spectateurs voient le bandeau sans
boutons.

## 13. Nuances par système

### 13.1 D&D classique (`dnd-classic`)

- Attaque : `1d20 + valeur(arme.attaque)` (Contact ou Distance) contre `@cible.Defense` (+
  `DefContact` au contact) ; avantage et désavantage (`2d20k1`, `2d20kl1`) par paramètres et par
  états (`cote: cible` : attaques contre un aveuglé à l'avantage).
- Critique à partir du seuil de l'arme (`min(@Critique, arme.critique)`) : touche toujours, double
  les dés de l'arme (`multiplier_des`) ; 1 naturel : échec critique.
- Options réservées aux capacités (Double attaque, Attaque à outrance, Assaut final…) : paramètres
  à `exige`, cachés si le personnage n'a pas la capacité.
- Dégâts typés (`typesDegats`), RD, résistances et immunités (`sur: degats`), Instinct de survie et
  demi-dégâts de la cible, au moins 1 DM : tout est dans les formules et les effets, déjà compté dans
  les valeurs proposées au MJ.
- Sorts (`sort`, capacité étiquetée « sort ») : défense visée (DEF, PV, SAG…), état infligé pour une
  durée tirée aux dés (conséquence `donner` avec `duree`).
- Zones (boule de feu, foudre, cône de froid, souffle…) : `multicible: { jet: commun }` ; soins de
  groupe : `multicible: { jet: par-cible }` (« un jet par cible »).
- « Custom » de l'ancienne app : `attaque-libre` (dés saisis) et `degats-libres` (dégâts sans
  jet : piège, chute).
- Jets de sauvegarde (« test de DEX pour la moitié ») : texte aujourd'hui ; brique `sauvegarde`
  (étape D), « Moitié » d'ici là.
- Initiative individuelle, `1d20 + @INIT`. Hors de combat : `@PV <= 0`.
- PNJ du bestiaire : actions imprimées → attaques enregistrées (§ 8.3).

### 13.2 Nooblies

Structure de D&D, plus simple : `attaque` (score d'attaque au choix, dés de dégâts saisis),
`coup-de-corne` (capacité raciale), Instinct de survie de la cible (capacité raciale
`cote: cible`), initiative `1d20 + @INIT`, individuelle. Hors de combat : `@PV <= 0`.

### 13.3 Star Wars, Aux confins de l'Empire

- Pool : Aptitude (caractéristique ou rang, le plus haut), amélioré en Maîtrise (le plus bas) ;
  compétence lue sur l'arme ; difficulté par la bande de portée (2 au contact), plus le couvert de
  la cible ; Défense de la cible en Infortune ; qualités de l'arme (Précis, Inexact) ; options des
  talents (Visée précise, Attaque frénétique, Tir de précision…) avec leur coût en stress (coûts de
  l'attaquant, § 7.1).
- Touche avec au moins 1 succès net ; dégâts = arme + succès nets + talents − (encaissement −
  Perforant) ; dégâts étourdissants en stress (Résolution de la cible).
- Critique : activations = Triomphes + Avantages ÷ indice, seulement si des dégâts passent ; table
  `blessures-critiques` tirée avec son modificateur (+10 par critique subie, Vicieux, +10 par
  activation en plus, résistance de la cible). Le d100 n'a pas de forme 3D : tiré par le serveur.
  Le MJ applique la blessure, ou en choisit une autre (§ 7.1).
- Défense active : Pas de côté et Posture défensive (effets de la cible, automatiques), Protecteur
  (attribut `protection` de la cible) ; **Esquive** : réaction de la cible (`par: cible`, à corriger
  dans les données, § 15).
- Initiative : Sang-froid (préparé) ou Vigilance (surpris) **par camp**, override par personnage ;
  tri succès nets puis avantages nets ; joueurs d'abord à égalité ; **mode créneaux**
  (`initiative.mode: creneaux`).
- Hors de combat : attribut dérivé `neutralise` (blessures ou stress au-delà du seuil).
- Soins (Médecine, Mécanique pour un droïde), stimpack : actions à cible, même menu, même rapport.
- Avantages et Menaces à dépenser (Désorientation, Renverser…) : montrés au MJ dans le rapport
  (symboles) ; « options après le jet » restent une brique à venir (regles.md, « Dépenses après le
  jet »), comme l'ancienne app qui les laissait à la table.
- Stances « jusqu'au round suivant » (`pasDeCote`, `postureDefensive`, `protection`) : remises à 0 à
  la main aujourd'hui (action « Défense active » à 0) ; brique proposée `reinitialiser` (§ 14).
- Hors de ce chantier, sans rien perdre de l'ancienne app : combat de véhicules (type `vehicule`,
  l'ancienne app ne faisait que lister les cibles d'une zone), groupes de sbires.

### 13.4 Ce qui reste des données

Aucune de ces nuances n'est dans le code : pool, difficulté, critique, tables, types de dégâts,
réactions, jet commun, mode créneaux, hors de combat, groupes du menu, états et leurs icônes sont
des champs du système ou de sa présentation. Un système créé par un MJ les obtient en les déclarant.

## 14. Briques de règles à ajouter (`packages/rules`, `packages/systemes`)

| Brique                                                | Où                                | Sens                                                                                         |
| ----------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `Generateur.entier(max, contexte?)`, `phase?`         | `formules/aleatoire.ts`, `jets/*` | sorte du dé à symboles ; début de phase (§ 6.4)                                              |
| `aleatoirePlanifie`, `DesRequis`                      | `jets/planification.ts` (nouveau) | rejouer des faces, planifier l'étape suivante                                                |
| `executerMulticible`                                  | `jets/multicible.ts` (nouveau)    | une exécution par cible, jet commun par phase et par position, coûts de l'attaquant une fois |
| `ajustements`, `forcer` de `DemandeAction`            | `jets/actions.ts`                 | dés et bonus libres ; issue corrigée (§ 7.5)                                                 |
| `cote` de `EtapePool` et `BonusJet`                   | `jets/actions.ts`                 | action, acteur ou cible : pour la vue de l'attaquant                                         |
| `vueActeur(resultat, action, systeme)`                | `jets/vue-acteur.ts` (nouveau)    | projection pour l'attaquant et l'historique des dés (§ 5.6)                                  |
| `Action.multicible`                                   | `schema/systeme.ts`               | `{ jet: commun \| par-cible, max? }` : défaut du mode de jet, plafond de cibles              |
| `visibilite: acteur \| mj` sur `variables` et `apres` | `schema/systeme.ts`               | valeurs montrées à l'attaquant ; défaut `mj`                                                 |
| `Initiative.mode`                                     | `schema/systeme.ts`               | `individuel` (défaut) ou `creneaux`                                                          |
| `TypeEntite.horsCombat`                               | `schema/systeme.ts`               | formule booléenne : hors de combat                                                           |
| `Action.sauvegarde` (étape D)                         | `schema/systeme.ts`, `jets/*`     | jet de la cible (action, paramètres, difficulté), `sauvegardeReussie` lu par `apres`         |
| `Attribut.reinitialiser` (proposé)                    | `schema/systeme.ts`               | `{ quand: debut-round \| debut-tour \| fin-combat, valeur }` : stances Star Wars             |
| présentation `combat`                                 | `schema/presentation.ts`          | `groupes: [{ titre, actions }]` du menu, `etats: { sortes, icones }`                         |
| `BestiaryAction.action`, `parametres`                 | `schema/bestiaire.ts`             | action imprimée jouable → attaque enregistrée                                                |

Données : `multicible` des zones (D&D) ; `visibilite: acteur` des dégâts lancés (D&D `degats`,
Nooblies `degats`, Star Wars `degatsBruts`) ; Star Wars `initiative.mode: creneaux` et Esquive
`par: cible` ; `horsCombat` de chaque type d'entité ; présentation `combat` des trois systèmes.
Chaque ajout est validé au chargement (références, types) et documenté dans regles.md.

## 15. Incohérences de l'existant relevées

1. **`appliquer` relance les dés** (`jouerAction`) : résolution et application dans le même appel,
   tirage neuf. Le combat sépare les deux (§ 7.2) ; la route publique reste pour les actions sans
   cible de la fiche.
2. **Tables jamais appliquées** : `resoudreAction` ignore `resultat.tables` (`appliquerTirage` n'est
   appelé nulle part). L'application du combat les applique (§ 7.2).
3. **Fiches de PNJ lisibles par les joueurs** : `campaigns-of` donne `read` à tout membre d'une
   campagne où le personnage est engagé, PNJ ennemis compris ; l'ancienne app les cachait
   (`canViewDetails`). Sans correction, le filtrage des rapports ne protège rien (Q4).
4. **Jet d'action transmis à dice avec tout le déroulé** : `explications` nomme les défenses de la
   cible, et le jet est public par défaut. À remplacer par la vue de l'attaquant (§ 7.7).
5. **État du combat entier pour tous** : `GET …/combat`, le détail de la campagne et
   `combat.turn_changed` donnent à un joueur les identifiants de tous les participants (PNJ cachés
   compris) et leurs clés d'initiative (§ 9.3).
6. **Mode créneaux choisi à la main** : le MJ passe `mode: 'slots'` pour Star Wars ; c'est une règle
   du système (`initiative.mode`).
7. **Esquive saisie par l'attaquant** : le paramètre `esquive` de l'attaque Star Wars n'est pas
   `par: cible` ; c'est pourtant la cible qui subit le stress et décide.
8. **Actions du bestiaire perdues** : les actions imprimées ne suivent pas l'instance de PNJ.
9. **`POST /possessions` sans durée** : impossible de donner un état pour N rounds depuis la fiche.
10. **Décompte des durées ni idempotent ni réversible** : pas de `tickId`, pas de retour arrière.
11. **Son d'arme et décision audio Q4** : l'ancienne app jouait le son à tous depuis le client du
    joueur ; audio réserve les effets au MJ (Q2).
12. **Stances Star Wars sans fin** : `pasDeCote`, `postureDefensive`, `protection` restent tant que
    personne ne les remet à 0.

## 16. Découpage en lots

### Étapes

| Étape | Contenu                                                                                                                                                               | Lots       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A     | Tours : précédent, journal, participants, initiative par camp et individuelle, réglages, vue expurgée ; panneau Combat (Tours, Héros) et bandeau joueur               | 1, 2, 4    |
| B     | Attaques en dés serveur de bout en bout : déclaration, réactions, résolution, rapports, application, annulation, revue groupée, hors de combat, menu d'attaque, carte | 1, 2, 3, 4 |
| C     | Dés physiques : générateur planifié, étapes, 3D dans le menu, initiative lancée par les joueurs                                                                       | 1, 2, 3, 4 |
| D     | Corriger l'issue, jets de sauvegarde, attaques enregistrées du bestiaire, son d'arme (Q2), réinitialisation des stances                                               | 1, 2, 3, 4 |

Le contrat (`packages/contracts/src/combat.ts`) est livré ; un lot n'y fait que des ajouts, remontés
dans son rapport.

### Lot 1 : backend campaign

- `backend/campaign/db/changes/0023-combat-turns.sql` (réglages, acteur, tour, journal, colonnes des
  participants), `0024-combat-attacks.sql` (attaques, cibles, applications), `changelog.yaml`,
  `9999-droits.sql` si besoin.
- `backend/campaign/src/db/schema.ts`.
- `backend/campaign/src/modules/combat/` : `index.ts` (routes du combat), `api.ts` (réponse,
  vue expurgée), `repository.ts`, `turns.ts` (+ précédent, donner le tour, acteur du créneau,
  ajout), `turn-log.ts`, `participants.ts`, `initiative.ts`, `view.ts`, et leurs tests.
- `backend/campaign/src/modules/attacks/` (nouveau) : `index.ts` (routes), `repository.ts`,
  `lifecycle.ts` (statuts, étapes), `rights.ts`, `redact.ts`, `events.ts`, `application.ts`, tests
  d'intégration (droits, non-fuite, idempotence, annulation, jet commun).
- `backend/campaign/src/clients/character.ts` (prepare, resolve, apply, revert, tick), `clients/audio.ts`
  (Q2).
- `backend/campaign/src/modules/campaigns/repository.ts` (combat expurgé dans le détail),
  `modules/schemas.ts` (reprendre le contrat).
- `docs/api-campaign.md` (§ Combat, Attaques, Événements).

### Lot 2 : backend character et règles

- `packages/rules/src/` : `formules/aleatoire.ts` ; `jets/actions.ts`, `jets/symboles.ts`,
  `jets/tables.ts`, `jets/initiative.ts`, `jets/index.ts` ; nouveaux `jets/planification.ts`,
  `jets/multicible.ts`, `jets/vue-acteur.ts` ; `schema/systeme.ts`, `schema/presentation.ts`,
  `schema/bestiaire.ts` ; `chargement/*` (validation) ; tests.
- `packages/systemes/systemes/<système>/systeme.yaml` et `presentation.yaml` des trois systèmes (et
  le bestiaire D&D pour les actions jouables, étape D).
- `backend/character/src/modules/interne/` : `actions.ts` (prepare, resolve), `modifications.ts`
  (apply, revert), `index.ts` (tick `tickId`) ; `regles/operations.ts` ; `des/dice.ts` (vue de
  l'attaquant) ; `modules/personnages/{index.ts, depot.ts}` (durée des possessions,
  `soundAssetId`, attaques enregistrées, lecture des PNJ, Q4) ; import (`Actions` → attaques
  enregistrées).
- `backend/character/db/changes/0010-applications.sql` (applications, diffs, ticks),
  `0011-presets.sql`.
- `docs/api-character.md`, `docs/regles.md` (§ 7 et référence rapide).

### Lot 3 : front, carte et menu d'attaque

- `frontend/src/lib/combat/` (nouveau) : `api.ts` (client typé du contrat), `use-combat.ts`,
  `use-attacks.ts` (relecture sur `combat.attack_updated`), `attack-flow.ts` (machine à états du
  menu, testée), `dice-steps.ts` (étapes → lanceur 3D → faces), `aim.ts` (`combat.aim`).
- `frontend/src/components/combat/attack/` (nouveau) : `attack-menu.tsx`, `attacker-header.tsx`,
  `action-picker.tsx`, `params-form.tsx` (champ de paramètre partagé, repris de
  `components/fiche/lanceur-action.tsx`), `targets.tsx`, `roll-options.tsx`, `result-card.tsx`,
  `my-attacks.tsx`, `weapon-sound.tsx`.
- Carte : `frontend/src/lib/map/modules/combat/` (nouveau module : surcouches, outil de visée),
  une ligne dans `lib/map/modules/index.ts` ; entrées dans `lib/map/modules/tokens/menu.ts`,
  `components/map/selection-bar.tsx`, `lib/map/modules/measurements/kind.ts`.
- Fiche : `components/fiche/widgets.tsx` (bouton « Attaquer » du bloc Actions),
  `components/fiche/lanceur-action.tsx` (export du champ de paramètre).

### Lot 4 : front, panneau des tours et rapports

- `frontend/src/components/table/onglets/combat.tsx` (remplace `mj.tsx`),
  `components/table/panels/registry.ts` (entrée `combat`, alias `mj`).
- `frontend/src/components/combat/turns/` (nouveau) : `turns-panel.tsx`, `start-combat.tsx`,
  `order-list.tsx`, `slot-bar.tsx`, `participant-drawer.tsx`, `initiative-form.tsx`,
  `states-manager.tsx`, `heroes.tsx` (l'ancien panneau MJ).
- `frontend/src/components/combat/reports/` (nouveau) : `report-list.tsx`, `report-card.tsx`,
  `decision-drawer.tsx`, `bulk-review.tsx`, `defeated-dialog.tsx`.
- `frontend/src/components/combat/player/` (nouveau) : `initiative-strip.tsx`,
  `reaction-prompt.tsx` ; `components/table/hud.tsx` (bandeau).
- `frontend/src/components/historique/format.ts` (rendu des nouveaux événements).

### Règles pour tous

- On ne modifie que les fichiers de son lot ; un besoin hors lot (contrat, moteur) est un ajout
  minimal, ou une demande remontée dans le rapport.
- Tests : non-fuite (un joueur ne reçoit aucune valeur d'un PNJ, en REST, par événement, dans
  l'historique des dés), déterminisme (mêmes faces, même résultat), idempotence (application,
  décompte), annulation.
- Commits en français, conventional commits, chemins explicites (`git commit -- <chemins>`).
- Jamais `pnpm install` ni `pnpm add`, jamais `next dev`, jamais Playwright.

## 17. Questions à Théo

| #   | Question                                                                                          | Recommandation                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Un joueur peut-il attaquer **hors du tour** de son personnage (réaction, attaque d'opportunité) ? | **Oui par défaut** (l'ancienne app ne vérifiait rien) : attaque marquée « hors tour » dans le rapport ; réglage du combat pour l'interdire.                                                   |
| Q2  | **Son d'arme** : l'ancienne app le jouait à tous ; la décision audio Q4 réserve les effets au MJ. | **campaign le joue** à la touche (auteur système), seulement le son lié à l'exemplaire, pris dans la bibliothèque de la campagne, avec la limite de débit : le joueur ne lance rien lui-même. |
| Q3  | Les attaques du **MJ** sont-elles **cachées** par défaut ?                                        | **Oui** : les joueurs ne voyaient jamais les jets des PNJ dans l'ancienne app ; bascule par attaque et réglage du combat.                                                                     |
| Q4  | **Fiches de PNJ** : aujourd'hui lisibles par tout membre (character). On restreint ?              | **Oui** : fiche d'un PNJ hors du camp des joueurs réservée au MJ (parité avec l'ancienne app, `canViewDetails`) ; les alliés restent lisibles. Sans cela, aucun filtrage n'a de sens.         |
