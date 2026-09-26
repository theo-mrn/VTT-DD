# Système de règles — conception

Socle de toutes les règles de jeu : un **moteur générique** (`packages/rules`) qui ne connaît aucun jeu, et des **systèmes décrits entièrement en données**. D&D, Star Wars (Aux confins de l'Empire) ou un système maison s'écrivent de la même façon, sans une ligne de code propre au jeu.

## Pourquoi

L'ancien moteur a été construit après coup, un besoin à la fois :

- **Règles codées en dur.** Toute la progression Star Wars est écrite dans le code : compétence à 5 × rang (+5 hors carrière), caractéristique à 10 × valeur plafonnée à 5, spécialisation à 10 × nombre (+10 hors carrière), talent au coût × rang. Un autre système ne peut pas les changer.
- **Cas particuliers empilés.** `GameSystemDefinition` a gagné un champ par besoin : `combat` (clés Star Wars), `initiative` (deux modes exclusifs), `obligation` (EotE), `diceUpgradeRule`, `hitDie` sur le profil…
- **Règles et interface mélangées.** La disposition de la fiche, la barre latérale, les polices, le fond, les cartes et la bibliothèque d'objets sont rangés au même endroit que les règles.
- **Interface liée à D&D.** Une dizaine de composants lisent directement `FOR`, `PV`, `Defense`, `INIT`, `Contact`…

**Objectif.** Tout ce qui décrit une règle est une donnée validée au chargement. Le moteur fournit des briques génériques, et aucun composant ni service ne connaît le nom d'une stat.

## Principes

1. **Aucune valeur de jeu dans le code.** Un coût, un plafond, un bonus ou un dé est une donnée ou une formule du système.
2. **Des briques génériques plutôt que des champs spéciaux.** Chaque besoin se construit par composition (attributs, formules, effets, achats, jets, tables). « Obligation » ou « Initiative » ne sont pas des concepts du moteur.
3. **Validé au chargement.** Un système est vérifié entièrement avant usage : références existantes, types cohérents, pas de dépendance circulaire, formules analysées. Une erreur est signalée avec son chemin exact, et un système invalide n'est jamais utilisé à moitié.
4. **Déterministe et explicable.** Même état et mêmes dés donnent le même résultat. Chaque valeur calculée peut expliquer son origine (« Défense 15 = 10 + mod(DEX) 3 + armure de cuir 2 »), ce que la fiche affiche au survol.
5. **Même moteur partout.** `packages/rules` est du TypeScript pur, sans I/O. Le front l'utilise pour l'aperçu immédiat, le service character pour faire autorité : le serveur recalcule, le client ne peut pas tricher.
6. **Versionné.** Un système porte une version, et chaque personnage enregistre la version sous laquelle il a été calculé. Un changement de règles passe par une migration explicite.

## Le modèle

Un système est un document (YAML ou JSON) composé des blocs ci-dessous. Chaque bloc est facultatif : un système minimal peut ne déclarer que des attributs.

### 1. Formules

Toutes les valeurs calculées s'écrivent sous forme de texte, analysé en arbre (jamais `eval`) :

```
floor((@FOR - 10) / 2)                  # modificateur D&D
max(@succes - @echec, 0)                 # succès nets
10 + mod(DEX) + somme(effets "armure")   # défense
si(@carriere, 5 * cible, 5 * cible + 5)  # coût d'un rang de compétence EotE
2d6 + @FOR                               # jet
```

- **Références** : `@clé` pour un attribut de l'entité, `mod(clé)` pour son modificateur, et des variables fournies par le contexte (`cible`, `rang`, `nombre`, `@carriere`…).
- **Fonctions** : `floor`, `ceil`, `round`, `min`, `max`, `clamp`, `abs`, `si`, `somme`, `compte`, comparaisons et opérateurs booléens.
- **Dés** : `NdM`, garder le meilleur ou le pire (`4d6k3`), dés explosifs.
- **Vérification** : chaque référence est contrôlée au chargement (clé existante, bon type), et une formule inconnue ou mal typée est refusée avec sa position exacte.

L'éditeur du MJ manipule ce texte, plus lisible que l'actuel arbre JSON écrit à la main.

### 2. Entités et attributs

Un système déclare ses **types d'entité** (personnage, PNJ, véhicule, groupe…) et leurs **attributs**. L'actuelle « entité de groupe » devient un type d'entité comme les autres.

| Nature                      | Rôle                                                                        | Exemple                                         |
| --------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `base`                      | Valeur saisie, achetée ou tirée                                             | FOR, Vigueur                                    |
| `derivee`                   | Formule recalculée en continu                                               | Défense, Seuil de blessure                      |
| `ressource`                 | Valeur courante bornée par un maximum, qui se récupère vers un sens déclaré | PV (se récupèrent vers le max), Stress (vers 0) |
| `compteur`                  | Remplie par un jet, lue par des dérivées                                    | Succès bruts, Avantages                         |
| `texte`, `choix`, `booleen` | Informatif ou énuméré                                                       | Historique, Alignement                          |

Chaque attribut porte aussi son libellé, son groupe d'affichage, sa visibilité (tous ou MJ seul), sa valeur par défaut, et sa **formule de modificateur** s'il en a une (propre à l'attribut ou commune à tout le système).

### 3. Catalogues

Les races, classes, carrières, spécialisations, compétences, talents, armes, armures, qualités d'arme, états (étourdi, à terre…) et blessures critiques sont tous des **entrées de catalogue**. Le système déclare lui-même ses **sortes** d'entrée, avec leurs champs propres : le moteur n'a pas de liste fermée.

Une entrée peut :

- **appliquer des effets** (bloc 4) ;
- **accorder** d'autres entrées : une carrière accorde ses compétences de carrière, une espèce ses capacités ;
- **exiger** une condition (formule) ;
- **être possédée** par une entité (au rang voulu pour une compétence ou un talent).

Le contenu volumineux (bestiaire, équipement, les 100 espèces Star Wars) reste du contenu de catalogue, stocké et importé séparément, mais validé contre le même schéma.

### 4. Effets (modificateurs)

C'est le **mécanisme unique** de tous les bonus. Il remplace les modificateurs raciaux, la collection `Bonus`, les effets de talents, d'objets et d'états.

```yaml
- cible: DEX
  operation: ajouter # ajouter | multiplier | fixer | plancher | plafond | ameliorer-des
  valeur: 2 # une formule
  condition: '@equipe' # facultatif : actif seulement si vrai
  famille: armure # les effets d'une même famille ne se cumulent pas (le meilleur s'applique)
```

Le calcul suit un **ordre fixe et documenté** : valeurs de base, puis effets par phase (fixer, ajouter, multiplier, bornes), puis dérivées dans l'ordre du graphe de dépendances. Les cycles sont refusés au chargement. Chaque effet garde sa source (objet, talent, état), ce qui alimente les explications affichées sur la fiche.

### 5. Progression et achats

Les points dépensables (XP, points de création, points de compétence…) sont des **monnaies** déclarées par le système. Chaque **achat** décrit :

- ce qu'on obtient : augmenter un attribut, un rang de compétence, acquérir une entrée de catalogue, un nœud d'arbre ;
- le coût, sous forme de formule (`cible`, `rang`, `nombre`, `@carriere` disponibles) ;
- les conditions (formule) et les plafonds (formule) ;
- la monnaie dépensée et le moment où l'achat est possible (création, jeu, les deux).

Exemple, la progression EotE entièrement en données :

```yaml
achats:
  - id: rang-competence
    obtient: { rang: competence }
    cout: '5 * cible + si(@carriere, 0, 5)'
    plafond: 'si(creation, 2, 5)'
    monnaie: xp
  - id: caracteristique
    obtient: { attribut: { groupe: caracteristiques } }
    cout: '10 * cible'
    plafond: 5
    moment: creation
    monnaie: xp
  - id: specialisation
    obtient: { entree: specialisation }
    cout: '10 * (nombre + 1) + si(@carriere, 0, 10)'
    monnaie: xp
```

La **création de personnage** est une suite d'**étapes** déclarées : choix (espèce, carrière…), tirage (formule avec contraintes et nombre d'essais), achat par points (budget et achats autorisés), saisie libre. L'« Obligation » d'EotE devient une étape de saisie d'une liste d'entrées, sans code dédié.

### 6. Arbres

Un arbre est une structure générique : des nœuds positionnés, un coût (formule, par exemple `base * rang`), des connexions traversables dans un sens ou dans les deux, un rang maximal, des nœuds de départ et des effets. Les arbres de talents d'EotE en sont un cas, et les voies de D&D en seraient un autre.

### 7. Jets et actions

Deux sortes de jet, composables :

- **Jet numérique** : une formule avec des dés, comparée à un seuil ou à une difficulté (formule), avec les marges, réussites et échecs critiques déclarés.
- **Pool de dés à symboles** : les sortes de dé et leurs faces sont définies par le système, chaque face alimentant des **compteurs**. Les règles de construction du pool sont déclarées (nombre de dés en formule, amélioration d'un dé vers un autre, ajout de dés de difficulté), et le résultat se lit via des attributs dérivés (`max(@succes - @echec, 0)`).

Une **action** assemble un jet et ses conséquences, toutes en données :

- **attaque** : pool de la compétence de l'arme contre une difficulté, touche si succès nets ≥ 1, dégâts = dégâts de l'arme + succès nets − encaissement de la cible, critique si Avantages ≥ indice critique ;
- **initiative** : jet, puis tri par attributs (par exemple succès nets, puis avantages) ;
- **test de compétence**, **jet de sauvegarde**, **soins**…

Le combat du service campaign exécute ces actions sans connaître le jeu.

### 8. Tables

Des tables aléatoires par intervalles (`01–05 : Blessure légère…`), tirées par une formule (par exemple `1d100 + 10 * @critiquesSubis`). Chaque ligne peut appliquer des effets ou donner une entrée de catalogue (un état). Elles couvrent les blessures critiques d'EotE, les critiques de véhicule, les rencontres aléatoires…

### 9. Textes de règles

Le glossaire et les règles narratives (les 27 fiches du bundle Star Wars) restent du texte, rattaché au système et consultable dans l'app, sans effet mécanique.

### Ce qui sort des règles

Ces éléments sont de la **présentation**. Ils passent dans un document « présentation » du système, lu par le front, séparé des règles et validé à part :

- disposition de la fiche et de la barre latérale ;
- polices, fond, thème ;
- cartes (images et marqueurs) : ce sont des données de campagne ;
- bibliothèques d'objets suggérés sur la carte.

## Le paquet `packages/rules`

| Module             | Rôle                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `schema`           | Schéma Zod d'un système complet, et types TypeScript déduits                                           |
| `formules`         | Analyseur, vérification des types et des références, évaluateur, dés (générateur aléatoire injectable) |
| `chargement`       | Validation complète d'un système (références, cycles, types), avec des erreurs lisibles et localisées  |
| `calcul`           | Graphe de dépendances, application ordonnée des effets, explications de chaque valeur                  |
| `progression`      | Achats, coûts, plafonds, étapes de création, monnaies                                                  |
| `jets`             | Jets numériques, pools à symboles, actions, initiative                                                 |
| `tables`, `arbres` | Tirage sur les tables, parcours et achat dans les arbres                                               |
| `migrations`       | Passage d'un personnage d'une version du système à la suivante                                         |

Le paquet est isomorphe : pas d'accès réseau, pas de base, pas de dépendance à React. Il sera **testé en profondeur** : tests unitaires par module, tests de référence par système (un personnage connu doit donner des valeurs connues), et tests de propriétés (pas de cycle accepté, déterminisme avec une graine fixée).

## Systèmes de référence

Deux systèmes complets sont écrits en données dès le départ, et prouvent qu'aucun code spécifique n'est nécessaire :

- **D&D classique** : port de `dnd-classic` ;
- **Star Wars, Aux confins de l'Empire** : port du bundle (`table.json`), avec toute la progression, le combat à dés à symboles, les arbres de talents et les blessures critiques.

Chaque système est un dossier versionné de `packages/systemes/systemes/<id>/` : `systeme.yaml` pour les règles, `catalogue/*.yaml`, `arbres/*.yaml`, `tables/*.yaml` et `textes/*.md`. Le build de `@vtt/systemes` assemble chaque système, le valide entièrement et échoue à la moindre erreur ; la CI vérifie donc chaque système à chaque commit. Les systèmes créés par les MJ dans l'app suivent exactement le même schéma, mais sont stockés en base.

## Ce que ça change pour la suite

- **character** calcule et fait autorité avec `packages/rules` : fiche, achats, jets.
- **campaign** exécute le combat et l'initiative à partir des actions du système.
- **Le front** affiche une fiche générée depuis le système (attributs, groupes, ressources), sans nom de stat en dur, avec les explications au survol.
- **L'historique** enregistre des événements riches (« jet d'attaque : 2 succès nets, dégâts 7 − encaissement 3 »), rejouables grâce au déterminisme.

## Référence rapide

Ces notions sont implémentées dans `packages/rules`. Les systèmes de `packages/systemes` en donnent des exemples complets.

### Formules

| Écriture                                                             | Sens                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `@FOR`, `@cible.Defense`                                             | Attribut de l'entité courante, ou de la cible d'une action                     |
| `mod(@DEX)`                                                          | Modificateur d'un attribut (formule commune du système ou propre à l'attribut) |
| `2d6`, `d20`, `4d6k3`, `2d20kl1`, `1d6!`                             | Dés : garder les meilleurs (`k`) ou les pires (`kl`) ; dé explosif (`!`)       |
| `des(n, faces)`, `des(n, faces, garder, "haut"\|"bas")`              | Dés en nombre variable                                                         |
| `si(condition, alors, sinon)`                                        | Condition                                                                      |
| `floor`, `ceil`, `round`, `abs`, `min`, `max`, `clamp`               | Calcul                                                                         |
| `et`, `ou`, `non`, `==`, `!=`, `<`, `<=`, `>`, `>=`                  | Logique et comparaisons                                                        |
| `rang("athletisme")`, `possede("elfe")`                              | Rang total d'une entrée ; possession (rang 1 minimum pour une entrée à rangs)  |
| `compte("sorte")`, `somme("sorte", "champ")`, `somme_rangs("sorte")` | Agrégats sur les possessions                                                   |
| `compte_actifs(…)`, `somme_actifs(…)`                                | Les mêmes agrégats, restreints aux entrées équipées ou actives                 |
| `marquee("entree", "marque")`, `a_etiquette(entree, "etiquette")`    | Marque posée par un effet ; étiquette d'une entrée du catalogue                |
| `valeur(x)`, `modificateur(x)`, `rang(x)` avec `x` calculé           | Lecture dynamique, dans les actions uniquement                                 |
| `cible_possede("id")`, `cible_rang("id")`                            | Possessions de la cible, dans une action qui en a une                          |

