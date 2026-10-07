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

Un attribut de base déclare aussi qui le **saisit** une fois la création terminée (`saisie`, voir la référence rapide) : personne (il s'achète), le joueur ou le MJ (crédits), ou le MJ seul (XP gagnée, niveau).

Un attribut (`base`, `derivee` ou `ressource`) déclare enfin s'il sert aux **jets libres** du lanceur de dés : `jet: { apport }` (voir « Attributs jetables » dans la référence rapide). Sans `jet`, il n'y est jamais proposé.

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

### 4 bis. Bonus : une seule mécanique, trois sources

Tout bonus est un **effet**, du même schéma que ceux du catalogue. Il vient de l'une de trois sources, que le moteur traite toutes pareil (`fiche.sources`) :

| Source              | Où elle vit                                                   | Exemples                                          |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Entrée du catalogue | `catalogue[].effets` du système                               | race, talent, armure de cuir, état « étourdi »    |
| Exemplaire possédé  | `possessions[].effets` de l'état du personnage                | épée +1, objet enchanté, bonus saisi sur un objet |
| Bonus libre         | `bonus[]` de l'état du personnage : nom, source, actif, durée | potion, bénédiction, décision du MJ               |

Un bonus s'applique quand sa source est active : l'objet équipé, le bonus libre activé, l'entrée possédée (rang 1 au moins pour une entrée à rangs).

Les bonus posés sur un personnage sont vérifiés comme le catalogue, par `compilerEffets` : cible existante, formule bien typée. Le service refuse à l'écriture un bonus invalide, avec le détail de chaque erreur. Si un tel bonus existe déjà dans un état, le calcul l'ignore et le signale.

Un bonus posé sur un personnage ne peut lire que des attributs calculés avant sa cible, pour ne jamais créer de cycle.

Les bonus libres à durée perdent un round en fin de round, comme les états, et disparaissent à 0.

Pour les jets, `implique` cible un jet sans formule : « +2 aux tests de Discrétion » (`implique: { entree: discretion }`), ou « +1 dé aux tests de Vigueur » (`implique: { attribut: vigueur }`).

Le jet est concerné quand :

- un paramètre de l'action désigne cette entrée ou cet attribut ;
- ou un champ de l'entrée choisie y renvoie (compétence d'une arme, caractéristique liée d'une compétence).

La règle est la même dans tous les systèmes.

Chaque ligne d'explication de la fiche porte l'identifiant de sa source : `armure-cuir`, `armure-cuir#exemplaire` (effets propres du premier exemplaire), `dague#2` (effets propres de l'exemplaire `2`), `bonus:potion`.

#### Activer ou désactiver un effet, un par un

Chaque effet a une **clé stable** : `<source>/<index>`, où `<source>` est l'identifiant de source ci-dessus et `<index>` la position de l'effet dans sa liste, à partir de 0 (`entree.effets` du catalogue, `possession.effets` d'un exemplaire, `bonus.effets`). Exemples : `armure-cuir/0`, `dague#2/1`, `pilotage#exemplaire/0`.

L'état porte la liste des effets coupés, `effetsDesactives` (clés). Un effet coupé :

- ne s'applique nulle part : attributs, rangs gratuits, marques, jets et résistances ;
- ne touche pas à sa source : l'objet reste équipé, le talent possédé, les autres effets de la même source s'appliquent ;
- reste dans l'explication de la valeur qu'il vise, marqué `desactive`, après les effets appliqués ; il ne compte pas dans le départage de sa famille.

Se coupent un à un les effets du catalogue d'une entrée possédée et les effets propres d'un exemplaire. Un bonus libre, lui, s'active ou se désactive en entier (son `actif`) : une clé `bonus:…` est refusée.

`listerEffets(fiche)` donne tous les effets de l'entité, actifs ou non, avec leur statut : `actif`, `desactive` (coupé), ou `inactif` avec sa raison (`inactive` : objet rangé ; `non-effective` : entrée à rangs sans rang ; `bonus-inactif`). `basculerEffets(fiche, cles, actif)` active ou coupe un ou plusieurs effets (tous ceux d'une source d'un coup), de façon idempotente ; une clé inconnue fait tout refuser, sauf pour réactiver une clé coupée dont la source a disparu.

La clé suit la position : modifier la liste des effets propres d'un exemplaire garde les positions coupées. Une clé qui ne désigne plus aucun effet (objet retiré, effet supprimé, nœud rendu) est oubliée à l'écriture suivante, pour qu'un nouvel exemplaire du même identifiant n'en hérite pas. Le service character l'expose par `PUT /v1/characters/:id/effets` (`{ version, effet | effets, actif }`, événement `character.updated`, opération `effet`, avec les clés, les sources et `change`).

Sur la fiche, le bloc Bonus est le seul endroit où l'on active ou coupe un bonus : onglets « Actifs » puis par famille de sources (objets : sortes à exemplaires ou quantités ; profil : sortes uniques ; capacités : le reste ; bonus libres), une ligne repliable par source. Les cartes et fenêtres de détail ne font que les lister, avec leur état.

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

Le combat du service campaign exécute ces actions sans connaître le jeu (conception : [combat.md](combat.md)). Une action à cible se joue contre plusieurs cibles (une exécution par cible, jet commun ou par cible), la cible réagit par ses paramètres `par: cible`, l'attaquant ne voit que sa vue du résultat (`vueActeur`), et les modifications proposées ne sont appliquées qu'une fois décidées par le MJ, sans relancer un dé.

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
| `compte("sorte")`, `somme("sorte", "champ")`, `somme_rangs("sorte")` | Agrégats sur les possessions (un par exemplaire ; `somme` × la quantité)       |
| `quantite("sorte")`                                                  | Total des quantités des possessions de la sorte                                |
| `compte_actifs(…)`, `somme_actifs(…)`                                | Les mêmes agrégats, restreints aux entrées équipées ou actives                 |
| `marquee("entree", "marque")`, `a_etiquette(entree, "etiquette")`    | Marque posée par un effet ; étiquette d'une entrée du catalogue                |
| `valeur(x)`, `modificateur(x)`, `rang(x)` avec `x` calculé           | Lecture dynamique, dans les actions uniquement                                 |
| `cible_possede("id")`, `cible_rang("id")`                            | Possessions de la cible, dans une action qui en a une                          |
| `option("encombrement")`                                             | Règle optionnelle allumée pour la campagne (formules lues sur une entité)      |

### Variables selon l'endroit

- **Effet** : `rang`, `actif` et `quantite` de la source, `source.<champ>` (ceux de l'exemplaire pour ses effets propres).
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
  - types `nombre`, `booleen`, `attribut` (choisi dans un groupe), `entree` et `choix` ;
  - pour une `entree` : `possedee: false` accepte une entrée non possédée, au rang 0 ; `facultatif: true` permet de l'omettre ;
  - `choix` : une option parmi une liste nommée (`options: [{ valeur, nom, description? }]`, `defaut` ou, sans lui, la première option), voir « Situation du combat » ;
  - `section` : `preparation` (défaut : arme, options des talents) ou `situation` (couvert, surprise…), où le formulaire range le paramètre ; `description` : aide courte, montrée au survol ;
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
  - `consequences`, qui sont des modifications proposées, appliquées par `appliquerModifications` ; une conséquence de dégâts détaille, pour le rapport du MJ, les dégâts bruts (`brut`), leur type, chaque résistance, réduction, immunité ou vulnérabilité de l'entité touchée avec son nom (`resistances`, celles écartées par leur famille comprises), le résultat (`valeur`) et le minimum qui l'a relevé (`minimum`, « au moins 1 DM ») ;
  - `tables`, tirées par `tirerTable` et appliquées par `appliquerTirage`. Une table appliquée plus tard donne l'entrée de sa ligne tirée, ou d'une autre ligne choisie par le MJ (`ligneDeTable`), sans nouveau tirage.
- Valeurs (`variables`, `apres`) : `nom` (libellé) et `visibilite` : `mj` (défaut) ou `acteur`, montrée à qui agit (dégâts lancés) dans sa vue et dans le jet de l'historique des dés.
- Côté de chaque ligne d'un jet (`EtapePool.cote`, `BonusJet.cote`) : `action`, `acteur` (ses effets, ses ajustements) ou `cible` (défense active).
- `DemandeAction.combat` : contexte du combat lu sous `@combat.*` (voir « Contexte du combat »).
- `DemandeAction.ajustements` : dés à symboles ajoutés (nombre positif) ou retirés (négatif) par sorte, bonus au total d'un jet numérique ; hors règles, appliqués après les effets, marqués « Ajusté à la main » (`resultat.ajuste`). `DemandeAction.forcer` : issue imposée par le MJ (`reussi`, `critique` d'un jet numérique), mêmes dés (`resultat.force`).

### Combat

Briques de [combat.md](combat.md) § 14, toutes en données :

| Brique                       | Où             | Sens                                                                                                                                                                                                                                 |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `multicible: { jet, max? }`  | action à cible | `commun` (zone : les dés de chaque phase sont lancés une fois pour toutes) ou `par-cible` (défaut) : mode de jet proposé ; `max` borne le nombre de cibles                                                                           |
| `par: cible` (paramètre)     | action à cible | réaction de la cible (Esquive) : proposée à la cible dont l'`exige` est vrai (`parametresReaction`), jamais prise à l'acteur                                                                                                         |
| `initiative.mode`            | système        | `individuel` (défaut) ou `creneaux` (créneaux par camp, Star Wars)                                                                                                                                                                   |
| `horsCombat`                 | type d'entité  | formule booléenne (`@PV <= 0`, `@neutralise ou possede("mort")`) évaluée après chaque application (`estHorsCombat` ; sans formule, pas de détection)                                                                                 |
| `combat: { groupes, etats }` | présentation   | groupes du menu d'attaque (actions à cible, une seule fois chacune) ; sortes d'états du catalogue proposées sur la fiche du participant, icône de chaque état (`IconeEtat` : `aveugle`, `poison`, `etourdi`, `a-terre`, `blessure`…) |

Moteur :

- `executerMulticible(systeme, { action, acteur, cibles: [{ id, fiche, reaction?, forcer? }], parametres?, jet?, ajustements?, aleatoire })` : une exécution par cible ; les paramètres `par: cible` viennent des réactions ; résultat par cible (`ok`, ou les refus propres à cette cible), modifications de l'acteur (coûts) comptées une fois, celles de chaque cible dans son résultat.
- `vueActeur(systeme, resultat)` : dés et total (ou pool), issue, valeurs `visibilite: acteur`, déroulé reconstruit (en tête, la situation déclarée : paramètres rangés en situation qui ne sont pas à leur défaut, hors réactions de la cible) ; les lignes de la cible deviennent « Défense de la cible ». Jamais un attribut, une variable, une résistance, une modification ou une table de la cible.
- Générateur : `entier(max, contexte?)` (`contexte.de` : sorte d'un dé à symboles) et `phase?(nom)`, appelé par le moteur au début du jet (`jet`), d'`apres`, des `tables` et à la `fin`. Un dé est repéré par sa phase, sa sorte et son rang dans la phase : `partagerGenerateur` (jet commun), `generateurParCible`, et `aleatoirePlanifie({ faces, commun, repli? })` pour les dés physiques (étape C) : il rejoue les faces fournies, note les dés manquants (valeur provisoire 1) et lève `DesRequis` au changement de phase ; `executerMulticible` les réunit dans `requis` (identifiants `phase:sorte:k`, préfixés par la place de la cible pour un jet par cible). Aucun calcul n'est rendu avec une valeur provisoire.

### Paramètres choisis après le jet (`etape: apres`)

On ne choisit pas son arme pour savoir si l'on touche : le jet d'attaque se lance sur le type
d'attaque (Contact, Distance, Magie), l'arme se choisit ensuite, seulement si la cible est touchée.

- **Paramètre `etape: apres`** (défaut `declaration`) : jamais demandé à la déclaration. Après un
  jet réussi, `executer` lève `ParametresRequis` (le jet et son issue joints, déjà exacts) tant
  qu'il manque ; `executerMulticible` met la cible en attente et réunit les paramètres demandés
  dans `parametres` (les mêmes pour toutes les cibles). Sur un raté, rien n'est demandé : le
  paramètre garde sa valeur neutre (entrée vide, rang 0, champs par défaut). Fourni d'avance (lot
  du MJ, PNJ), il n'est pas redemandé. Une réaction de la cible (`par: cible`) ne peut pas l'être.
- **Chargement** : aucune formule du jet (formule, réussite, critique, échec critique, réserve,
  améliorations, vérifications, effets de situation sur le jet) ni aucune variable qu'elles lisent,
  de proche en proche, ne lit un tel paramètre (« Le jet ne peut pas lire « arme.critique », choisi
  après le jet »). Les autres variables de l'action sont calculées après le jet, avec lui (bonus
  aux DM, dés de critique).
- **Effets de jet** (possessions, situation) : pendant le jet, ils lisent le paramètre à sa valeur
  neutre (« +1 au toucher à la hache » ne compte pas : l'arme n'est pas connue) ; ils sont relus
  après le jet pour les variables calculées alors (« +1 DM à la hache » compte).
- **`jet.confirmerCritique`** (jet numérique à `critique`) : lu après le jet, sur une réussite,
  quand les paramètres d'après le jet sont connus ; vrai, le jet devient critique (seuil de
  critique de l'arme : `naturel >= arme.critique`).
- **Déterminisme** : mêmes faces et mêmes paramètres, même résultat ; l'étape suivante (les dés
  de l'arme) n'est planifiée qu'une fois le paramètre fourni.

### Situation du combat

Demande de Théo (combat.md § 5.7) : une attaque dépend de bien plus que de l'arme. Le couvert de
la cible, un avantage de situation, une cible à terre ou surprise, un bonus décidé par le MJ se
déclarent **une fois pour tout le système**, et chaque action à cible les reçoit.

**Paramètre `choix`.** Une option parmi une liste nommée :

```yaml
- id: couvert
  nom: Couvert de la cible
  description: Abri partiel +2 DEF, important +5 DEF
  type: choix
  options:
    - { valeur: aucun, nom: Aucun }
    - { valeur: partiel, nom: Partiel (+2 DEF) }
    - { valeur: important, nom: Important (+5 DEF) }
  defaut: aucun # absent : la première option
```

Dans les formules, il se lit comme un **texte**, la `valeur` de l'option retenue :
`si(couvert == "partiel", -2, si(couvert == "important", -5, 0))`. C'est le choix le plus propre
pour le langage : un attribut `choix` et un champ `choix` d'une sorte se lisent déjà ainsi, le
nombre attaché à chaque option reste écrit dans la règle qui s'en sert (un même choix peut valoir
−2 à l'attaque et +1 à un jet de sauvegarde), et le chargement **vérifie chaque texte comparé**
(`==`, `!=`) à un paramètre `choix` : `couvert == "partiell"` est refusé avec sa position, au lieu
d'être toujours faux sans rien dire. Une valeur reçue hors des options est refusée à l'exécution.

**Section et description.** Tout paramètre porte `section` (`preparation` par défaut,
`situation`) et `description` (aide courte, 500 caractères). Ils ne changent aucun calcul : le
formulaire range les paramètres de situation à part et montre la description au survol. Une
action peut ranger ses propres paramètres en situation (Star Wars, Frappe rapide : « la cible n'a
pas encore agi »).

**Situation du système.** Bloc `situation` à la racine du système :

```yaml
situation:
  parametres: # rejoignent chaque action à cible
    - { id: bonusToucher, nom: Bonus ou malus au toucher, type: nombre }
    - { id: couvert, … }
  effets: # effets de jet (`sur: jet`), appliqués à ces actions
    - sur: jet
      description: Couvert de la cible
      ajout: { variable: bonusAttaque, ajouter: 'si(couvert == "partiel", -2, …)' }
    - { sur: jet, description: Bonus de situation, ajout: { bonus: bonusToucher } }
```

- **Fusion au chargement.** Chaque action qui déclare une `cible` reçoit les paramètres de la
  situation, après les siens, rangés `section: situation` (quelle que soit la section écrite).
  Le front et les services les voient comme des paramètres ordinaires de l'action
  (`systeme.actions`) ; le document source, lui, n'est pas modifié (`systeme.source.actions`).
- **S'en exclure.** `situation: false` sur une action : ni paramètres ni effets (soins, dégâts
  sans jet d'attaque). `situation: { sauf: [avantage] }` : ces paramètres ne sont pas ajoutés,
  les effets les lisent à leur valeur par défaut ; l'action peut alors déclarer le sien. Une
  action qui déclare un paramètre du même nom sans l'écarter est refusée.
- **Effets de situation.** Seulement des effets de jet (`sur: jet` : dés ajoutés, améliorés,
  rétrogradés ou retirés, bonus au total, valeur ajoutée à une variable de l'action), sans côté
  (`cote: cible` refusé : ils ne viennent d'aucun porteur). Ils sont compilés pour chaque action
  qui reçoit la situation, avec ses paramètres, son acteur (`@X`), sa cible (`@cible.X`,
  `cible_possede`) et le combat (`@combat.*`) ; `actions` les restreint à certaines actions,
  `implique`, `condition` et `si` jouent comme pour un effet possédé. Un effet dont la valeur est
  0 ne s'applique pas et ne dit rien ; sinon sa ligne a pour source `situation`, pour nom sa
  `description` (sinon « Situation ») et pour côté `action` : l'attaquant la voit, c'est lui ou
  le MJ qui l'a déclarée. Un effet sur une variable que l'action n'a pas (`bonusAttaque` d'un
  soin) ne fait rien.
- **Déroulé.** Un paramètre de situation laissé à sa valeur par défaut n'apparaît pas dans les
  explications ; une option retenue y figure par son nom (« Couvert de la cible : Partiel »).

### Contexte du combat (`@combat.*`)

Ce que le combat a compté se lit dans les formules sous `@combat.` (une clé à plusieurs niveaux,
`@combat.cible.aAgi`, garde ses points) :

| Référence                      | Type    | Sens                                                        |
| ------------------------------ | ------- | ----------------------------------------------------------- |
| `@combat.enCours`              | booléen | un combat est en cours (round 1 ou plus)                    |
| `@combat.round`                | nombre  | round courant, 1 au premier ; 0 hors combat                 |
| `@combat.premierRound`         | booléen | round 1                                                     |
| `@combat.acteur.attaques`      | nombre  | attaques faites par l'acteur depuis le début du combat      |
| `@combat.acteur.attaquesRound` | nombre  | attaques faites par l'acteur ce round                       |
| `@combat.acteur.vise`          | nombre  | fois où l'acteur a été visé depuis le début                 |
| `@combat.acteur.viseRound`     | nombre  | fois où l'acteur a été visé ce round                        |
| `@combat.acteur.aAgi`          | booléen | le tour de l'acteur est déjà passé ce round                 |
| `@combat.acteur.surpris`       | booléen | l'acteur est surpris (marqué par le MJ)                     |
| `@combat.cible.…`              | —       | les mêmes six valeurs pour la cible (`attaques`… `surpris`) |

- **Qui le fournit.** Le contexte entre par la demande d'exécution (`DemandeAction.combat`,
  `DemandeMulticible.combat`, ou `CibleAction.combat` propre à une cible), à côté des paramètres :
  `{ round, acteur?, cible? }`, chaque participant `{ attaques, attaquesRound, vise, viseRound,
aAgi, surpris }` (schéma `ContexteCombat`, vérifié : entiers positifs, booléens ; sinon refus).
  Le moteur ne l'invente jamais. Le service campaign le fige à la déclaration, **sans l'action en
  cours** : `@combat.acteur.attaques == 0` est vrai pour la première attaque du combat.
- **Valeurs neutres.** Sans contexte, hors combat (`round` 0) ou pour un participant absent du
  contexte : 0 et faux. Une règle écrite avec `@combat.enCours` ou `@combat.premierRound` ne se
  déclenche donc jamais hors combat.
- **Où.** Dans toutes les formules d'une action (variables, vérifications, jet, `apres`,
  conséquences, tables), dans les effets de la situation, et dans `si` et les valeurs d'un effet
  de jet possédé (Frappe rapide :
  `si: '@combat.premierRound et non @combat.cible.aAgi'`). `acteur` et `cible` désignent
  toujours qui agit et qui est visé, quel que soit le porteur de l'effet. Ailleurs (attributs,
  achats, `exige`, condition d'un effet d'attribut), `@combat` est refusé.
