# Carte : conception de la refonte (PixiJS)

Document de référence du chantier « carte ». Il remplace la carte legacy
(`legacy/src/app/[roomid]/map/**`, audit : [map-legacy-audit.md](map-legacy-audit.md)). Données
et routes existantes : [map.md](map.md), [api-map.md](api-map.md). Temps réel :
[api-realtime.md](api-realtime.md). Tout agent qui touche à la carte lit ce document en entier
avant d'écrire du code. Une décision qui s'en écarte est d'abord écrite ici.

## 1. Ce que veut la table

1. **Fond** : une image ou une vidéo webm, par scène, déposée par le MJ.
2. **Même carte pour tous, à toutes les tailles d'écran** : chacun voit la carte entière à
   l'arrivée, et les éléments posés dessus gardent leur place et leur taille relative sur
   n'importe quel écran.
3. **Un seul comportement pour tout ce qui est posé** : clic, glisser, survol, sélection, menu
   contextuel, clavier. Personnages, objets, dessins, lumières, murs… réagissent de la même
   façon.
4. **Dessin** : main levée, formes (ligne, rectangle, cercle), couleurs, épaisseur, gomme,
   textes.
5. **Personnages (PNJ)** : chaque PNJ posé est une **vraie instance** d'un modèle (fiche
   complète, stats calculées par `@vtt/rules`). Trois sources : modèles de la campagne,
   bestiaire du système, création rapide.
6. **Objets** : glisser, tourner, redimensionner, verrouiller, masquer, visible seulement pour
   certains joueurs, et « fouiller » pour les joueurs quand le MJ l'active.
7. **Visibilité**, le cœur du chantier :
   - obstacles avec vue simulée : ce qui est derrière un mur est dans l'ombre, et les PNJ et
     objets derrière sont masqués ;
   - transparence réglable ;
   - portes ;
   - murs à sens unique ;
   - pièces fermées : de l'intérieur, on ne voit pas dehors ; de l'extérieur, on ne voit pas
     dedans ;
   - outils de pose simples et sans bug.
8. **Brouillard** : zones posées en cercle, rectangle ou à main levée. Dans le brouillard, un
   joueur ne voit que dans son rayon de vision. Contrairement aux murs, le brouillard n'agit que
   sur la portée.
9. **Lumières** : rayon réglable ; une zone éclairée se voit même dans le brouillard.
10. **Direct** : déplacements, tracés, pings et curseurs se voient chez tous pendant le geste,
    par WebSocket. La base ne reçoit que l'état final.

Qualité attendue : fluide (60 i/s en déplacement), aucun élément caché qui fuite chez un joueur,
aucune ombre qui clignote ni ne perce entre deux murs soudés.

## 2. Principes

- **Moteur hors de React.** PixiJS v8 (WebGL) piloté par des classes TypeScript. React ne sert
  qu'aux panneaux, menus, inspecteurs et barres d'outils, en surcouche DOM. Un `mousemove` ne
  re-rend jamais React.
- **Un modèle d'entité commun.**
  - Tout ce qui se clique sur la carte est une `MapEntity`.
  - Le comportement (sélection, glisser, verrou, masquage, menu, clavier, direct, annuler) est
    écrit une seule fois, dans le contrôleur d'interaction.
  - Chaque sorte d'entité déclare ses capacités et son rendu.
- **Outils en machines à états**, testables sans DOM ni WebGL : `Tool` reçoit des événements en
  coordonnées du monde.
- **Test de toucher maison**, sur un index spatial, et non par le système d'événements de Pixi.
  Il suit les règles de verrou, de calque et de droits, et reste testable sans rendu.
- **Visibilité partagée** : le paquet `@vtt/vision` (géométrie pure) sert au navigateur pour le
  rendu et au service campaign pour filtrer ce qu'un joueur reçoit. Un seul algorithme, aucun
  écart entre ce qui est affiché et ce qui est envoyé.
- **Le serveur fait autorité.** Un joueur ne reçoit jamais un PNJ ou un objet qu'il ne doit pas
  voir, ni en REST, ni sur le bus, ni sur le canal éphémère. Le client ne fait que le rendu.
- **Durable par REST et bus, direct par le canal éphémère.**
  - Toute modification passe par une commande : optimiste, annulable, `version`.
  - Pendant le geste, l'état passe par le canal éphémère.
- **Zéro clé de jeu en dur.** Barre de PV, stats affichées et création rapide passent par la
  présentation du système (`@vtt/rules`), comme `fiche.tsx`.
- **Design system**, pas de hex dans les composants React (`color-mix()` sur les variables du
  thème). Les couleurs de dessin sont des données.
- **Code en anglais, textes et commentaires en français.**

## 3. Arborescence (front)

```
frontend/src/lib/map/
  engine/
    map-engine.ts        MapEngine : modules, entités, rendu à la demande, commandes communes
    pixi-view.ts         rendu PixiJS (Application, plans, calques, surcouches), chargé au
                         montage seulement : le moteur tourne « à blanc » sans lui
    background.ts        fond image ou vidéo, taille du monde
    camera.ts            Camera : monde ⇄ écran, zoom, pan, cadrage, bornes, animations
    planes.ts            plans de rendu techniques et leur ordre, réglage « Affichage » (§ 5)
    layers.ts            calques du MJ : pile ordonnée, ordre des entités (§ 5, Calques)
    layer-operations.ts  panneau Calques : créer, renommer, réordonner, supprimer (commandes)
    screen-space.ts      éléments à taille constante à l'écran (étiquettes, poignées)
    spatial-index.ts     grille spatiale : test de toucher, sélection au lasso, culling
    geometry.ts          points, rectangles tournés, segments
    test-kit.ts          banc d'essai des tests (moteur à blanc, sorte factice)
    entities/
      entity.ts          MapEntity (base) et EntityState
      entity-kind.ts     EntityKind : fabrique, rendu, capacités, droits, actions
      common-actions.ts  actions communes du menu, générées par les capacités
      registry.ts        registre des sortes
    interaction/
      controller.ts      pointeur, souris, tactile, clavier → gestes communs
      dom-input.ts       branchement du DOM sur le contrôleur (seul fichier qui écoute le navigateur)
      selection.ts       sélection (simple, multiple, lasso)
      drag.ts            glisser (seuil, grille, annulation, direct)
      transform-gizmo.ts poignées communes de rotation et de taille
      snapping.ts        aimantation (grille, extrémités, segments, angles)
    tools/
      tool.ts            interface Tool (machine à états)
      tool-manager.ts    outil actif, raccourcis, curseur
      select-tool.ts     outil par défaut : sélection et gestes communs
  store/
    map-store.ts         état normalisé (zustand vanilla), hors React
    collections.ts       couches : clé du magasin, segment d'URL, domaine des événements
    sync.ts              chargement REST, événements du bus, relecture (`generation`)
    commands.ts          commandes do/undo, optimisme, annuler/refaire
  live/
    live-channel.ts      canal éphémère : émission cadencée, réception, interpolation
  api.ts                 client REST typé (@vtt/contracts)
  active-map.ts          carte affichée dans l'onglet (pour les panneaux hors de la carte)
  modules/
    index.ts             liste des modules chargés par le moteur
    scene/               moteur : point d'apparition (outil lancé par le panneau Scènes)
    drawings/            dessins et textes
    tokens/              personnages et PNJ
    objects/             objets
    obstacles/           murs, portes, fenêtres, sens unique, pièces
    fog/                 zones de brouillard
    lights/              lumières
    vision/              rendu de la visibilité (ombres, brouillard, lumières, masquage)
frontend/src/components/map/
  table-map.tsx          la carte à la table : choix de la scène, montage dans MapStage
  use-table-map.ts       quelle scène afficher (joueur : celle de son personnage ; MJ : `?scene=`)
  map-canvas.tsx         monte le moteur (client seulement, `next/dynamic`) et ses surcouches
  engine-context.tsx     hooks React du moteur (sélecteurs à instantané stable)
  toolbar.tsx            barre d'outils (outils fournis par les modules)
  context-menu.tsx       menu contextuel commun (Radix), ancré au point de l'écran
  inspector.tsx          panneau d'inspection de la sélection (sections fournies par les modules)
  confirm-dialog.tsx     confirmations demandées par le moteur
  layers/                panneau des calques du MJ (K)
  scenes/                panneau Scènes (E) : liste, dossiers, fond, groupe (ex-CitiesManager)
  <module>/              UI propre à un module (bibliothèque de PNJ, propriétés d'un objet…)
packages/vision/         géométrie de la visibilité (§ 9), sans DOM
```