### Variables selon l'endroit

- **Effet** : `rang` et `actif` de la source, `source.<champ>`.
- **Condition d'un effet de jet** : en plus, `action`, et pour chaque paramètre son identifiant, son `.rang` et ses `.<champ>`.
- **Achat** : `actuel`, `calcule` (valeur avec les effets), `cible`, `nombre`, `creation`, `entree.<champ>`, et `marque("m")`.
- **Action**, dans cet ordre :
  1. les paramètres ;
  2. les `variables` ;
  3. `total` et `naturel` (jet numérique) ou les résultats nets (dés à symboles), puis `critique` et `fumble` ;
  4. `reussi` ;
  5. les valeurs d'`apres`.
- **Arbre** : `x`, `y` du nœud.
- **Contrainte de tirage** : `total`, `min`, `max`, `nombre`, `pairs`, `impairs`, `somme_modificateurs`.

### Briques d'une action

- `exige` : l'action est réservée à qui remplit la condition.
- Paramètres :
  - types `nombre`, `booleen`, `attribut` (choisi dans un groupe) et `entree` ;
  - pour une `entree` : `possedee: false` accepte une entrée non possédée, au rang 0 ; `facultatif: true` permet de l'omettre ;
  - `exige` sur un paramètre : c'est une option réservée, par exemple le talent qui l'accorde.