- **Vérifié au chargement.** Une référence inconnue (`@combat.tour`, `@combat.cible.pv`) ou mal
  typée est refusée avec sa position, comme un attribut (« Attribut inconnu : @combat.tour »).

### Exemplaires, quantités et saisie

- **Exemplaires** : une sorte sans rangs déclarée `exemplaires: true` (armes, armures, Obligations) se possède plusieurs fois. Chaque possession est un exemplaire, avec son `actif`, ses `champs`, ses `effets` et sa durée, distingué par `exemplaire` : identifiant unique par entrée, absent pour le premier. Outils : `estExemplaire(p, entree, exemplaire?)` (absent désigne l'exemplaire sans identifiant), `nouvelExemplaire(possessions, entree)` (`2`, `3`…), `sourceExemplaire(p)` (`entree#id`). Une entrée à rangs n'a qu'une possession, dont les rangs s'additionnent.
- **Quantités** : une sorte `quantites: true` (munitions, stimpacks, dagues D&D) porte `quantite` sur chaque possession (entier ≥ 1, absent : 1, `quantiteDe(p)`). `somme` la multiplie, `quantite("sorte")` l'additionne.
- Don, tirage, achat et remboursement (`donnerEntree`, `retirerEntree`) ajoutent ou retirent une unité, ou un exemplaire si la sorte l'autorise.
- **Formules des objets** : un champ `formule` d'une sorte lit les attributs du porteur, et les autres champs de l'objet (`source.nbDes`, pas les autres formules) avec son `rang`, `actif`, `quantite`. Déclaré `des: true` (formule de jet), il peut lancer des dés, tirés par l'action qui le lit (`arme.degats`), à chaque lecture. Un exemplaire peut remplacer la formule de l'entrée par la sienne (valeur propre du champ) : `formuleChamp(systeme, entree, champ, exemplaire)` la choisit, `compilerFormuleChamp` la compile (500 caractères au plus) et `verifierChampsExemplaire` vérifie toutes les valeurs propres d'un exemplaire. Elle s'écrit en clés nues, comme au lanceur de dés (`1d6-CON+8`, voir « Clés nues dans les formules de jet ») et elle est enregistrée telle que saisie. `apercuFormule(fiche, formule, variables)` calcule tout sauf les dés (`1d6 − 2 + 8`) ; `apercuVariables(systeme, demande)` donne les variables d'une action avant le jet, sans cible ni dés (paramètres, effets de l'acteur et de la situation : `avantages` d'une attaque), pour que l'aperçu d'un `si(avantages > 0, 2d20k1, 1d20)` s'écrive `2d20k1` ; une variable qui dépend de la cible ou d'un dé en est absente ; `formuleLisible(systeme, entite, noeud, variables)` réécrit une formule comme on la saisit (`des(source.nbDes, source.faces) + mod(@FOR)` → `1d8+FOR`).
- **Dés d'une sous-formule** : `multiplier_des(k, x)` lance `k` fois plus de dés dans `x` (critique qui double les dés d'une arme, pas ses bonus) ; `maximum_des(x)` donne à chaque dé sa valeur maximale. Ils s'appliquent aussi aux formules de jet lues dans `x`.
- **Exemplaire visé par une action** : un paramètre `entree` accepte `entree#exemplaire` ; l'action lit alors les champs et la formule propres de cet exemplaire, et son état équipé.
- **Inventaire** : l'état porte des dossiers (`folders: [{ id, name }]`, ordre d'affichage) ; un exemplaire désigne son dossier (`folder`) et peut être caché aux autres joueurs (`hidden`). Le moteur ne s'en sert pas pour calculer : le service character filtre les objets cachés à la lecture et vérifie les dossiers (voir docs/api-character.md).