Un module exporte un `MapModule` : `register(engine: MapEngine)` y enregistre ses `EntityKind`
(`registerKind`), ses `Tool` (`registerTool`), ses sections d'inspecteur
(`registerInspectorSection`), ses entrées de barre d'outils (`registerToolbarItem`), ses entrées
de menu (`registerMenuProvider`), ses animations (`onFrame`), ses objets Pixi (`whenMounted`,
`plane(id)`, `pixi`, `theme`) et ses abonnements au store, et renvoie son nettoyage.
`modules/index.ts` les liste, une ligne par module, avec un exemple complet.

## 4. Coordonnées, caméra, échelle

- **Monde = pixels du fond.** Coordonnées du monde = pixels de l'image ou de la vidéo de fond,
  à sa taille naturelle (`maps.width/height`), comme le backend. Aucune coordonnée d'écran n'est
  stockée.
- **Unité de jeu.** `map_settings.pixelsPerUnit` pixels du monde = une case (unité `unitName`).
- **Taille des éléments.**
  - Un token mesure `pixelsPerUnit × token.scale × tokenScale` pixels du monde.
  - Les rayons (vision, lumière) sont stockés en pixels du monde (tokens) ou en unités
    (lumières, × `pixelsPerUnit`), comme aujourd'hui.
- **Caméra `{ x, y, zoom }`.**
  - `x, y` : point du monde au centre de la vue ; `zoom` : pixels d'écran par pixel du monde.
  - À l'arrivée, cadrage « contenir » avec une marge de 24 px : chacun voit toute la carte, quelle
    que soit la taille de son écran, et tout ce qui est posé dessus garde sa place relative.
  - Zoom borné entre `fit × 0,25` et 8.
  - La dernière caméra est gardée par utilisateur et par carte (`localStorage`, confort).
- **Taille constante à l'écran** pour les étiquettes, poignées, contours de sélection et icônes
  de porte : leur échelle vaut `1 / zoom`, mise à jour en une passe au changement de zoom, sur
  les seuls éléments visibles.
- **Densité.**
  - `resolution = min(devicePixelRatio, 2)` et `autoDensity`.
  - Sous Windows, `resolution ≤ 1,5` et pas d'antialias MSAA (plantages GPU relevés sur les
    dés 3D).
  - Préférence `webgl`, pas `webgpu`.
- **Gestes de caméra.**
  - Molette : zoom autour du curseur. Pincement du pavé tactile (`ctrlKey` + molette) : zoom.
    Deux doigts : zoom et pan.
  - Pan au clic du milieu, à Espace + glisser, ou au glisser du vide avec l'outil main.
  - Double clic du milieu : recadrer.
  - Le MJ peut « amener tout le monde ici » (§ 8).
- **Changement de fond.** Si les dimensions changent, le MJ se voit proposer « Adapter les
  éléments à la nouvelle taille » (`POST …/rescale`, § 12), qui met à l'échelle toute la
  géométrie en une transaction.

## 5. Rendu

- **Rendu à la demande.**
  - Le ticker Pixi ne tourne que si quelque chose l'exige : geste en cours, interpolation du
    direct, animation, fond vidéo. Sinon, une image est rendue quand le store ou la caméra change
    (`engine.invalidate()`).
  - Fond vidéo : 30 i/s au plus.
- **Culling** par l'index spatial : seuls les éléments qui touchent la vue sont `visible`.
- **Plans de rendu, du bas vers le haut** (`planes.ts`) :

  | #   | Plan          | Contenu                                                                                                                                     |
  | --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1   | `background`  | image ou vidéo de fond                                                                                                                      |
  | 2   | `content`     | les **calques du MJ** (ci-dessous), du plus bas au plus haut ; dans chaque calque, les entités par `z` croissant                            |
  | 3   | `vision`      | obscurité, brouillard, lueurs (§ 9), pour les joueurs et la « vue joueur » du MJ                                                            |
  | 4   | `allies`      | personnages joueurs hors de ma vue : toujours vus, dessinés au-dessus de l'ombre à 60 %                                                     |
  | 5   | `annotations` | dessins et textes hors calque (`layerId` nul) : annotations, jamais dans l'ombre                                                            |
  | 6   | `gm`          | surcouches MJ : murs, portes, pièces, contours de brouillard, lumières. Toujours au-dessus de l'ombre, quel que soit le réglage d'affichage |
  | 7   | `adornments`  | survol, sélection, poignées, étiquettes (taille constante)                                                                                  |
  | 8   | `live`        | fantômes des glissers des autres, tracés en cours, curseurs, pings                                                                          |
  | 9   | `tool`        | aperçu de l'outil actif                                                                                                                     |

- **Portes pour les joueurs.** Les icônes de porte sont dessinées dans `adornments` pour qu'un
  joueur puisse ouvrir une porte proche.
- **Affichage.** `map.display` (ex-`map.layers`, réglage MJ) masque des familles entières
  (lumières, obstacles, brouillard…), comme avant. Ce n'est pas la même chose que les calques.
- **Aucune allocation par image** dans les boucles chaudes (réutiliser les `Graphics`, tableaux
  typés), et **aucun `Graphics` recréé** si l'entité n'a pas changé.

### Calques du MJ (niveaux)

L'ancienne carte n'en avait pas, et c'est ce qui coinçait : impossible de poser un pont au-dessus
d'un personnage, un tapis sous une table ou un toit au-dessus de tout. Chaque carte a donc une
**pile ordonnée de calques**, gérée par le MJ, et tout ce qui est posé peut passer au-dessus ou
en dessous de n'importe quoi d'autre.

- **Modèle.** `MapLayer` = `{ id, mapId, name, sortOrder, visibleToPlayers, locked, opacity }`.
  - Une nouvelle carte naît avec trois calques : « Sol » (décors), « Objets », « Personnages ».
  - Les cartes existantes sont migrées : objets `isBackground` → Sol, autres objets → Objets,
    tokens → Personnages. `isBackground` disparaît du contrat : le calque le remplace.
