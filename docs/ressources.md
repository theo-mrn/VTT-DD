# Ressources

Les **Ressources** sont le contenu de référence d'un système de jeu, à consulter pendant
la partie ou en dehors : capacités (races, profils, voies, talents…), marché (équipement et
prix), bestiaire et bibliothèque d'images. Elles sont **propres à un système** : une
campagne ne montre que celles de son système, et un système ne montre que ce qu'il déclare.

## Audit de l'ancienne app

`legacy/src/app/ressources` (quatre pages) et `components/(infos)` :

| Écran     | Fonctionnalités                                                                                                      | Source des données                                                            | Défauts                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Bestiaire | livre à tourner, recherche par nom, filtre par catégorie, fiche (type, FP, PV, DEF, carac., actions), races, classes | Firestore `bestiary` (seedé depuis `bestiairy.json`, D&D seul), système actif | catégories traduites en dur, stats D&D codées (`FOR`…`CHA`), races et classes dupliquées avec Capacités |
| Capacités | onglets Races / Profils / Prestiges, recherche plein texte (titre, description), filtre par race ou profil, détail   | ~120 `fetch('/tabs/<Nom><n>.json')`, noms de profils et races **en dur**      | indépendant du système de la campagne, HTML injecté tel quel                                            |
| Images    | Personnages, Cartes, Photos, filtre par catégorie, pagination (60), téléchargement                                   | `asset-mappings.json` (index public du CDN R2) et `/api/maps`                 | nombres d'images par catégorie en dur, même bibliothèque pour tous les systèmes                         |
| Marché    | un onglet par catégorie, recherche globale, colonnes par catégorie (dégâts, DEF, effet…)                             | Firestore `equipment` (seedé depuis `data.json`)                              | colonnes codées par nom de catégorie (`armes`, `armures`…), prix en texte libre, catalogue parallèle    |

Le marché de l'ancienne app était un **second catalogue** : les armes et armures qu'on
achetait n'étaient pas celles de l'inventaire. Ici, il n'y a qu'un catalogue, celui du
système (`@vtt/rules`).

## Principes

1. **Déclarées par le système**, dans sa présentation (`presentation.yaml`, clé
   `references`), jamais par du code qui teste un identifiant de système. Un onglet non
   déclaré n'apparaît pas.
2. **Une seule source** : les capacités et le marché lisent le catalogue du système chargé
   par `@vtt/rules` ; le bestiaire de référence est un document du système, validé contre
   ses règles au build.
3. **Mêmes composants** sur l'accueil et à la table ; seuls les droits changent.
4. **Lecture seule**, sauf « Ajouter à l'inventaire » (fiche du héros incarné, droit
   d'écriture décidé par le service character). Pas de gestion d'argent.

## Déclaration par système

La clé s'appelle `references` : `ressources` désigne déjà, dans la présentation, le sens des
jauges (PV). Les clés YAML restent en français comme le reste du langage des systèmes.

```yaml
references:
  capacites:
    titre: Capacités # facultatif
    sections:
      - { titre: Races, sorte: race }
      - { titre: Profils, sorte: profil }
      # Voies étiquetées « prestige », groupées par leur autre étiquette (voleur → « Voleur »)
      - { titre: Prestiges, sorte: voie, etiquette: prestige, groupePar: etiquette }
      # Groupées par la valeur d'un champ (carrière d'origine)
      - { titre: Spécialisations, sorte: specialisation, groupePar: { champ: carriere } }
  marche:
    prix: prix # champ du prix (son nom donne l'unité : « Prix (pa) »)
    sortes:
      - { sorte: arme, colonnes: [attaque, degats, portee] }
      - { sorte: objet, colonnes: [categorie], groupeChamp: categorie }
    textes: [tarifs] # textes du système affichés sous le catalogue (services, logement…)
  bestiaire:
    # Statistiques d'une créature ou d'un modèle de PNJ, par type d'entité
    statistiques:
      personnage:
        - { titre: Combat, attributs: [niveau, PV_Max, Defense, INIT] }
  images:
    collections:
      - { titre: Cartes, dossiers: [Map, Cartes] }
```

`verifierPresentation` vérifie chaque référence : sortes, champs (sur la sorte), étiquette
portée par au moins une entrée, champ de prix d'au moins une sorte du marché, textes,
attributs des statistiques.