### Objets hors catalogue et catégories

- **Champ `choix`** d'une sorte : valeur prise dans des `options` déclarées par le système (catégorie d'objet : potions, nourriture, bourse, autre). Lu comme un texte dans les formules.
- **Nom propre d'un exemplaire** : la sorte désigne un champ `texte` par `nomExemplaire` (et `descriptionExemplaire`). Un exemplaire qui le renseigne s'affiche sous ce nom, dans l'inventaire comme dans les explications (`nomPossession`, `descriptionPossession`).
- **Entrée `libre`** (« Objet personnalisé ») : entrée générique d'une sorte à exemplaires qui déclare `nomExemplaire`. Chaque exemplaire est un objet hors catalogue : son nom, sa description et sa catégorie sont ses champs propres, ses bonus ses effets propres. Le front la propose à part du catalogue.
- Les pièces de monnaie d'un jeu sans monnaie dépensable (D&D) sont des objets comme les autres (catégorie « bourse »).

### Tolérance des états

Le calcul ignore sans erreur ce que le système ne connaît plus : valeur d'un attribut retiré, ligne de journal d'une monnaie ou d'un achat retirés (le solde ne compte que les monnaies existantes, un tel achat ne se rembourse plus). Une entrée inconnue est signalée dans `erreurs` et ignorée ; le service refuse seulement d'enregistrer un état qui en contient. La reprise de l'import (service character) nettoie ces restes.