- `verifications` : refus avec un message clair, une fois les paramètres lus.
- Jet :
  - numérique, avec `reussite`, `critique` et `fumble` ;
  - ou à symboles, avec `pool` et `ameliorations`.
- Effets de jet des possessions :
  - côté acteur, ou côté cible (défense active) ;
  - ils ajoutent, améliorent, rétrogradent ou retirent des dés ;
  - ils donnent un bonus au total, ou modifient une variable (avantage, dégâts).
- `apres` (les dés y sont permis), puis :
  - `consequences`, qui sont des modifications proposées, appliquées par `appliquerModifications` ;
  - `tables`, tirées par `tirerTable` et appliquées par `appliquerTirage`.

### Présentation

Le fichier `presentation.yaml` de chaque système décrit :

- le thème (couleurs, polices, fond) ;
- l'apparence de chaque dé (skin, couleur, forme) ;
- l'icône et la couleur de chaque symbole ;
- le sens des jauges ;
- les blocs de chaque fiche (`attributs`, `ressources`, `possessions`, `arbres`, `monnaies`, `details`, `actions`, `texte`) ;
- la géométrie des arbres, les images et les bibliothèques.

Ce fichier est validé contre les règles au build. Le front n'y ajoute aucune valeur propre à un jeu.

## Ce qui relève de l'état de partie (services campaign et character)