| Système        | Capacités                                                 | Marché                                  | Bestiaire                            | Images                      |
| -------------- | --------------------------------------------------------- | --------------------------------------- | ------------------------------------ | --------------------------- |
| dnd-classic    | Races, Profils, Prestiges                                 | armes, armures, objets + tarifs (texte) | référence (334 créatures) + campagne | Personnages, Cartes, Photos |
| nooblies       | comme dnd-classic (hérité, docs/regles.md)                | comme dnd-classic                       | comme dnd-classic + campagne         | Personnages, Cartes, Photos |
| star-wars-eote | Espèces, Carrières, Spécialisations, Talents, Compétences | armes, armures, équipement, accessoires | campagne                             | —                           |

## Sources de données

### Capacités (catalogue)

Une section liste les entrées d'une sorte (filtrées par étiquette, groupées au besoin). Le
détail d'une entrée est générique, sans connaître le jeu :

- champs de la sorte, lisibles (option d'un choix, attribut, formule réécrite `1d8+FOR`) ;
- description (texte, HTML assaini, ou markdown léger : gras, listes) ;
- effets en clair (libellés de `fiche/blocks/effects/model.ts`, conditions de
  `condition-text.ts`), calculés sur une fiche vierge du type d'entité de la sorte ;
- **entrées liées**, navigables : champs `entree`/`entrees` (voies d'un profil, voie
  raciale, carrière d'origine), effets `rang` (capacités accordées, « Rang 3 ») et `marque`
  (compétences de carrière), choix (« 4 au choix parmi… »). Une entrée liée qui accorde
  elle-même des rangs (une voie) est dépliée avec ses capacités, comme l'ancienne carte de
  voie.

La recherche porte sur le nom et la description de l'entrée **et** de ce qu'elle accorde
(une voie est trouvée par le texte d'une de ses capacités, avec la capacité signalée).

### Marché

Les entrées des sortes déclarées, sauf les entrées `libre` (objet personnalisé) : table
dense, recherche plein texte, filtre par sorte et par catégorie (`groupeChamp`), tri par nom
ou par prix, détail au clic. Le prix est un champ du catalogue : `prix` a été ajouté aux
objets de dnd-classic (valeurs de `legacy/public/tabs/data.json`). Les tarifs qui ne sont pas
des objets possédables (services, logement, montures, immobilier) deviennent un texte du
système (`textes/tarifs.md`), affiché sous le catalogue.

**Ajouter à l'inventaire** (table seulement) : sur la fiche du héros incarné, si sa lecture
donne `permissions.write`. Même opération que l'inventaire de la fiche
(`fiche/blocks/inventory/model.ts` : `ajouter`, `modesAjout`), donc une unité de plus sur une
pile, sinon un nouvel exemplaire ; bloqué quand la sorte est pleine.

### Bestiaire

Deux sources, un seul rendu (statistiques déclarées, actions, description) :

1. **Bestiaire de référence du système** : `systemes/<id>/bestiaire/*.yaml`, une liste de
   créatures `{ id, nom, entite, categorie, type, description, image, valeurs, actions }`.
   `valeurs` porte les statistiques affichées, par clé d'attribut du type d'entité (vérifié
   au build par `checkBestiary` de `@vtt/rules`). Ce sont des **fiches de lecture**, pas des
   états calculables : les valeurs dérivées (Défense, Contact) sont celles du livre.
   Assemblé dans `dist/systemes/bestiaires/<id>.json` (sous-dossier : les services qui
   listent `dist/systemes/*.json` ne le prennent pas pour un système), copié dans
   `public/systemes/bestiaires/`, chargé à l'ouverture de l'onglet. dnd-classic reprend les
   334 créatures de `legacy/public/tabs/bestiairy.json` (catégories et tailles traduites,
   `Challenge` égal au niveau partout, donc non repris).
2. **Bestiaire de la campagne** : les modèles de PNJ du MJ (service character,
   `GET /v1/campaigns/:id/npc-templates` et `/npc-template-categories`, voir
   [api-templates.md](api-templates.md)). Leurs statistiques sont un `EtatEntite`, calculé
   localement avec le système de la campagne (et ses options). Rafraîchi par les événements
   `npc_template.*`.

Choix : le bestiaire de la campagne est **la liste des modèles de PNJ**, pas une copie. La
création et l'édition des modèles restent à l'outil MJ de la carte (hors périmètre) ; la
copie d'une créature de référence vers les modèles de la campagne est une suite possible
(il faudra convertir des valeurs de livre en état calculable, comme l'import des modèles).

### Images

Bibliothèque déclarée par dossiers de l'index public des actifs (`/asset-mappings.json`,
déjà servi par le front et lu par `lib/assets.ts` : URL publiques du CDN, aucun secret). Une
collection réunit des dossiers (`Map` et `Cartes`) ; sa sous-catégorie est le segment qui
suit le dossier (`Map/Foret/Static` → « Foret »), ou le nom du fichier sans son numéro
(`Assets/Elfe3.png` → « Elfe »). Images seulement (les cartes animées restent à la carte).
Grille paginée, aperçu en grand (flèches du clavier), ouvrir l'original, copier le lien.

### Objets de la carte

`references.objets` : catégories (`titre`, `dossiers`) de l'index des actifs, comme les
collections d'images. Ce n'est pas un onglet des ressources : c'est la bibliothèque de l'outil
Objets de la carte (voir [carte.md](carte.md) § 10). dnd-classic et nooblies reprennent la
liste d'objets de l'ancienne app (`legacy/src/lib/suggested-objects.ts`), star-wars-eote la
sienne (`suggested-objects-starwars.ts`).

### Polices des systèmes

`theme.polices` de la présentation : `corps` (texte courant), `titres`, `decorative`, et
`fichiers` (`famille`, `fichier`, `graisse`, `style`) : les fichiers du dossier `polices/` du
système, vérifiés et copiés par l'assembleur (`dist/systemes/polices/<id>/`), puis par
`frontend/scripts/systemes.mjs` (`public/systemes/polices/<id>/`). À la table, le front les
déclare au navigateur et applique `corps` et `titres` à toute la page, comme l'ancienne app ;
toutes sont proposées pour les textes de la carte. star-wars-eote : Orbitron et Aurebesh ;
dnd-classic : Hobbiton Brush Hand (décorative).

## Droits et écrans

| Onglet    | Accueil (`/resources`)              | Table (panneau « Ressources », touche B)         |
| --------- | ----------------------------------- | ------------------------------------------------ |
| Capacités | tous                                | tous                                             |
| Marché    | catalogue seul                      | + « Ajouter à l'inventaire » si droit d'écriture |
| Bestiaire | référence du système, s'il en a une | **MJ seul** : modèles de la campagne + référence |
| Images    | tous                                | tous                                             |

- **Accueil** : page `/resources` du menu principal ; sélecteur de système en tête (le
  premier par défaut, gardé dans l'adresse `?system=`).
- **Table** : entrée `resources` du registre des panneaux (largeur pleine, à gauche). La
  touche R est prise par le panneau Dés (« relancer ») : la touche est **B** (bibliothèque).
  Système de la campagne réglé avec ses options (un champ d'une option éteinte est caché).
- Onglets dans l'ordre Capacités, Marché, Bestiaire, Images ; l'onglet ouvert est gardé
  dans l'adresse (`?onglet=`) sur l'accueil.

## Code

- `packages/rules/src/schema/presentation.ts` : `references` et sa vérification ;
  `schema/bestiaire.ts` : `Bestiary`, `checkBestiary`.
- `packages/systemes` : `bestiaire/*.yaml` lus par `sources.ts`, validés et écrits par
  l'assembleur ; `frontend/scripts/systemes.mjs` copie les bestiaires et indique leur
  présence dans l'index (`bestiaire: nombre`).
- `frontend/src/components/resources/` : navigateur à onglets et un dossier par onglet
  (modèles sans React à part) ; `frontend/src/lib/bestiary.ts` (bestiaire de référence,
  modèles de PNJ).
- `frontend/src/app/(app)/resources/page.tsx` ; `components/table/onglets/resources.tsx`.

## Écarts assumés avec l'ancienne app

- Le livre à tourner du bestiaire devient une grille de cartes et une fiche : même contenu
  (image, type, statistiques, actions), lisible au clavier et sur mobile. Le « FP » valait le
  niveau pour les 334 créatures : seul le niveau (attribut du système) est affiché.
- Les onglets Races et Classes du bestiaire rejoignent l'onglet Capacités, qui les montrait
  déjà sous une autre forme.
- Le marché ne montre que des objets du catalogue (ceux que l'inventaire connaît) ; les tarifs
  qui ne sont pas des objets sont un texte du système. Les prix en fourchette y restent en
  texte, les prix des objets sont des nombres dans l'unité du champ.
- Pas de bouton « Télécharger » : les images viennent d'un autre domaine (l'attribut
  `download` n'y a pas d'effet) ; « Ouvrir l'original » et « Copier le lien » le remplacent.
- Hors périmètre pour l'instant : copier une créature de référence dans les modèles de PNJ
  de la campagne, créer ou modifier un modèle depuis le bestiaire (outil MJ de la carte), les
  cartes animées (vidéos).