- **Saisie** d'un attribut de base (`saisie`, défaut `creation`) : pendant la création, le propriétaire saisit tout ; ensuite `jeu` = propriétaire ou MJ, `mj` = MJ seul, `creation` = plus personne (l'attribut s'achète). `refusSaisie(attribut, creation, { proprietaire, mj })` donne la raison d'un refus ; le service character la renvoie en 403 (réservé au MJ) ou 422.

### Attributs jetables (lanceur de dés)

Trois couches décident des attributs proposés dans le lanceur, sans aucune clé de jeu dans le moteur ni dans le front :

1. **Règles** : l'attribut déclare `jet: { apport }`, avec pour apport :
   - `modificateur` : son modificateur, ajouté comme `mod(@CLE)` (l'attribut doit en avoir un) ;
   - `valeur` : sa valeur, ajoutée comme `@CLE` (attribut numérique) ;
   - une formule sans dé, ajoutée entre parenthèses (`mod(@DEX) + @niveau`). Elle ne lit que les attributs de l'entité (valeurs et modificateurs) : ni `rang`, ni `possede`, ni agrégats, car le service de dés l'évalue avec les seules valeurs de la fiche.

   Le chargement vérifie l'apport comme les autres formules. La fiche calculée donne l'apport de chaque attribut jetable (`ValeurCalculee.jet`, repris par `ficheJson`).

2. **Présentation** : `des.jets` ordonne et regroupe (`[{ titre, entite?, attributs }]`), validé contre les règles (attribut existant qui déclare `jet`, pas de doublon). Un attribut jetable absent de ces groupes suit, groupé par son `groupe`. Sans déclaration : ordre du système, groupé par `groupe`.
3. **Campagne** : le MJ retire des attributs pour toute la table (réglages de campagne, `dice.hiddenAttributes`, docs/api-campaign.md). Il ne peut jamais en ajouter un qui ne déclare pas `jet`.

`declarationsJetables(systeme, entite, options)` et `attributsJetables(fiche, options)` renvoient la liste ordonnée (clé, nom, genre d'apport, terme à ajouter à la formule, groupe, et l'apport calculé pour la fiche). Options : `presentation`, `retires` (réglage de campagne) et `mj` (garder les attributs réservés au MJ). `grouperJetables` regroupe la liste pour l'affichage.

| Système   | Attributs jetables                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| D&D       | FOR, DEX, CON, SAG, INT, CHA (modificateur) ; Contact, Distance, Magie, INIT (valeur). Défense et PV max : aucun jet. |
| Nooblies  | Comme D&D, dont il reprend la structure et les actions (`1d20 + valeur(score)`, `1d20 + @INIT`).                      |
| Star Wars | Aucun : chaque jet est un test de compétence dont la réserve de dés combine caractéristique et rang.                  |

#### Clés nues dans les formules de jet

Comme dans l'ancienne app, une formule de jet s'écrit avec les clés nues : `1d20+CON`, `1d6-CON+8`, `2d6+INIT`. `normaliserFormuleJet(systeme, entite, formule)` les réécrit en termes du moteur avant l'analyse :

- clé d'un attribut jetable : son terme déclaré (`CON` → `mod(@CON)`, `INIT` → `@INIT`, apport en formule → `(formule)`) ;
- clé d'un attribut sans `jet` : sa valeur (`niveau` → `@niveau`) ;
- abréviation d'un attribut (`VIG` pour `vigueur`) : comme sa clé ; argument de `mod(…)` : la valeur de l'attribut (`mod(CON)` → `mod(@CON)`) ;
- formes explicites (`@CON` = valeur brute, `mod(@CON)`), dés (`1d20`, `4d6k3`), appels de fonction et mots du langage : inchangés ;
- tout autre identifiant nu : erreur lisible, avec sa position (« « CONS » n'est pas un attribut du personnage »).

La réécriture suit le découpage du langage (`decouperFormule`) : `Contact` n'est pas `CON`, `d20` est un dé. La casse est tolérée quand elle ne prête pas à confusion (`con` → `CON`). Elle ne dépend pas des retraits de la campagne : une clé retirée du lanceur s'écrit toujours à la main. Le front (vérification en direct, dés 3D à lancer) et le service de dés (calcul) appellent la même fonction ; la formule saisie (`1d20+CON`) est celle qui est enregistrée et affichée. `termesAttributs(formule)` repère les `@CLE` et `mod(@CLE)` d'une formule normalisée, pour afficher le détail d'un jet avec les valeurs de la fiche (`1d20+CON = [12]+2 = 14`).

Les formules d'objets de l'inventaire (`1d6-CON+8`) passent par la même fonction, avec le système et le type d'entité du personnage : `compilerFormuleChamp` la lui confie avec les variables de l'objet (`source.nbDes`, `rang`, `actif`, `quantite`), qui restent telles quelles (option `variables`). Le service character (vérification des valeurs propres) et le moteur (fiche, actions) normalisent ainsi avant l'évaluation ; la formule saisie est enregistrée et affichée.

### Présentation

Le fichier `presentation.yaml` de chaque système décrit :

- le thème (couleurs, polices, fond) ;
- l'apparence de chaque dé (skin, couleur, forme) ;
- l'icône et la couleur de chaque symbole ;
- le sens des jauges ;
- les blocs de chaque fiche (`attributs`, `ressources`, `possessions`, `inventaire`, `competences`, `monnaies`, `details`, `actions`, `bonus`, `texte`) :
  - `competences` : toute la progression en un bloc, en plusieurs vues choisies dans son en-tête. **Progression** : les voies (sortes à rangs qui accordent d'autres entrées rang par rang) en tableau, une ligne par voie et une colonne par rang, ou les arbres du système en grille, selon la forme des données ; **rangs** : les sortes dont les rangs s'achètent directement (tout le catalogue, avec l'achat du rang suivant) ; **Capacités** : les entrées acquises des `sortes` du bloc, avec leur activation, filtrées par la valeur de `filtreChamp` ou par sorte. Sans `sortes`, le front prend celles qu'accordent les voies, les arbres et les rangs d'autres entrées, et celles dont les rangs s'achètent. `vue` choisit la vue ouverte par défaut (`progression`, `rangs`, `capacites`). Il remplace les anciens blocs `arbres` et `competences` à une `sorte` : une mise en page enregistrée qui les contient est convertie en un seul bloc ;
  - `ressources` : en jauges (défaut) ou en chiffres (`affichage: valeur` : « PV / PV max », et d'autres attributs en valeur simple, comme la Défense) ;
  - `inventaire` : source unique de l'équipement, toutes sortes d'objets réunies ; regroupé par sorte, ou par un champ (`groupeChamp`), ou par une liste de champs quand les sortes n'ont pas le même (`[attaque, categorie]` : pour chaque objet, le premier que déclare sa sorte, sinon sa sorte) ;
- l'ordre et les groupes des attributs du lanceur de dés (`des.jets`, voir « Attributs jetables ») ;
- le combat (`combat`) : groupes du menu d'attaque et états proposés, avec leurs icônes (voir « Combat »), et l'icône de certains paramètres de situation (`combat.situation.icones`, par identifiant de paramètre rangé `section: situation` : couvert, cible à terre…) ;
- les icônes des objets de l'inventaire (`iconesObjets`) : une icône générique (`epee`, `cible`, `bouclier`, `fiole`, `pieces`, `sac`…) par sorte, ou par valeur d'un champ (`{ champ: categorie, valeur: potions, icone: fiole }`, `{ champ: melee, valeur: true, icone: epee }`) ; la première règle qui convient l'emporte, vérifiée contre le système (`erreursRegleIcone`). Sans règle, le front déduit l'icône de la forme de la sorte (formule de jet, équipable, en quantité) ;
- la carte (`carte.deplacement.attribut`) : l'attribut calculé qui donne le déplacement d'un personnage, en unités de la carte, comparé au trajet d'un token glissé (docs/carte.md § 10, Trajet des déplacements) ; vérifié contre le système (attribut connu d'un type d'entité). Sans lui, la carte ne montre que la distance ;
- la géométrie des arbres, les images et les bibliothèques.

Ce fichier est validé contre les règles au build (`erreursWidget` pour chaque bloc). Le front n'y ajoute aucune valeur propre à un jeu, et marque indisponible un bloc enregistré dans une mise en page que le système ne permet plus (attribut retiré).

### Règles optionnelles

Conception : [regles-optionnelles.md](regles-optionnelles.md). Le système déclare ses options (`options: [{ id, nom, description, defaut }]`) ; la campagne en règle certaines (`rules.options` des réglages de table, service campaign). Tout se lit par la donnée :

- `option("id")` dans une formule, vérifiée au chargement (option déclarée, identifiant littéral) ;
- `option: id` sur un attribut (éteinte : absent de la fiche, ni calcul, ni tuile, ni lanceur, ni achat ; sa valeur saisie reste dans l'état), sur un champ de sorte (caché dans l'inventaire et à l'ajout, `champsActifs`), sur un bloc de présentation (absent de la fiche) ;
- effets de règle d'un type d'entité (`entites[].effets`, source `regles`) : toujours présents, conditionnés (`option("encombrement") et @surcharge`), jamais basculables ; une condition qui lit une option éteinte et ne tient pas les liste `inactif`, raison `regle-desactivee`.

Calcul : `calculer(systeme, etat, { options })`, ou `avecOptions(systeme, options)` qui donne le système réglé pour une campagne (même objet pour les mêmes réglages), à passer aux achats, à la création et aux actions. `calculer(systeme, etat)` garde les défauts du système. `fiche.options` donne la valeur de chaque option, `fiche.attributActif(cle)` dit si l'attribut est sur la fiche.

## Ce qui relève de l'état de partie (services campaign et character)

Le portage complet de D&D et de Star Wars a fait apparaître des besoins qui ne sont pas des règles de fiche : ils dépendent du déroulement de la partie. Ils seront portés par les services, avec les règles comme source de vérité.

| Besoin                   | Exemples                                                    | Approche prévue                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durées                   | Pas de côté jusqu'au round suivant, Rage, sorts actifs      | Fait : durée en rounds d'une possession ou d'un bonus (`POST /possessions` avec `duree`), décomptée en fin de round (`tickId`, annulable). Fin de tour, de rencontre : à venir. |
| Usages limités           | Talents « une fois par séance », relances                   | Un compteur d'usage par possession et par période, remis à zéro par la séance ou la rencontre.                                                                                  |
| Ressources de groupe     | Points de Destin, total d'Obligation du groupe              | Des ressources et des agrégats au niveau de la campagne, calculés sur les fiches des personnages joueurs.                                                                       |
| Dépenses après le jet    | Avantages et Triomphes dépensés (Désorientation, Renverser) | Des options proposées après le jet ; chacune consomme des résultats et produit des conséquences.                                                                                |
| Cibles multiples, alliés | Commandant de terrain, attaques de zone                     | Fait pour les attaques : `executerMulticible`, jet commun ou par cible (voir « Combat ») ; commandement d'alliés à venir.                                                       |
| Initiative par camp      | Créneaux joueurs et PNJ (Star Wars)                         | Camps et créneaux dans l'état de combat ; le tri reste celui du système, le mode vient de `initiative.mode`.                                                                    |
| Lien pilote et véhicule  | Talents de pilotage                                         | Une relation entre entités dans la campagne ; les effets s'appliquent à l'entité liée.                                                                                          |
| Exemplaires multiples    | Deux dagues, consommables                                   | Fait : sortes `exemplaires` et `quantites` (voir la référence rapide), routes de possessions du service character.                                                              |