Le portage complet de D&D et de Star Wars a fait apparaître des besoins qui ne sont pas des règles de fiche : ils dépendent du déroulement de la partie. Ils seront portés par les services, avec les règles comme source de vérité.

| Besoin                   | Exemples                                                    | Approche prévue                                                                                                                          |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Durées                   | Pas de côté jusqu'au round suivant, Rage, sorts actifs      | Un état est une possession activable ; l'état de combat enregistre son expiration (fin de round, de tour, de rencontre) et le désactive. |
| Usages limités           | Talents « une fois par séance », relances                   | Un compteur d'usage par possession et par période, remis à zéro par la séance ou la rencontre.                                           |
| Ressources de groupe     | Points de Destin, total d'Obligation du groupe              | Des ressources et des agrégats au niveau de la campagne, calculés sur les fiches des personnages joueurs.                                |
| Dépenses après le jet    | Avantages et Triomphes dépensés (Désorientation, Renverser) | Des options proposées après le jet ; chacune consomme des résultats et produit des conséquences.                                         |
| Cibles multiples, alliés | Commandant de terrain, attaques de zone                     | Une action exécutée pour chaque cible, avec un résultat groupé dans l'historique.                                                        |
| Initiative par camp      | Créneaux joueurs et PNJ (Star Wars)                         | Camps et créneaux dans l'état de combat ; le tri reste celui du système.                                                                 |
| Lien pilote et véhicule  | Talents de pilotage                                         | Une relation entre entités dans la campagne ; les effets s'appliquent à l'entité liée.                                                   |
| Exemplaires multiples    | Deux dagues, consommables                                   | À trancher avec le modèle de stockage des personnages (quantité ou identifiant par exemplaire).                                          |