- **Appartenance.**
  - Tokens et objets appartiennent à exactement un calque (`layerId`) et ont un ordre `z`
    (nombre réel) dans ce calque.
  - Dessins et textes : `layerId` facultatif. Nul, c'est une annotation (plan `annotations`,
    au-dessus de l'ombre) ; sinon, ils font partie du monde comme le reste.
  - Ordre d'affichage = ordre des calques, puis `z`. Réordonner n'écrit que l'élément déplacé
    (`z` pris entre ses voisins), jamais toute la pile.
- **Gestes communs**, pour toutes les sortes, sélection multiple comprise (l'ordre relatif est
  gardé) :
  - menu contextuel « Ordre ▸ » : Avancer, Reculer, Premier plan, Arrière-plan (dans le calque) ;
  - menu contextuel « Calque ▸ » : la liste des calques (coche sur l'actuel), Calque au-dessus,
    Calque en dessous ;
  - clavier : ⌘/Ctrl+↑ et ↓ avancent et reculent d'un cran, ⌘/Ctrl+⇧+↑ et ↓ mettent au premier
    plan et à l'arrière-plan, ⌥+⌘/Ctrl+↑ et ↓ changent de calque. Pas de [ et ], peu pratiques
    en AZERTY.
- **Panneau « Calques »** (MJ, bouton de la barre d'outils, touche K) :
  - liste du haut vers le bas, comme un logiciel de dessin ;
  - glisser pour réordonner, double clic pour renommer, nombre d'éléments ;
  - **calque actif** : ce qui est posé y va ; sinon le calque par défaut de la sorte (objet →
    Objets, PNJ → Personnages) ;
  - « Masqué aux joueurs » (`visibleToPlayers`, enregistré) : le calque et tout son contenu ne
    sont jamais envoyés aux joueurs (filtre serveur) ;
  - œil local (MJ seulement, non enregistré) : cache le calque sur mon écran pour travailler
    dessous ; « Isoler » : estompe tous les autres ;
  - cadenas (`locked`) : ses éléments ne se sélectionnent plus, ni au clic ni au lasso (on clique
    à travers), sauf les tokens d'un joueur pour lui ;
  - opacité du calque (feuillage, toit en transparence) ;
  - « Sélectionner le contenu » ; supprimer (le contenu descend dans le calque du dessous, après
    confirmation).
- **Toucher.** Du calque le plus haut au plus bas, puis du `z` le plus grand au plus petit. Les
  calques verrouillés ou cachés localement sont ignorés.
- **Visibilité.** Tous les calques sont sous le plan `vision` : l'ombre et le masquage des PNJ et
  objets derrière les murs s'appliquent à tous.
- **Synchronisation.**
  - Chaque changement de calque est une commande annulable.
  - Événements `map_layer.*`. Quand un calque est masqué aux joueurs, ils reçoivent
    `map_layer.hidden { id }` et retirent son contenu. Quand il redevient visible, ils relisent
    la carte.
- **Étages.** Un autre étage est une autre scène, reliée par un portail (lot suivant, § 11). Les
  calques servent aux superpositions d'une même scène.

## 6. Entités et interaction commune

### `MapEntity`

Classe de base de tout ce qui est posé. Elle porte :

- l'identité : `id`, `kind`, `plane` (plan de rendu), `layerId` et `z` (calque du MJ et ordre) ;
- la transformation : `x, y, rotation, width, height` ;
- ce que le toucher et l'index utilisent : `bounds()` et `hitTest(p, tolerancePx)` ;
- l'état d'affichage : `EntityState` = `hovered`, `selected`, `dragging`, `locked`,
  `hiddenForPlayers`, `remote` (un autre la déplace), `pending` (écriture optimiste pas encore
  confirmée) ;
- son `display` : un `Container` Pixi.

### `EntityKind`

Chaque sorte d'entité déclare :

- `capabilities` : `select`, `move`, `rotate`, `resize`, `lock`, `hide`, `restrictTo`
  (visible pour certains joueurs), `duplicate`, `delete`, `inspect`, `order` (ordre et calque,
  pour les sortes rangées dans les calques : `stacking`) ;
- `can(action, entity, viewer)` : les droits, miroir exact du backend ;
- `render(entity, display, ctx)`, puis `update(...)` incrémental ;
- `actions(entity, ctx)` : les entrées propres au menu contextuel.

Les actions **communes** sont générées à partir des capacités, avec les mêmes libellés partout :

- Verrouiller et Déverrouiller ;
- Masquer aux joueurs et Montrer ;
- Visible pour… ;
- Pivoter ;
- Dupliquer ;
- Ordre ▸ (avancer, reculer, premier plan, arrière-plan) et Calque ▸ (§ 5, Calques) ;
- Supprimer.

### Gestes communs (`interaction/controller.ts`)

| Geste                                      | Effet                                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Survol                                     | contour et curseur (`grab`, `pointer`, `not-allowed` si verrouillé) ; nom en info-bulle après 400 ms                                                                                                      |
| Clic                                       | sélectionne (⇧ : ajoute ou retire) ; clic dans le vide : désélectionne                                                                                                                                    |
| Glisser (seuil de 4 px écran)              | déplace la sélection si `move` et `can` ; aperçu local, direct (§ 8), aimantation (grille, Alt pour s'en passer) ; au lâcher : **une** commande pour toute la sélection ; Échap pendant le geste : annule |
| Glisser dans le vide (outil sélection)     | lasso rectangulaire (⇧ : ajoute)                                                                                                                                                                          |
| Double clic                                | inspecteur (fiche du PNJ, propriétés de l'objet…) ; un texte s'édite en place                                                                                                                             |
| Clic droit ou appui long (500 ms, tactile) | menu contextuel : actions communes et actions de la sorte ; sélection multiple : actions communes à toutes                                                                                                |
| Poignées (`transform-gizmo.ts`)            | rotation (⇧ : pas de 15°), taille par les coins (⇧ : garde les proportions) ; mêmes poignées pour objets, tokens et textes                                                                                |
| Suppr / Retour arrière                     | supprime la sélection (confirmation pour une instance de PNJ)                                                                                                                                             |
| Flèches                                    | déplacent d'une case (⇧ : de 5)                                                                                                                                                                           |
| ⌘/Ctrl+Z, ⌘/Ctrl+⇧+Z                       | annuler, refaire (§ 7)                                                                                                                                                                                    |
| ⌘/Ctrl+D                                   | dupliquer                                                                                                                                                                                                 |
| R, ⇧R                                      | pivoter de 15°, dans un sens ou dans l'autre                                                                                                                                                              |
| ⌘/Ctrl+↑↓, ⇧, ⌥                            | ordre dans le calque, premier plan / arrière-plan, changement de calque (§ 5, Calques)                                                                                                                    |
| Échap                                      | annule le geste, puis l'outil, puis la sélection                                                                                                                                                          |

Règles de ces gestes :

- **Verrouillé** : un élément verrouillé se sélectionne et s'inspecte, mais ne bouge pas.
- **Élément masqué aux joueurs** : le MJ le voit hachuré, à 50 %, avec un badge « œil barré ».
- **Clavier** : les raccourcis de la carte ne sont actifs que si la carte a le focus, et jamais
  pendant la saisie.
- **Lettres réservées** : la carte prend V, P, T, W, G, L, I (outils), R (pivoter) et K
  (calques, MJ). F, D, C, N, J, H, S, B, M, O et E (Scènes, MJ) appartiennent aux panneaux de la
  table. Encore libres : A, Q, U, X, Y, Z et les chiffres.

### Outils (`tools/`)

- **Un seul outil actif.** Sélection par défaut (V). L'outil reçoit
  `down / move / up / key / cancel` en coordonnées du monde et dessine son aperçu dans `tool`.
- **Machine à états explicite** (`idle → armed → dragging → …`), testée sans rendu.
- **Échap** revient toujours à un état sûr, sans écriture partielle.
- **Barre d'outils** (MJ, et joueurs pour le dessin et les textes) :

  | Touche | Outil      | Module      |
  | ------ | ---------- | ----------- |
  | V      | sélection  | moteur      |
  | P      | dessin     | `drawings`  |
  | T      | texte      | `drawings`  |
  | W      | obstacles  | `obstacles` |
  | G      | brouillard | `fog`       |
  | L      | lumières   | `lights`    |
  | I      | objets     | `objects`   |

  La barre d'outils porte aussi « Vue » (MJ / vue d'un joueur, § 9), « Calques » (panneau des
  calques du MJ, K) et « Affichage » (familles affichées, `map.display`).

## 7. Données, synchronisation, annuler

- **`map-store.ts`** (zustand vanilla, hors React).
  - Il tient `scene`, `settings`, et une `Map<id, dto>` par couche, plus les `version`.
  - Le moteur s'y abonne et applique des **diffs** : entité ajoutée, changée ou retirée, jamais
    un rendu complet.
  - React lit par sélecteurs, avec des instantanés stables.
- **`sync.ts`**.
  - Au chargement : `GET /maps/:mapId` et `GET /map-settings`.
  - En continu : les événements `map.*`, `token.*` et `map_*` via `useCampaignEvents`, appliqués
    au store (un événement dont la `version` n'est pas plus récente est ignoré).
  - Sur `generation` (premier abonnement, reconnexion, `resync`) : relecture complète.
  - Événement expurgé ou `*.hidden` : on retire l'élément, et on relit l'élément en REST si
    nécessaire.
  - Un joueur relit tokens et objets (filtrés par le serveur) après le déplacement d'un de ses
    tokens et après une porte ouverte ou fermée, car son champ de vision a changé.
- **`commands.ts`**.
  - Une commande est `{ label, apply(store), revert(store), send(api) }`.
  - `apply` est optimiste, puis la réponse REST remplace l'élément.
  - Une erreur appelle `revert`, puis un toast (`messageErreur`).
  - Un `409 version_conflict` relit l'élément, puis affiche le toast « modifié entre-temps ».
  - Pile d'annulation par utilisateur et par carte, 100 entrées. Une annulation est une commande
    comme une autre, envoyée au serveur.
  - Groupement : un glisser de 12 éléments est **une** commande (`/tokens/move` ou `/batch`).

## 8. Direct (WebSocket)

Canal éphémère du service realtime (`useCampaignEphemeral`) : relayé, jamais stocké. Deux sortes
de messages seulement.

- **`map.live`**, émis à 15 Hz au plus tant qu'un geste est en cours, puis une dernière fois
  avec `end`. Il regroupe tout ce qui bouge chez l'émetteur, en un seul message par audience :

  ```ts
  {
    m: string;                    // mapId
    s: number;                    // compteur de l'émetteur
    drag?: [id: string, x: number, y: number, rotation?: number][];
    cursor?: [x: number, y: number];
    stroke?: { id: string; tool; color; width; points: number[] /* delta depuis le dernier envoi */ };
    transform?: [id: string, x, y, width, height, rotation][];
    end?: true;
  }
  ```

  Le message pèse moins de 4 Kio. Au-delà, les points du tracé partent au message suivant.

- **`map.ping`** : `{ m, x, y, focus? }`.
  - Alt+clic : onde à cet endroit, chez tous.
  - `focus` (MJ) : la caméra de chacun va à ce point (« amener tout le monde ici »).

**Réception.**

- Tampon de 100 ms, puis interpolation linéaire : un fantôme glisse sans à-coups.
- Élément inconnu du destinataire : ignoré.
- Plus rien pendant 2 s : le fantôme disparaît.
- `end`, ou l'événement durable qui suit : il se pose.

**Audience** (aucune fuite).

- Public : entité vue par tous (personnage joueur, PNJ `visible` ou `ally`, objet visible, tracé,
  curseur).
- Entité cachée (`hidden`, `invisible`, objet masqué) : `gmOnly`.
- `custom`, ou PNJ `visible` derrière un mur pour certains : `toUsers`. C'est la liste des
  joueurs qui la voient, calculée par le client du MJ avec `@vtt/vision` (le MJ a toutes les
  données). L'ajout est côté realtime, § 12.

**Débit.**

- Budget côté client : 12 messages par seconde en tout.
- La limite du serveur passe à 30/s (rafale 60) pour absorber un glisser et un curseur ensemble
  (§ 12).
- Curseurs : désactivés par défaut, bouton « Montrer mon curseur ». Un curseur immobile est
  rappelé chaque seconde ; sans nouvelles pendant 3 s, il disparaît.

## 9. Visibilité

### Modèle

| Élément                          | Effet sur la vue                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mur `wall`                       | bloque la vue si `opacity = 1` ; en dessous : ombre partielle (`opacity`), PNJ derrière toujours visibles                                                                                                                                                                 |
| Porte `door`                     | fermée : comme un mur ; ouverte : laisse voir. `isLocked` : un joueur ne peut pas l'ouvrir                                                                                                                                                                                |
| Fenêtre `window`                 | laisse voir ; ne compte pas pour ouvrir une pièce                                                                                                                                                                                                                         |
| Mur à sens unique `one_way_wall` | segment orienté a→b, `blocksFrom: 'left' \| 'right'` : bloque la vue d'un observateur situé de ce côté ; de l'autre côté, on voit à travers. Côté gauche : `cross(b − a, p − a) < 0` en coordonnées écran (y vers le bas). La flèche dessinée montre le sens où l'on voit |
| Pièce `room`                     | polygone fermé, sans effet de mur par lui-même. **Fermée** si aucune porte ouverte ne se trouve sur son contour (extrémités et milieu à 3 px au plus : une porte en travers de la pièce n'en fait pas partie) ; une fenêtre ne l'ouvre pas                                |
| Zone de brouillard               | `circle`, `rect`, `polygon` (main levée), en mode `fog` (ajoute) ou `clear` (retire), appliquées dans l'ordre de création ; `maps.fogFull` : toute la carte au départ                                                                                                     |
| Lumière                          | cercle de rayon `radius` (unités) et `falloff` ; sa portée est coupée par les murs (polygone de vue depuis la lumière) ; éteinte : sans effet ; peut suivre un token (`attachedTokenId`)                                                                                  |
| Observateur                      | chaque token d'un joueur (ses personnages et les `ally`), `visionRadius` en pixels, ×3 avec `visionBoost`                                                                                                                                                                 |

Le mur à sens unique est porté par `blocksFrom`, relatif au sens de tracé. Il remplace
`direction: north|south|east|west` : un changeset le convertit à partir de l'orientation du
segment.

### Ce qu'un observateur O voit

```
LOS(O)  = polygone de vue depuis O (murs opaques, portes fermées, sens unique vu depuis O), borné à la carte
Pièce   = LOS(O) ∩ R − (toutes les pièces fermées qui ne contiennent pas O)
          où R est la pièce fermée la plus intérieure (la plus petite) qui contient O ;
          sans R, pas d'intersection. Une pièce fermée imbriquée dans R est aussi retirée.
Portée  = (hors brouillard) ∪ disque(O, visionRadius) ∪ (⋃ lumières allumées : disque(L, rayon) ∩ LOS(L))
Vu(O)   = Pièce ∩ Portée
Vu(joueur) = ⋃ Vu(O) pour chacun de ses observateurs
```

- **Pas d'opérations booléennes de polygones pour répondre.** `Vu` est une structure qui
  répond à `contains(point)` en combinant les tests (point dans polygone, dans disque, dans zone).
  Le rendu compose les mêmes termes sur le GPU (masques, `ERASE`).
- **Test d'une entité.** Une entité est vue si l'un de ses points d'échantillon est vu :
  - token : centre et 8 points à 0,7 × rayon ;
  - objet : centre, coins et milieux des bords du rectangle tourné.
    Un PNJ ou un objet non vu n'est ni rendu ni envoyé au joueur (serveur, § 12).
    Un objet de sorte `decor` n'est pas filtré : l'obscurité le couvre, comme le fond.
- **Personnages joueurs** : toujours vus. Hors de ma vue, ils sont dans le calque `allies` à 60 %.
- **Vue du MJ.**
  - Par défaut, tout est visible. L'ombre des joueurs est montrée en voile léger (25 %) pour
    qu'il sache ce qu'ils voient, sans rien lui cacher.
  - « Vue de … » (sélecteur de joueur) : rendu exact de ce joueur, et entités non vues masquées.
- **`shadowOpacity`** (réglage MJ) : opacité de l'obscurité hors de vue (1 = noir).

### Rendu (module `vision`)

- **Masque de vision** : une `RenderTexture` à 0,5 × la résolution de la vue, recalculée quand
  un observateur, une porte, un mur, une zone ou une lumière change, et pendant un glisser
  (direct local).
  - Les polygones de vue y sont peints en blanc, les pièces appliquées en masque ou en `ERASE`.
  - Un flou léger (2 px) donne des bords doux sans percer les murs : le flou est appliqué
    avant le découpage par les murs, ou les murs sont épaissis de 1 px.
- **Obscurité** : un voile de `shadowOpacity` partout où le masque est noir.
- **Brouillard** : une texture de brouillard (bruit animé lent, désactivable) dans les zones de
  brouillard, sauf dans (disques de vision ∪ lumières) ∩ LOS.
- **Lumières** : un dégradé radial additif, coupé par leur LOS.
- **Ombres partielles** : quadrilatères projetés derrière les murs `opacity < 1`, à cette
  opacité.
- **Masquage des entités** : `entity.display.visible = vu(entity)` pour le joueur (et en vue
  joueur MJ), avec une transition de 150 ms.

### `@vtt/vision` (paquet pur)

Mode d'emploi détaillé : `packages/vision/README.md`.

```ts
prepareScene(scene: VisionScene, { snap?, doorTolerance? }?): PreparedScene
                                   // murs soudés et découpés, index, pièces et portes du contour, zones
withLights(prep, lights): PreparedScene                 // autres lumières, murs partagés (torche)
visibilityPolygon(prep, origin, { maxRadius? }?): Polygon // LOS : balayage angulaire, murs opaques
translucentShadows(prep, origin): { id; polygon; opacity }[]
lightArea(prep, light): { id; center; radius; falloff; polygon }   // LOS(L) coupée au disque
viewerView(prep, viewer): View                           // Vu(O)
playerView(prep, viewers): View                          // union
View.contains(p) ; View.containsXY(x, y) ; View.containsAny(points)
View.viewers : { origin; los; clipRoom; subtractRooms; visionRadius }[] ; View.lights
closedRooms(prep): Set<string> ; innermostRoom(prep, p, { closedOnly? }?): Room | null
inFog(prep, p): boolean ; pointInPolygon(p, polygon) ; sideOf(a, b, p)
sampleCircle(center, r) ; sampleRect(x, y, w, h, rotation) ; isEntityVisible(view, samples)
segmentsFromPolyline(props, points, closed?): Segment[]
```

`Polygon` = `Float64Array` à plat `[x0, y0, x1, y1, …]`. Les types d'entrée ne dépendent pas
des contrats : le client et le serveur y convertissent `MapObstacle`, `MapRoom`, `MapFogZone`,
`MapLight` (rayon × `pixelsPerUnit`) et les tokens.

**Exigences.**

- Robustesse :
  - points colinéaires, sommets exactement sur un rayon ;
  - jonctions en T, segments nuls ou confondus, murs qui se croisent (découpés au croisement) ;
  - observateur à moins de 10⁻⁷ × la taille de la carte d'un mur ou d'une extrémité : décalé de
    4 × 10⁻⁷ × cette taille, dans la première de 16 directions fixes qui l'en éloigne ; hors de
    la carte : ramené dedans ;
  - grandes coordonnées (carte de 1 000 000 px).
- Aucune fuite entre deux murs soudés : extrémités soudées à 0,5 px près (`snap`), extrémité à
  0,5 px de l'intérieur d'un mur soudée dessus. Une fente plus étroite ne laisse pas passer la
  vue.
- Tests de propriété contre un lancer de rayons naïf.
- Performances, mesurées par `vitest bench` (donjon de 2 000 segments, 85 pièces, 20 zones,
  20 lumières) :

  | Opération                           | Budget   | Mesuré  |
  | ----------------------------------- | -------- | ------- |
  | `prepareScene`, 2 000 segments      | < 5 ms   | 1,7 ms  |
  | `visibilityPolygon`, 2 000 segments | < 1,5 ms | 0,45 ms |
  | `contains`, 10 000 requêtes         | < 5 ms   | 1,2 ms  |

### Serveur

- **Filtrage.** Le service campaign filtre avec `@vtt/vision` au lieu de `ST_Intersects`. Scène
  préparée gardée en mémoire par carte et par version (LRU). Sont filtrés :
  - les tokens `visible` et `hidden` ;
  - les objets (non décor) ;
  - la ligne de vue.
- **Événements ciblés.** `token.moved`, `token.updated` et `map_object.*` sont routés joueur par
  joueur (`gm_only` + `visibleToUsers`) :
  - ceux qui voient l'élément à l'arrivée reçoivent l'événement complet ;
  - ceux qui le voyaient au départ mais plus à l'arrivée reçoivent `*.hidden { id, mapId }`.
- **Pas de rafraîchissement pendant un glisser.** Quand un joueur déplace son token, les PNJ
  nouvellement visibles arrivent à la relecture qui suit le lâcher, environ 100 ms. Pendant le
  glisser, l'ombre suit en direct, calculée localement : les murs, pièces, zones et lumières
  allumées sont envoyés aux joueurs.

## 10. Modules

### Fond et scènes (moteur)

- **Fond.**
  - Image : png, jpeg, webp, avif, gif (première image seulement : pas d'animation). Vidéo :
    webm, mp4, muette, en boucle, `playsinline`.
  - Les médias sont servis avec les en-têtes CORS : WebGL refuse une image d'une autre origine
    sans `Access-Control-Allow-Origin`.
  - Envoi par URL présignée (`/media`, § 12).
  - La taille naturelle fixe la taille du monde ; le client du MJ envoie `width/height` au
    serveur s'ils manquent ou s'ils changent.
- **Scènes** (ex-CitiesManager) : liste, dossiers, créer, renommer, supprimer, fond, visible des
  joueurs, scène du groupe, `travel`, point d'apparition. Panneau MJ `components/map/scenes/`
  (touche E).
  - Le MJ affiche la scène du groupe ; « Ouvrir pour moi » en affiche une autre (`?scene=` dans
    l'adresse), sans déplacer personne.
  - Un joueur suit la carte où se trouve son personnage (celui qu'il incarne d'abord), sinon
    celle du groupe ; un `token.moved` de son personnage fait suivre la carte tout de suite.
  - Point d'apparition : outil `spawn` du module `scene`, sur la scène affichée.

### Dessins et textes (`drawings`)

- **Outil Dessin (P)**, formes au clavier 1 à 5 :
  - main levée : points bruts pendant le geste (1,5 px d'écran d'écart au moins), simplifiés au
    lâcher (Ramer-Douglas-Peucker, 0,8 px d'écran), lissés au rendu (Catmull-Rom) ;
  - ligne (⇧ : par pas de 15°) ;
  - rectangle et ellipse (⇧ : carré ou cercle ; remplissage facultatif) ;
  - gomme : les tracés touchés disparaissent pendant le geste, **une** commande au lâcher ;
    Échap les rend.
- **Outil Texte (T)** : un clic pose un texte (couche `notes`), édité en place par un champ DOM
  sur la carte (Entrée valide, ⇧ Entrée va à la ligne, Échap annule, cliquer ailleurs valide) ;
  double clic sur un texte (outil sélection, `EntityKind.doubleClick`) ou clic avec l'outil
  Texte : le modifier ; vidé, il est supprimé.
- **Réglages** (mémorisés dans le navigateur) : palette de couleurs (données, `palette.ts`),
  couleur personnalisée, épaisseur (pixels du monde), opacité, remplissage, taille et police des
  textes, et destination : **annotation** (défaut, au-dessus de l'ombre) ou **calque** (le calque
  actif, sinon « Sol », jamais un calque verrouillé).
- **Encodage** (compatible avec l'ancienne carte) :
  - l'opacité est dans la couleur (`#rrggbbaa`), le remplissage reprend la couleur à 35 % ;
  - `line` : `[a, b]` ; `rectangle` : `[coin, coin opposé]` ; `circle` avec `closed` : la boîte de
    l'ellipse ; `circle` sans `closed` (ancienne carte) : `[centre, point du cercle]`, converti à
    la première transformation ;
  - texte : `pos` est le début de la ligne de base de la première ligne ; interligne 1,25.
- **Direct** : le tracé en cours part dans `map.live.stroke` (points ajoutés depuis le dernier
  envoi ; une forme envoie son origine puis son extrémité), avec la couleur de l'auteur ; rien ne
  part pour un calque masqué aux joueurs. Au lâcher, `POST drawings` par une commande annulable ;
  chez les autres, le fantôme reste jusqu'à l'arrivée du dessin du même auteur parti du même
  point (3 s au plus). Un tracé abandonné (Échap) se termine par un dernier message
  `tool: 'eraser'` : le fantôme disparaît.
- **Entités** `drawing` et `note` : sélection, glisser, taille (points mis à l'échelle ; taille
  de police pour un texte), dupliquer, supprimer, ordre et calque, « Passer en annotation » ;
  auteur ou MJ (`authorOrGm`). Les annotations s'ordonnent entre elles (dessins et textes
  confondus). Toucher d'un tracé : distance au trait ≤ épaisseur / 2 + 6 px d'écran, ou
  intérieur d'une forme remplie. Un texte ne pivote pas : le contrat n'a pas de `rotation` pour
  `notes`.
- **Effacer mes dessins**, **Tout effacer** (MJ, confirmation) : une commande annulable (⌘Z les
  fait revenir), par `/batch`, plutôt que `DELETE …/drawings` qui ne se défait pas.

### Personnages et PNJ (`tokens`)

- **Rendu du token.**
  - Portrait rond ou carré, anneau à la couleur du camp (joueurs, alliés, ennemis).
  - Nom à taille constante.
  - Barre de la ressource principale : première ressource de la présentation du système,
    visible du MJ ; les joueurs la voient pour leurs personnages.
  - Anneau de sélection.
- **Bibliothèque MJ** (panneau). Onglets :
  - « Modèles de la campagne » : `npc-templates` et leurs catégories ;
  - « Bestiaire » du système ;
  - « Création rapide » : nom, image, type d'entité et valeurs clés, lus dans la présentation
    du système.
    Glisser vers la carte, ou clic puis clic sur la carte. Nombre d'exemplaires : placés en grille
    serrée autour du point, noms suffixés « Gobelin 2 ».
- **Instance.**
  - Un seul appel : `POST …/npcs` (§ 12). Chaque exemplaire est un vrai personnage : fiche
    complète copiée du modèle, possédé par le MJ, engagé dans la campagne (camp `enemies` par
    défaut), avec son token.
  - Supprimer le PNJ supprime aussi le personnage (confirmation). « Retirer de la carte » garde
    le personnage.
- **Inspecteur** : la fiche (`FichePersonnage`, droits habituels), la vision (rayon, bonus), la
  visibilité (visible, caché, allié, pour certains, invisible), la taille, la forme, l'image du
  token.
- **Joueurs** : ils déplacent leurs personnages, voient leur fiche et leur vision.

### Objets (`objects`)

- **Deux sortes d'entités**, choisies par le champ `kind` du contrat, sur la même couche :
  - `object` (`item`, `weapon`) : coffres, armes, butin ; masqués par la vision derrière les
    murs (§ 9) ;
  - `decor` : jamais filtrés par la vision, l'obscurité les couvre comme le fond. Le rendu de la
    visibilité le reconnaît à `entity.kind.id === 'decor'` ;
  - changer de sorte (menu « Sorte ▸ », inspecteur) garde la sélection et l'inspecteur.
- **Rendu** : un `Sprite` par objet, jamais recréé (retexturé si l'image change, retaillé si la
  taille change) ; texture chargée une fois par adresse et partagée (`ctx.texture`). Image en
  chargement : cadre discret ; illisible : cadre barré, pour tous. **Zone à fouiller** (objet
  sans image, posé sur un coffre peint dans le fond) : un cadre pour le MJ, rien pour les
  joueurs hors du repère de fouille. Repères à taille constante : cadenas (MJ, verrouillé), loupe
  (à fouiller, pour tous). Le masquage aux joueurs (hachures, œil barré) est celui du moteur.
- **Pose** : outil « Objets » (I, MJ). Sa bibliothèque s'affiche au-dessus de la barre : modèles
  d'objets de la campagne (`object-templates`, recherche, catégories, retirer), « Envoyer une
  image » (`/media`, gardée aussi comme modèle), « Zone à fouiller ».
  - Choisir un objet puis cliquer sur la carte (⇧ : en poser plusieurs, Alt : sans la grille,
    Échap : annuler), ou le glisser sur la carte ; une image de l'ordinateur déposée sur la
    carte est envoyée puis posée là.
  - Taille par défaut : une case sur le petit côté, l'autre selon les proportions de l'image
    (6 cases au plus). Aimanté comme un glisser, dans le calque actif ou « Objets », en haut de
    la pile. L'objet posé est sélectionné (poignées prêtes). « Poser un objet » s'annule.
  - Sans objet choisi, l'outil garde tous les gestes de la sélection.
- **Gestes** : tous les gestes communs (glisser, poignées de rotation et de taille, verrou,
  masquer, visible pour…, dupliquer avec le contenu, ordre et calque).
  - Menu du MJ : « Taille ▸ » (Agrandir × 1,25, Rétrécir × 0,8, Une case aux proportions de
    l'image), « Les joueurs peuvent fouiller », « Contenu et fouille… », « Sorte ▸ ».
  - Visibilité : `visible`, `hidden` (masqué), `custom` (« Visible pour… » : `visibleTo`).
    Masquer garde la liste : « Montrer » la rétablit. Direct : un objet masqué ou dans un
    calque masqué aux joueurs ne part qu'au MJ ; « pour certains », qu'à leurs joueurs.
- **Droits** : le MJ fait tout. Un joueur ne touche qu'un objet à fouiller (pour le fouiller) :
  les autres ne se sélectionnent pas, son clic passe au travers (il déplace la vue). Un
  spectateur regarde.
- **Inspecteur du MJ** : nom, sorte, image (remplacer, retirer), taille en unités, rotation,
  verrou, masqué, « Visible pour… » (personnages joueurs), notes du MJ ; section « Fouille » :
  activer, portée (unités), contenu (ajouter depuis le marché du système, référencé par `ref`,
  ou un objet libre ; quantité ; retirer). Sélection multiple : verrou, masqué, fouille, sorte,
  taille.
- **Fouiller**, activé par le MJ (`searchable`, `searchRadius` en unités).
  - Portée, au calcul près celle du serveur : distance du centre du token (`pos`) au rectangle
    de l'objet tourné autour de son centre, au plus `searchRadius × pixelsPerUnit`. Un objet à
    fouiller seul sélectionné montre cette zone (rectangle arrondi, tourné avec lui), au MJ comme
    au joueur.
  - Un joueur qui clique un objet à fouiller voit « Fouiller » au-dessus de lui (« Trop loin »,
    grisé, hors de portée) ; aussi dans son menu et son inspecteur. La fenêtre montre le contenu
    rendu par `…/search`, avec le personnage qui fouille (celui qu'il incarne s'il est à
    portée, sinon le plus proche ; un autre au choix) ; « Prendre » (une partie ou tout) passe
    par `…/take` et relit la fiche du personnage. Refus en clair : trop loin, déjà pris (le
    contenu est relu), service des personnages injoignable.
  - Le MJ est prévenu par un toast (`map_object.searched`, `map_object.looted`).

### Obstacles (`obstacles`), outils de pose

- **Mur.**
  - Chaîne clic à clic ; double clic, Entrée ou clic sur le premier point pour finir ; Échap
    annule le segment en cours.
  - ⇧ aligne à 15°.
  - Aimantation, dans l'ordre : extrémités existantes (10 px écran), point sur un segment
    existant (qui est alors scindé : jonction soudée), grille.
- **Rectangle de murs** : glisser, 4 murs soudés.
- **Porte.**
  - Clic sur un mur : insère une porte de largeur réglable (1 case par défaut) centrée sur le
    clic, en scindant le mur en mur, porte, mur. Ou tracer une porte libre.
  - Clic sur une porte (tous) : ouvrir ou fermer. Clic droit : verrouiller (MJ).
- **Fenêtre**, **mur à sens unique** : mêmes gestes que le mur. Menu : « Inverser le sens ».
- **Pièce.**
  - Polygone clic à clic ou rectangle glissé.
  - Option « Poser aussi les murs » : murs soudés sur le contour, en une commande.
  - Détection auto : « Créer une pièce » sur une boucle de murs fermée sélectionnée.
- **Édition** (outil obstacles, sélection).
  - Glisser un sommet : les sommets soudés bougent ensemble.
  - Double clic sur un segment : ajoute un sommet. Suppr : supprime le sommet ou le segment.
  - « Détacher » un sommet soudé (Alt + glisser).
  - Transparence (`opacity`) et couleur dans l'inspecteur.
- **Validation** : segments de moins de 2 px refusés, doublons fusionnés, soudure au pixel près,
  tout passe par `/batch`. Chaque geste est **une** commande annulable.
- **Rendu MJ** : murs épais, portes (icône ouverte ou fermée, cadenas), sens unique (flèche),
  fenêtres (tirets), pièces (contour pointillé et nom). Les poignées ne s'affichent qu'avec
  l'outil actif.

### Brouillard (`fog`) et lumières (`lights`)

- **Brouillard** :
  - outils cercle, rectangle et lasso à main levée ;
  - chacun en mode ajouter ou retirer (gomme de brouillard, Alt inverse) ;
  - « Tout couvrir » (`fogFull`), « Tout découvrir » ;
  - zones sélectionnables, déplaçables, supprimables comme toute entité.
- **Lumières** :
  - clic pour poser, poignée de rayon (en unités, affichée) ;
  - couleur, intensité, dégradé, allumée ou éteinte ;
  - attacher à un token (torche) : la lumière suit le token, aussi en direct.

### Vision (`vision`)

- Rendu du § 9 et sélecteur « Vue » du MJ.
- Branchement du serveur sur `@vtt/vision`, filtrage et événements ciblés (§ 9, Serveur).

## 11. Hors de ce lot, conservé

Les données et routes restent, et le lot suivant les rebranche sur le même modèle d'entité :

- portails et changement de scène par portail ;
- zones sonores (service audio) ;
- gabarits et mesures (règle, cône…) ;
- météo ;
- partage d'écran ;
- attaque et combat depuis la carte ;
- interactions marchand, jeu et butin ;
- entités de groupe.

Aucune fonctionnalité n'est supprimée.

## 12. Backend : changements de ce chantier

Tout en nouveaux changesets (jamais de changeset commité modifié), événements par l'outbox,
contrats dans `@vtt/contracts`, tests d'intégration, `docs/api-map.md` et `docs/map.md` à jour.

1. **Contrats** `packages/contracts/src/map.ts`.
   - Schémas Zod et types de tous les éléments de carte :
     - `MapScene`, `MapSettings` ;
     - `MapToken`, `MapObject`, `MapLight`, `MapObstacle`, `MapRoom`, `MapFogZone` ;
     - `MapDrawing`, `MapNote`, `MapMusicZone`, `MapPortal`, `MapMeasurement`.
   - Leurs entrées de création et de modification, `MapSnapshot` (chargement initial), les
     charges des événements, les messages `map.live` et `map.ping`.
   - Front et back les importent. Plus de doublon local.
2. **Brouillard en zones.**
   - Table `map_fog_zones` : `shape` (`circle | rect | polygon`), `geom` Polygon, `center` et
     `radius` pour un cercle, `mode` (`fog | clear`), `created_by`, et `seq` (identité) : l'ordre
     d'application ne dépend pas d'horloges ou d'identifiants égaux dans un lot (API : `order`).
   - Colonne `maps.fog_full`.
   - Les cases `map_fog.cells` sont converties en zones (union des cases ; un trou devient une
     zone du mode inverse ; avec `fullMap`, les cases étaient les cases découvertes : zones
     `clear`). `map_fog` reste en base, obsolète, jusqu'à une migration de nettoyage.
   - Couche `fog-zones` au contrat commun des couches ; les routes `/fog` disparaissent.
3. **Pièces** : table `map_rooms` (`geom` Polygon, `name`), couche `rooms`.
4. **Obstacles** : `blocks_from` (`left | right`), converti depuis `direction` (colonne gardée,
   obsolète, hors contrat). `opacity` à 1 par défaut, non nulle.
5. **Lumières** : `color`, `intensity` (0 à 1), `falloff` (0 à 1), `attached_token_id` (token de
   la même carte, clé étrangère composite ; la lumière est là où il est, `pos` ignorée).
6. **Objets.**
   - `searchable`, `search_radius` (l'ordre passe par `layer_id` et `z`, point 12).
   - `items` typés : `[{ id, name, quantity, imageUrl?, description?, ref?, legacy? }]`, où `ref`
     est une référence au catalogue du système ; `description` sert à l'objet libre donné au
     personnage, `legacy` garde les champs de l'ancien `LootItem`.
   - Portée : du centre du token au rectangle de l'objet tourné autour de son centre. Le MJ
     fouille et prend pour tout personnage engagé, sans condition. Pendant `take`, l'objet reste
     verrouillé le temps de l'appel à character : un refus ne change rien.
   - Routes :
     - `POST …/objects/:id/search { characterId }` : joueur à portée, objet vu ; évènement
       `map_object.searched`, MJ seul ;
     - `POST …/objects/:id/take { characterId, itemId, quantity? }` : retire de l'objet et donne
       au personnage, par une route interne de character ; évènement `map_object.looted`.
7. **PNJ en une fois**.
   - `POST /v1/campaigns/:id/maps/:mapId/npcs` avec le corps
     `{ source, count (1 à 20), pos, side?, visibility?, scale?, shape? }`, où `source` vaut
     `{ templateId } | { bestiary: { systemeId, key } } | { quick: { name, imageUrl?, type, valeurs? } }`.
   - character crée les personnages (route interne, propriétaire le MJ, PNJ, `templateId`
     gardé), campaign les engage et pose les tokens. En cas d'échec, compensation : rien ne
     reste à moitié créé.
   - `DELETE …/tokens/:tokenId?character=delete` supprime aussi l'instance (un PNJ seulement :
     422 `not_an_npc`) : campaign la retire d'abord de la campagne, puis character la supprime.
   - Engagement d'un PNJ posé : `campaign.character_added` en `gm_only`, pour qu'un PNJ caché ne
     se nomme pas aux joueurs.
   - `POST …/tokens/:tokenId/duplicate { pos, count }` clone l'état actuel.
8. **Médias** : `POST /v1/campaigns/:id/media { kind: 'image' | 'video', contentType, size }`
   rend une URL présignée (MJ). Images de 10 Mo au plus, vidéos webm ou mp4 de 100 Mo au plus.
   C'est une extension de `/image`, sans doublon : une seule signature (`signUpload`) pour
   `/image`, `/notes/upload` et `/media`.
9. **Mise à l'échelle** : `POST …/maps/:mapId/rescale { sx, sy }` (MJ) met toute la géométrie et
   les tailles à l'échelle, en une transaction.
10. **Realtime** :
    - `toUsers?: uuid[]` (50 au plus) sur `ephemeral` : relayé à ces utilisateurs abonnés, et aux
      MJ ;
    - `EPHEMERAL_RATE_PER_SECOND` passe à 30 et `EPHEMERAL_BURST` à 60.
11. **Visibilité serveur sur `@vtt/vision`** : fait par le module vision, après les lots 1 et 2
    (§ 9, Serveur).

12. **Calques du MJ** (§ 5, Calques).
    - Table `map_layers` : `name`, `sort_order` (réel), `visible_to_players`, `locked`, `opacity`,
      et `role` (`ground`, `objects`, `tokens`) : le calque par défaut d'une sorte se retrouve même
      renommé ; sans calque de ce rôle, le plus haut.
    - Calques par défaut, calque et `z` d'un élément inséré sans eux : déclencheurs de la base,
      pour tout écrivain (service, import).
    - Colonnes `layer_id` et `z` (double) sur `map_tokens` et `map_objects` (obligatoires après
      migration), sur `map_drawings` et `map_notes` (facultatives).
    - Migration : trois calques par carte existante, contenu réparti selon `is_background`.
    - Trois calques créés avec chaque nouvelle carte.
    - Routes :
      - `/maps/:mapId/layers` : CRUD et `batch` (réordonner). `DELETE` fait descendre le contenu
        dans le calque du dessous, ou `?moveTo=`.
      - `POST /maps/:mapId/arrange { items: [{ kind, id, layerId, z }] }` : réordonnancement d'une
        sélection, en une transaction.
    - Filtrage : le contenu d'un calque `visible_to_players = false` n'est jamais envoyé à un
      joueur (REST, bus, rejeu), sauf ses propres tokens.
    - `z_index` (ajouté un temps sur les objets) disparaît au profit de `layer_id` et `z`.
    - Événements `map_layer.created | updated | deleted | hidden`.
    - Renommage du réglage d'affichage `map.layers` en `map.display` dans le contrat, puisque le
      nouveau front n'en dépend pas encore.

## 13. Découpage du chantier

| Lot | Agent                           | Possède                                                                                                                                                   |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Moteur                          | `lib/map/{engine,store,live,api.ts,modules/index.ts}`, `components/map/*.tsx`, `components/map/{scenes,layers}/`, `table/map-stage.tsx`, page de la table |
| 1   | Vision (paquet)                 | `packages/vision/**`                                                                                                                                      |
| 1   | Backend                         | `packages/contracts/src/map.ts`, `backend/campaign/**` (carte), `backend/character/**` (instances de PNJ, don d'objet), `backend/realtime/**`, docs d'API |
| 2   | Dessins                         | `modules/drawings`, `components/map/drawings`                                                                                                             |
| 2   | Personnages                     | `modules/tokens`, `components/map/tokens`                                                                                                                 |
| 2   | Objets                          | `modules/objects`, `components/map/objects`                                                                                                               |
| 2   | Outils de visibilité            | `modules/{obstacles,fog,lights}`, `components/map/{obstacles,fog,lights}`                                                                                 |
| 2   | Rendu de la visibilité, serveur | `modules/vision`, `components/map/vision`, filtrage de campaign sur `@vtt/vision`                                                                         |
| 3   | Intégration                     | revue, typecheck, lint, tests, build, performances                                                                                                        |

Règles pour tous :

- On ne modifie que les fichiers de son lot.
- Un besoin hors de son lot (moteur, contrat) est une modification minimale et additive, ou
  une demande remontée dans le rapport.
- Commits en français, chemins explicites (`git commit -- <chemins>`), un commit par étape
  cohérente.
- Jamais `pnpm install` ni `pnpm add`, jamais `next dev`, jamais Playwright.
