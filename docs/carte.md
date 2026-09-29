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
    destroy-display.ts   destruction d'un sous-arbre Pixi (dessins propres libérés, partagés gardés)
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
    portals/             portails : même carte, autre scène, aller-retour, outil X, emprunter
    vision/              rendu de la visibilité (ombres, brouillard, lumières, masquage)
    weather/             météo de la scène (pluie, neige, brouillard…), plan `weather`, espace écran
frontend/src/components/map/
  table-map.tsx          la carte à la table : choix de la scène, montage dans MapStage
  use-table-map.ts       quelle scène afficher (joueur : celle de son personnage ; MJ : `?scene=`)
  map-canvas.tsx         monte le moteur (client seulement, `next/dynamic`) et ses surcouches
  engine-context.tsx     hooks React du moteur (sélecteurs à instantané stable)
  character-choice.tsx   choix de personnages « Visible pour… » (objets, tokens), depuis l'annuaire
  toolbar.tsx            barre d'outils (outils fournis par les modules)
  context-menu.tsx       menu contextuel commun (Radix), ancré au point de l'écran
  inspector.tsx          panneau d'inspection de la sélection (sections fournies par les modules)
  confirm-dialog.tsx     confirmations demandées par le moteur
  overlays.tsx           surcouches des modules (`registerOverlay`) : colonne de gauche, composants sans rendu
  layers/                panneau des calques du MJ (K)
  scenes/                panneau Scènes (E) : liste, dossiers, fond, groupe (ex-CitiesManager)
  <module>/              UI propre à un module (bibliothèque de PNJ, propriétés d'un objet…)
packages/vision/         géométrie de la visibilité (§ 9), sans DOM
```

Un module exporte un `MapModule` : `register(engine: MapEngine)` y enregistre ses `EntityKind`
(`registerKind`), ses `Tool` (`registerTool`), ses sections d'inspecteur
(`registerInspectorSection`), ses entrées de barre d'outils (`registerToolbarItem`), ses
surcouches React (`registerOverlay` : panneau de la colonne de gauche, ou composant sans rendu
qui relie des données React au module), ses entrées de menu (`registerMenuProvider`), ses
animations (`onFrame`), ses objets Pixi (`whenMounted`, `plane(id)`, `pixi`, `theme`) et ses
abonnements au store, et renvoie son nettoyage.
`modules/index.ts` les liste, une ligne par module, avec un exemple complet.

## 4. Coordonnées, caméra, échelle

- **Monde = pixels du fond.** Coordonnées du monde = pixels de l'image ou de la vidéo de fond,
  à sa taille naturelle (`maps.width/height`), comme le backend. Aucune coordonnée d'écran n'est
  stockée.
- **Unité de jeu.** Une case (unité `unitName`) mesure, en pixels du monde, la case de la grille
  de jeu de la scène si elle en a une, sinon `map_settings.pixelsPerUnit` (réglage de la
  campagne) : `scenePixelsPerUnit` (@vtt/contracts), même règle pour le client et le serveur.
  Ci-dessous, `pixelsPerUnit` désigne cette case de la scène.
- **Quadrillages** (`maps.grids`, quatre au plus par scène, menu « Quadrillage » du MJ).
  - Chacun est défini en pixels du monde : case (`size`), origine (`offsetX`, `offsetY`, par
    où passent une ligne verticale et une horizontale), couleur, opacité, épaisseur du trait
    (pixels d'écran, la même à tous les zooms), montré ou non aux joueurs. Il tombe donc au même
    endroit de l'image pour tous, quels que soient l'écran et le zoom.
  - La **grille de jeu** (une au plus) donne la case de la scène : taille des jetons, rayons en
    unités (lumières, fouille), aimantation, qui tombe sur ses lignes. Les autres sont décoratifs
    (grandes zones, repères).
  - Barre d'outils : un interrupteur « Afficher / Masquer le quadrillage » (tous, sur son écran
    seulement, gardé dans le navigateur, touche Q) et, à côté pour le MJ, les réglages.
  - « Ajuster sur l'image » : glisser sur 1 à 10 × 1 à 10 cases dessinées dans le fond ; la case
    et l'origine s'y alignent (une commande annulable).
  - Dessin (module `grid`, plan `grid` entre le fond et les calques) : seules les lignes dans la
    vue et dans la carte, redessinées quand la caméra ou les quadrillages changent ; sous 6 px
    à l'écran par case, le quadrillage s'efface. Le MJ voit à moitié ceux cachés aux joueurs.
  - Mise à l'échelle du fond (`rescale`) : case × √(sx·sy), origine × (sx, sy).
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
  | 5   | `weather`     | météo de la scène (§ 10, Météo), en pixels d'écran : sur le décor, les personnages et l'ombre, sous les annotations et les surcouches       |
  | 6   | `annotations` | dessins et textes hors calque (`layerId` nul) : annotations, jamais dans l'ombre                                                            |
  | 7   | `gm`          | surcouches MJ : murs, portes, pièces, contours de brouillard, lumières. Toujours au-dessus de l'ombre, quel que soit le réglage d'affichage |
  | 8   | `adornments`  | survol, sélection, poignées, étiquettes (taille constante)                                                                                  |
  | 9   | `live`        | fantômes des glissers des autres, tracés en cours, curseurs, pings                                                                          |
  | 10  | `tool`        | aperçu de l'outil actif                                                                                                                     |

- **Portes pour les joueurs.** Les icônes de porte sont dessinées dans `adornments` pour qu'un
  joueur puisse ouvrir une porte proche ; celles des portes hors de sa vue sont masquées (et ne
  s'ouvrent pas), § 9.
- **Affichage.** `map.display` (ex-`map.layers`, réglage MJ) masque des familles entières
  (lumières, obstacles, brouillard…), comme avant. Ce n'est pas la même chose que les calques.
- **Aucune allocation par image** dans les boucles chaudes (réutiliser les `Graphics`, tableaux
  typés), et **aucun `Graphics` recréé** si l'entité n'a pas changé.
- **Contexte WebGL perdu puis restauré** (GPU réinitialisé, fréquent sous Windows) : Pixi le
  restaure ; le moteur redemande une image et la vision refait toutes ses textures.
- **Destruction** : tout sous-arbre Pixi part par `destroyDisplay` (`engine/destroy-display.ts`).
  `destroy({ children: true })` seul ne libère pas la géométrie des `Graphics` enfants (Pixi 8) ;
  `destroyDisplay` détruit chaque nœud sans options : un contexte propre est libéré, un contexte
  partagé (icônes de porte, de lumière) et les textures (partagées par adresse, libérées à la
  destruction du rendu) sont gardés.

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
  - un seul menu contextuel « Disposition ▸ » : d'abord « Devant ou derrière, dans « Objets » »
    (Tout devant, Un cran devant, Un cran derrière, Tout derrière), puis « Calque (du plus haut
    au plus bas) » avec la liste des calques, coche sur l'actuel ;
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
- **Étages.** Un autre étage est une autre scène, reliée par un portail aller-retour (§ 10,
  Portails). Les calques servent aux superpositions d'une même scène.

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
- `actions(entity, ctx)` : les entrées propres au menu contextuel ;
- `editTool` (facultatif) : l'outil qui l'édite (murs et pièces : W, zones : G, lumières : L).
  Hors de cet outil, la sorte ne se touche pas (ni clic, ni lasso, ni menu) : un mur ne vole
  jamais le clic d'un token posé contre lui ;
- `click` (facultatif) : l'action d'un clic simple, pour tous, même hors de son outil (ouvrir ou
  fermer une porte, sur son icône) ; la sélection ne change pas ;
- `selfOutline` : la sorte dessine elle-même son survol et sa sélection (trait d'un mur, contour
  d'une zone) au lieu du rectangle commun ;
- `visionSamples` (facultatif) : des points du monde ; pour un joueur, le module vision ne montre
  l'entité (et elle ne se touche) que si l'un d'eux est dans sa vue (porte : son milieu, et un
  point de chaque côté).

Un outil peut aussi dire ce qu'il touche (`Tool.targets`) : l'outil obstacles ne touche que murs
et pièces, l'outil brouillard que les zones, l'outil lumières que les lumières.

Les actions **communes** sont générées à partir des capacités, avec les mêmes libellés et le
même ordre partout (`entities/common-actions.ts`) :

- Inspecter (une seule entité) ;
- Verrouiller et Déverrouiller ;
- Masquer aux joueurs et Montrer ;
- Visible pour… ;
- Pivoter ;
- Dupliquer ;
- Disposition ▸ : devant ou derrière dans son calque, puis le calque (§ 5, Calques) ;
- puis les actions propres à la sorte (une seule sorte sélectionnée) ;
- Supprimer, toujours en dernier.

Une sélection mixte (token, objet, dessin…) ne propose que les actions communes permises pour
toutes les entités.

### Gestes communs (`interaction/controller.ts`)

| Geste                                      | Effet                                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Survol                                     | contour et curseur (`grab`, `pointer`, `not-allowed` si verrouillé) ; nom en info-bulle après 400 ms                                                                                                                |
| Clic                                       | sélectionne (⇧ : ajoute ou retire) ; clic dans le vide : désélectionne                                                                                                                                              |
| Glisser (seuil de 4 px écran)              | déplace la sélection si `move` et `can` ; aperçu local, direct (§ 8), aimantation (réglage « Aimantation », Alt l'inverse) ; au lâcher : **une** commande pour toute la sélection ; Échap pendant le geste : annule |
| Glisser dans le vide (outil sélection)     | déplace la carte ; un glisser sur un élément qui ne bouge pas (verrouillé, mur, PNJ pour un joueur) aussi ; ⇧ + glisser : lasso, qui ajoute à la sélection                                                          |
| Double clic                                | inspecteur (fiche du PNJ, propriétés de l'objet…) ; un texte s'édite en place                                                                                                                                       |
| Clic droit ou appui long (500 ms, tactile) | menu contextuel : actions communes et actions de la sorte ; sélection multiple : actions communes à toutes                                                                                                          |
| Poignées (`transform-gizmo.ts`)            | rotation (⇧ : pas de 15°), taille par les coins (⇧ : garde les proportions) ; mêmes poignées pour objets, tokens et textes                                                                                          |
| Suppr / Retour arrière                     | supprime la sélection (confirmation pour une instance de PNJ)                                                                                                                                                       |
| Flèches                                    | déplacent d'une case (⇧ : de 5)                                                                                                                                                                                     |
| ⌘/Ctrl+Z, ⌘/Ctrl+⇧+Z                       | annuler, refaire (§ 7)                                                                                                                                                                                              |
| ⌘/Ctrl+D                                   | dupliquer                                                                                                                                                                                                           |
| R, ⇧R                                      | pivoter de 15°, dans un sens ou dans l'autre                                                                                                                                                                        |
| ⌘/Ctrl+↑↓, ⇧, ⌥                            | ordre dans le calque, premier plan / arrière-plan, changement de calque (§ 5, Calques)                                                                                                                              |
| Échap                                      | annule le geste, puis l'outil, puis la sélection                                                                                                                                                                    |

Règles de ces gestes :

- **Aimantation** (bouton de la barre, préférence de chacun gardée dans le navigateur) :
  **libre par défaut** (posé exactement sous le pointeur), ou grille d'une case, d'une demi-case
  ou d'un quart de case. Alt inverse le réglage le temps du geste. Elle vaut pour tous les gestes
  (glisser, poser un jeton, un objet, une lumière, tracer un mur ou une zone). Les extrémités et
  segments des murs existants s'aimantent toujours, pour les souder. Les flèches du clavier
  avancent toujours d'une case.
- **Barre de la sélection** (MJ) : au clic, les actions de l'élément apparaissent au-dessus de
  lui (mêmes entrées que le clic droit). Un joueur n'en a pas au clic, il clique sans cesse son
  token pour le déplacer : seules les actions marquées pour lui (`forPlayers`, « Fouiller »)
  s'y montrent, le reste est au clic droit.
- **Éléments superposés** : un clic (sans ⇧ ni Alt) sur plusieurs éléments presque confondus
  (taille comparable, boîtes recouvertes à 60 % au moins de la plus petite ; un token sur un
  grand tapis n'est pas concerné) ouvre un menu « Lequel voulez-vous prendre ? » avec image et
  nom ; survoler une ligne surligne l'élément. Le choix le sélectionne ; les autres de la pile
  sont mis de côté (à 30 %, intouchables) tant qu'il reste sélectionné. Si l'un d'eux est déjà
  sélectionné, il est pris sans menu.
- **Verrouillé** : un élément verrouillé se sélectionne et s'inspecte, mais ne bouge pas.
- **Élément masqué aux joueurs** : le MJ le voit sous un voile blanc, à 50 %, avec un badge « œil
  barré » de taille constante à l'écran (`engine/visibility-badge.ts`, commun à toutes les sortes).
- **Clavier** : les raccourcis de la carte ne sont actifs que si la carte a le focus, et jamais
  pendant la saisie. Une lettre est celle que la touche tape (`shortcutCode`, `lib/keyboard.ts`,
  comme les panneaux de la table) : en AZERTY, la touche A pose des personnages et ⌘/Ctrl+Z
  annule. Les chiffres comptent par leur position (sans ⇧ en AZERTY), pavé numérique compris.
- **Lettres réservées** : la carte prend V, P, T, W, G, L, I, A, X (outils), R (pivoter) et K
  (calques, MJ) et Q (quadrillage). F, D, C, N, J, H, S, B, M, O, E (Scènes, MJ) et U (Mes
  PNJ, MJ) appartiennent aux panneaux de la table. Encore libres : Y, Z et les chiffres (pris
  par l'outil actif quand il en a l'usage : nombre d'exemplaires d'une pose de PNJ, sous-modes
  des outils W et G).

### Outils (`tools/`)

- **Un seul outil actif.** Sélection par défaut (V). L'outil reçoit
  `down / move / up / key / cancel` en coordonnées du monde et dessine son aperçu dans `tool`.
- **Machine à états explicite** (`idle → armed → dragging → …`), testée sans rendu.
- **Échap** revient toujours à un état sûr, sans écriture partielle.
- **Barre d'outils** (MJ, et joueurs pour le dessin et les textes) :

  | Touche | Outil       | Module      | Qui                     |
  | ------ | ----------- | ----------- | ----------------------- |
  | V      | sélection   | moteur      | tous                    |
  | P      | dessin      | `drawings`  | MJ et joueurs           |
  | T      | texte       | `drawings`  | MJ et joueurs           |
  | I      | objets      | `objects`   | MJ                      |
  | A      | personnages | `tokens`    | MJ                      |
  | X      | portails    | `portals`   | MJ                      |
  | W      | obstacles   | `obstacles` | MJ                      |
  | G      | brouillard  | `fog`       | MJ                      |
  | L      | lumières    | `lights`    | MJ                      |
  | K      | calques     | moteur      | MJ (panneau, pas outil) |

  Dans cet ordre dans la barre : sélection, outils de pose, puis outils de visibilité. Chaque
  bouton a son info-bulle (nom et touche) ; un spectateur n'a que la sélection.

  La barre d'outils porte aussi « Vue » (MJ / vue d'un joueur, § 9), « Calques » (panneau des
  calques du MJ, K) et « Affichage » (familles affichées, `map.display`).

- **Chiffres** (rangée du haut ou pavé numérique), pris par l'outil actif quand il en a l'usage :
  dessin (P) 1 Main levée, 2 Ligne, 3 Rectangle, 4 Ellipse, 5 Gomme ; personnages (A), une carte
  armée : nombre d'exemplaires, 1 à 9, 0 pour 10 ; obstacles (W) 1 Mur, 2 Rectangle de murs,
  3 Porte, 4 Fenêtre, 5 Sens unique, 6 Pièce, 7 Édition ; brouillard (G) 1 Rectangle, 2 Cercle,
  3 Main levée, 4 Sélection. La barre contextuelle les montre avec leur touche et un rappel des
  gestes.
- **Échap**, dans chaque outil : d'abord le geste en cours (rien n'est écrit ; seuls les segments
  de mur déjà posés restent), puis ce que l'outil tient (objet ou PNJ armé, chaîne de murs),
  puis le menu et l'inspecteur, puis retour à la sélection, enfin la sélection vidée. Un panneau
  de la table ouvert se ferme avant.

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
  - Voyage (`travel`) : le token d'arrivée n'a pas l'identifiant de celui de départ ; sur la
    carte quittée, `token.moved` retire tous les tokens du personnage (un personnage n'est
    présent que sur une carte), sans fantôme chez le MJ.
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
    stroke?: { id: string; tool; color; width; fill?; points: number[] /* delta depuis le dernier envoi */ };
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
| Observateur                      | chaque token d'un joueur (ses personnages, sauf `invisible`, et les `ally` hors calque masqué), `visionRadius` en pixels tel qu'enregistré : « Vision augmentée » (`visionBoost`) le triple à l'activation, le serveur l'enregistre déjà multiplié                        |

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
- **Token `hidden`** : vu seulement dans un rayon de vision ou une zone éclairée : même formule,
  toute la carte sous le brouillard (`fogFull`, sans zone).
- **Sans observateur sur la carte** (spectateur, personnage sur une autre scène, carte du monde
  sans token) : vue « d'en haut » = hors brouillard et hors pièces fermées, plus les zones
  éclairées ; aucune ombre de mur. Sans cette règle, une carte sans token serait noire.
- **Occlusion coupée** : le réglage d'affichage `obstacles: false` du MJ rend murs et pièces
  sans effet, comme l'ancienne carte. Les réglages `fog` et `lights` ne cachent que le dessin
  (brume, lueurs), jamais la règle.
- **Une seule écriture des règles** : `packages/vision` pour la géométrie ; conversion et règles
  des entités dans `backend/campaign/src/modules/maps/vision-rules.ts`, dont
  `frontend/src/lib/map/modules/vision/rules.ts` est la copie exacte (un test compare les deux
  fichiers et rejoue les mêmes cas des deux côtés).
- **Personnages joueurs** : toujours vus. Hors de ma vue, ils sont dans le plan `allies` à 60 %
  (moteur : `setPlaneOverride`), comme les alliés, mes propres tokens et les `custom` qui me
  visent.
- **Vue du MJ.**
  - Par défaut, tout est visible. L'ombre des joueurs est montrée en voile léger (25 %) pour
    qu'il sache ce qu'ils voient, sans rien lui cacher.
  - « Vue de … » (sélecteur de joueur) : rendu exact de ce joueur, et entités non vues masquées.
- **`shadowOpacity`** (réglage MJ) : opacité de l'obscurité hors de vue (1 = noir).
- **Rayons de vision** (menu « Vue », préférence locale, montrés par défaut) : un liseré doux,
  clair et estompé vers l'intérieur, au bord du rayon de vision de chaque observateur : les siens
  pour un joueur, ceux du joueur montré en « Vue de… », tous ceux des joueurs pour le MJ. Au-dessus
  de l'ombre, il suit les tokens pendant le glisser.

### Rendu (module `vision`)

- **État à blanc** (`vision-state.ts`, testé sans WebGL) : à chaque image où quelque chose a pu
  changer, il compare ses entrées et ne refait que le nécessaire :
  - `prepareScene` quand murs, portes, pièces, zones, `fogFull`, taille ou occlusion changent
    (couches du magasin comparées par référence) ;
  - `withLights` quand une lumière change ou qu'une torche suit son token (positions en direct) ;
  - une vue par observateur (`viewerView`), gardée tant qu'il ne bouge pas : un glisser ne refait
    que la sienne ; Vu(joueur) est l'union de ces vues, sans recalcul.
    Positions affichées : aperçu d'un glisser local, direct interpolé des autres.
- **Textures** à l'échelle de l'écran, refaites seulement quand un de leurs termes change
  (caméra, zones, lumières, observateurs) :
  - `range` (¼ de la résolution, floutée de 3 px) : la portée hors observateur, hors brouillard
    (zones dans l'ordre : `fog` en `ERASE`, `clear` en blanc) ∪ zones éclairées ;
  - `fog` (¼, floutée de 10 px) : le brouillard lui-même, où dessiner la brume ;
  - `glow` (¼) : lueurs additives (couleur, intensité, dégradé `falloff`), un éventail par
    lumière coupé par sa ligne de vue ;
  - `vis` (½) : Vu = ⋃ observateurs, chacun sous masques stencil (sa ligne de vue en éventail
    exact depuis son origine, sa pièce de confinement, moins les pièces fermées qui ne le
    contiennent pas), avec dedans `range` ∪ son disque de vision (bord doux sur 12 % du rayon),
    en mélange `max`. Le flou ne touche que `range` et `fog`, avant le découpage par les murs :
    le bord de la vue suit les murs, aucun mur soudé n'est percé.
- **Ombres partielles** : derrière un mur translucide, la même portée atténuée de son opacité,
  masquée par le polygone d'ombre et toujours dans la ligne de vue. Deux murs translucides
  l'un derrière l'autre : l'ombre la plus claire des deux (pas le produit), écart assumé.
- **Composition** : un seul quadrilatère (le rectangle visible de la carte, rien hors de la
  carte) et un shader, en alpha prémultiplié : obscurité `shadowOpacity × (1 − vu)`, brume
  (bruit fractal ancré au monde, période de 3 cases, octaves plus fines que 3 pixels effacées,
  dérive lente à 20 i/s, désactivable : « Animer la brume » dans « Vue », préférence locale,
  éteinte par défaut avec « mouvement réduit ») là où il y a du brouillard et pas de vue,
  lueurs × vu. Une seule passe obscurcit et éclaire.
- **MJ** : tout visible, l'ombre des joueurs (union de leurs observateurs) en voile à 25 %,
  brume à 25 %, lueurs presque entières ; « Vue de … » (sélecteur « Vue », emplacement `view`
  de la barre d'outils) : rendu exact de ce joueur, entités non vues masquées. Les surcouches
  MJ (plan `gm`) restent au-dessus.
- **Masquage des entités** : PNJ et objets (hors `decor`) non vus : masque `vision` du moteur,
  avec un fondu de 150 ms quand une entité déjà affichée apparaît ou disparaît ; une entité qui
  arrive non vue est masquée avant sa première image. Pour un joueur, les sortes à points
  d'échantillon (`EntityKind.visionSamples`) aussi : une icône de porte n'est montrée, et ne
  s'ouvre, que si le milieu de la porte, ou un point à 2 px de part et d'autre, est dans sa vue.
  En « Vue de… », les portes restent aux surcouches du MJ, comme les murs.
- **Audience du direct** (`setLiveAudienceResolver`) : token ou objet vu de tous les joueurs →
  public, de certains → `toUsers`, de personne → MJ seul, à sa position affichée, avec la vue de
  chaque joueur (gardée : un PNJ glissé ne refait aucune vue).
- **Mesures** (`vision-drag.bench.ts`, Apple Silicon, Node 24 ; donjon de 2 600 × 2 600 px,
  1 252 murs et portes, 30 pièces, 63 tokens, 40 objets, 10 lumières dont une torche sur le
  héros, 10 zones) :

  | Par image de glisser (CPU)                                  | Budget | Mesuré              |
  | ----------------------------------------------------------- | ------ | ------------------- |
  | joueur : son héros bouge, vue refaite, 103 entités décidées | < 4 ms | 1,5 ms (p99 1,8 ms) |
  | MJ : un PNJ glissé, audience pour 4 joueurs                 | —      | 0,02 ms             |

  En développement, `window.__vttVision.summary()` donne les durées de chaque étape dans le
  navigateur (`prepare`, `views`, `masking`, `sync`, `render` : rendu dans les textures,
  `frame` : tout le module), et un résumé part dans la console toutes les 5 s.

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

- **Filtrage** (`backend/campaign/src/modules/maps/vision.ts`, règles : `vision-rules.ts`) sur
  `@vtt/vision`, plus de `ST_Intersects` : tokens `visible` et `hidden`, objets (non décor),
  calques masqués, `GET …/line-of-sight`. Le chargement garde le filtre `bbox` sur les index
  GiST. La scène préparée est gardée en mémoire par carte (LRU de 64) sous une empreinte relue
  à chaque appel (version de la carte, condensé des `(id, version)` des obstacles, pièces et
  zones) : toute écriture, d'où qu'elle vienne, la refait ; une scène lue dans une transaction
  d'écriture sert sans être gardée. Lumières, tokens, calques masqués et échelle sont relus à
  chaque appel.
- **Contenu des objets** : un joueur ne reçoit jamais `items` (REST, bus, rejeu) ; seule la
  fouille le donne (`POST …/objects/:id/search`, objet vu et à portée).
- **Événements ciblés.** `token.created | updated | moved | deleted` et `map_object.*` sont routés
  joueur par joueur (`gm_only` + `visibleToUsers`, `public` si tous le voient), la vue de chaque
  membre non MJ étant calculée avant et après l'écriture :
  - ceux qui voient l'élément après reçoivent l'événement complet (un objet sans son contenu :
    le contenu part aux MJ seuls, dans un événement de même version) ;
  - ceux qui le voyaient avant mais plus après reçoivent `*.hidden { id, mapId }` ; le client du
    MJ ignore les `*.hidden`.
- **Relire quand la vue change** : `map.visibility_changed { mapId }`, ciblé : un mur, une porte,
  une pièce, une zone ou une lumière change (champs utiles à la vue), `fogFull`, la taille ou
  l'occlusion de la carte changent (tous les joueurs) ; un observateur bouge ou change de rayon
  (ses joueurs ; tous pour un allié ou une torche). Au plus un par joueur, par carte et par
  transaction ; le client relit tokens et objets, regroupés en une relecture par 100 ms.
- **Pas de rafraîchissement pendant un glisser.** Quand un joueur déplace son token, les PNJ
  nouvellement visibles arrivent à la relecture qui suit le lâcher, environ 100 ms. Pendant le
  glisser, l'ombre suit en direct, calculée localement : les murs, pièces, zones et lumières
  allumées sont envoyés aux joueurs ; les PNJ qu'il voyait et ne voit plus s'effacent tout de
  suite (masquage local).
- **Tests de non-fuite** (`vision.int.test.ts`) : aucun PNJ derrière un mur, dans une pièce
  fermée, dans le brouillard hors de portée ou dans un calque masqué n'est reçu par un joueur,
  ni en REST ni par événement ; porte ouverte : il l'est ; `items` jamais envoyé.

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
  - **Point d'arrivée des joueurs** (`scene.spawn`, module `scene`) : pour le MJ, un élément
    comme les autres (sorte `spawn`, couche synthétique tirée de la scène) : drapeau
    « Arrivée des joueurs », glisser pour le déplacer, Suppr pour l'enlever, ⌘Z ; sous tout
    le reste, un token posé dessus reste prioritaire au clic. Clic droit dans le vide :
    « Arrivée des joueurs ici ». Invisible des joueurs. Un personnage qui arrive sur une
    carte sans point d'arrivée ni position mémorisée arrive au centre de la carte.
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
- **Polices des textes** : une vingtaine, par groupes (lisibles, fantastique, manuscrites,
  affiches, science-fiction, machine, horreur), auto-hébergées par `next/font`
  (`app/map-fonts.ts`, `preload: false` : rien n'est téléchargé tant qu'un texte ne s'en sert
  pas), et en tête celles du système de la campagne (`theme.polices.fichiers` de sa
  présentation, déclarées au navigateur par `lib/system-fonts.ts`). Un canevas ne charge pas
  seul une police CSS : chaque police utilisée est chargée (`ensureFontLoaded`), et à son
  arrivée les textes se remesurent et se redessinent (`onFontsLoaded`, `refreshCollection`).
  La valeur enregistrée reste une pile CSS stable (`var(--font-map-<id>)`, `"Orbitron"`).
- **Réglages** (mémorisés dans le navigateur) : palette de couleurs (données, `palette.ts`),
  couleur personnalisée, épaisseur (pixels du monde), opacité, remplissage, taille et police des
  textes, et destination : **annotation** (défaut, au-dessus de l'ombre) ou **calque** (le calque
  actif, sinon « Sol », jamais un calque verrouillé).
- **Encodage** (compatible avec l'ancienne carte) :
  - l'opacité est dans la couleur (`#rrggbbaa`), le remplissage reprend la couleur à 35 % ;
  - `line` : `[a, b]` ; `rectangle` : `[coin, coin opposé]` ; `circle` avec `closed` : la boîte de
    l'ellipse ; `circle` sans `closed` (ancienne carte) : `[centre, point du cercle]`, converti à
    la première transformation ;
  - texte : `pos` est le début de la ligne de base de la première ligne, `rotation` (degrés)
    tourne autour de lui ; interligne 1,25.
- **Direct** : le tracé en cours part dans `map.live.stroke` (points ajoutés depuis le dernier
  envoi ; une forme envoie son origine puis son extrémité), avec la couleur de l'auteur et le
  remplissage d'une forme remplie ; rien ne part pour un calque masqué aux joueurs. Au lâcher, `POST drawings` par une commande annulable ;
  chez les autres, le fantôme reste jusqu'à l'arrivée du dessin du même auteur parti du même
  point (3 s au plus). Un tracé abandonné (Échap) se termine par un dernier message
  `tool: 'eraser'` : le fantôme disparaît.
- **Entités** `drawing` et `note` : sélection, glisser, taille (points mis à l'échelle ; taille
  de police pour un texte), dupliquer, supprimer, ordre et calque, « Passer en annotation » ;
  auteur ou MJ (`authorOrGm`). Les annotations s'ordonnent entre elles (dessins et textes
  confondus). Toucher d'un tracé : distance au trait ≤ épaisseur / 2 + 6 px d'écran, ou
  intérieur d'une forme remplie. Un texte pivote (poignée, R, « Pivoter ») : `rotation` en
  degrés autour de `pos`, le champ d'édition en place tourne avec lui.
- **Effacer mes dessins**, **Tout effacer** (MJ, confirmation) : une commande annulable (⌘Z les
  fait revenir), par `/batch`, plutôt que `DELETE …/drawings` qui ne se défait pas.

### Personnages et PNJ (`tokens`)

- **Rendu du token** (sorte `token`, plan `content`, calque par défaut « Personnages »).
  - Portrait rond ou carré : un `Graphics` rempli par la texture (cadrage « couvrir »), sans
    masque, donc regroupé avec les autres tokens en un appel de dessin ; texture chargée une fois
    par URL et partagée ; silhouette en attendant ou sans image (CORS, vidéo).
  - Anneau à la couleur du camp, prise dans le thème : joueurs `primary`, alliés `success`,
    ennemis `destructive`.
  - Sous le token, à taille constante : la jauge de la ressource principale, puis le nom
    (`BitmapText`, police installée une fois).
  - Ressource principale : lue comme le bandeau de la fiche (premier bloc « ressources » de la
    présentation, sinon première ressource du type d'entité), couleur de la présentation. Le MJ
    la voit partout ; un joueur, sur ses personnages.
  - Anneau de survol et de sélection dessiné par la sorte (`selfOutline`). MJ (`selfHiddenMark`) :
    « caché » et « invisible » ont un voile blanc sur le portrait (plus marqué pour invisible)
    et un œil barré (fond neutre, inversé pour invisible) ; « pour certains joueurs », un œil
    ouvert doré. Badge en haut à droite, taille constante à l'écran. Pas d'info-bulle du nom au
    survol (`showsName`) : il est déjà sous le token.
  - Chaque partie n'est redessinée que si ce qui la décrit a changé.
- **Annuaire.** Le token ne porte que `characterId` ; nom, portrait, camp, nature et
  ressource viennent de React (surcouche sans rendu `TokenCharacterFeed`) : liste de la
  campagne (filtrée par le serveur : un joueur n'y voit que les PNJ dont un token lui est
  visible) et fiches calculées par `@vtt/rules` (MJ : tous les personnages posés ; joueur : les
  siens). Un personnage modifié redessine ses seuls tokens. Un token dont le personnage manque
  à la liste la fait relire.
- **Des modèles, puis des instances.** Un PNJ se crée comme modèle, puis se pose autant de
  fois qu'il le faut ; le modèle reste. Les modèles vivent dans le panneau **« Mes PNJ »**
  (MJ, U, `components/table/onglets/pnj.tsx`), comme l'ancien gestionnaire de PNJ :
  recherche, catégories (ajouter, renommer, supprimer : leurs modèles restent), créer,
  modifier (nom, catégorie, image, valeurs clés : `PATCH … { valeurs }`, seules les valeurs
  changées partent), dupliquer (état complet), ranger, supprimer (les PNJ posés restent).
  Formulaire commun `components/personnages/npc-form.tsx`.
- **Bibliothèque MJ** : l'outil « Personnages » (A) l'ouvre dans la colonne de gauche ; sans
  carte choisie, l'outil garde les gestes de la sélection. Onglets :
  - « Modèles » : `npc-templates` et leurs catégories ;
  - « Bestiaire » du système ;
  - « Nouveau » : le formulaire des modèles (nom, catégorie, image, type d'entité, valeurs
    clés) crée un modèle dans « Mes PNJ » (`POST npc-templates { systemeId, type, valeurs }`),
    puis le choisit pour la pose. Les valeurs clés sont les attributs des statistiques du
    bestiaire déclarées pour ce type (sinon les blocs de sa fiche) que l'on peut saisir ; les
    valeurs calculées (défense, maximums) suivent les règles.
  - Recherche, filtre par catégorie. Glisser une carte vers la scène (point de dépôt converti
    par la caméra), ou clic puis clic sur la carte (⇧ : en poser d'autres, Échap : annuler).
    Nombre d'exemplaires (1 à 20, chiffres du clavier), camp (ennemis, alliés), visibilité à la
    pose. Placés en grille serrée autour du point (même calcul que le serveur), le premier au
    centre d'une case, noms suffixés « Gobelin 2 ». Ils vont dans le calque actif s'il y en a
    un (`CreateMapNpcs.layerId`), sinon dans « Personnages », fantômes compris.
- **Instance.**
  - Un seul appel : `POST …/npcs` (§ 12). Chaque exemplaire est un vrai personnage : fiche
    complète copiée du modèle, possédé par le MJ, engagé dans la campagne (camp `enemies` par
    défaut), avec son token. Des fantômes (brouillons optimistes) s'affichent pendant l'appel ;
    échec : ils disparaissent, message du serveur. Annuler la pose supprime ces PNJ avec leur
    personnage ; refaire les recrée.
  - « Supprimer » (Suppr) sur un PNJ : confirmation, puis `?character=delete` : le token et
    la fiche de jeu de cette instance (PV, état) disparaissent, le modèle reste dans « Mes
    PNJ » ; hors de la pile d'annulation (`EntityKind.remove`). Sur un personnage joueur : il
    est retiré de la carte (annulable). « Retirer de la carte » n'existe que pour les
    personnages joueurs : un PNJ sans token serait une fiche perdue.
  - « Dupliquer » (⌘D) : `…/duplicate` (fiche comprise) ; annuler supprime la copie avec son
    personnage. Un personnage joueur ne se duplique pas.
- **Menu**, après les actions communes : Fiche, Visibilité ▸ (visible, caché, allié, pour
  certains joueurs ▸ personnages à cocher, invisible), Vision ▸ (vision augmentée, rayon en
  cases de la carte), Retirer de la carte (personnages joueurs). Les actions communes « Masquer aux joueurs » et
  « Visible pour… » ne s'affichent pas : Visibilité ▸ les remplace.
- **Inspecteur** : « Personnage » (portrait, camp, ressource, « Ouvrir la fiche » :
  `FichePersonnage` dans un panneau de la colonne de gauche, droits habituels) et « Token »
  (visibilité, et pour « pour certains joueurs » le même choix de personnages que les objets,
  `character-choice.tsx` ; rayon de vision, vision augmentée, taille, forme, image du token).
  Chaque réglage est une commande annulable pour toute la sélection.
- **Joueurs** : ils déplacent leurs personnages (`/tokens/move`), ouvrent leur fiche et
  activent leur vision augmentée ; direct du glisser par le moteur.
- **Direct** : audience publique pour un personnage joueur et un PNJ `visible` ou `ally`,
  `gmOnly` pour `hidden` et `invisible`, `toUsers` (propriétaires et incarnateurs) pour
  `custom` ; le module vision affine l'audience d'un PNJ derrière un mur.

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
  (à fouiller, pour tous). Le masquage aux joueurs (voile blanc, œil barré) est celui du moteur.
- **Pose** : outil « Objets » (I, MJ). Sa bibliothèque est un panneau déplaçable à gauche
  (comme celle des personnages), en deux onglets :
  - **objets du système** : les catégories que la présentation du système déclare
    (`references.objets` : titre et dossiers de l'index des actifs `/asset-mappings.json`),
    1 311 objets pour dnd-classic et nooblies (mobilier, campement, ferme, marché, conteneurs…),
    200 pour star-wars-eote, les listes de l'ancienne app ; aucune liste en dur dans le code ;
  - **modèles de la campagne** (`object-templates`, retirer au survol).
    Recherche (nom et catégorie), catégories en pastilles, grille qui se charge par pages de 60
    en défilant. « Envoyer une image » (`/media`, gardée aussi comme modèle), « Zone à fouiller ».
  - Choisir un objet puis cliquer sur la carte (⇧ : en poser plusieurs, Alt : aimantation inversée,
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
  verrou, masqué, « Visible pour… » (personnages joueurs, `character-choice.tsx`), notes du MJ ;
  section « Fouille » :
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
  - Le MJ est prévenu par un toast (`map_object.searched`, `map_object.looted`). « Fouiller »,
    la fenêtre et ces avis sont une surcouche sans emplacement (`registerOverlay`,
    `objects-host.tsx`).

### Obstacles (`obstacles`), outils de pose

Modèle : un mur est une **ligne brisée** (`points`), fermée quand son dernier point répète le
premier (rectangle de murs, chaîne finie sur son premier point). Deux sommets sont **soudés**
quand leurs coordonnées sont identiques (arrondies au centième de pixel des deux côtés) : c'est
la donnée elle-même, et non une tolérance, qui garantit qu'aucune vue ne fuit.

- **Outil W** (MJ). Murs et pièces ne se touchent qu'avec lui (`editTool`) ; ses poignées (un
  point plein par jonction soudée, un rond creux par bout libre) ne s'affichent qu'avec lui.
- **Mur** (1).
  - Chaîne clic à clic (glisser : un segment) ; double clic, Entrée ou clic sur le premier point
    pour finir. Retour arrière retire le dernier point.
  - Échap abandonne le segment en cours et pose les segments déjà posés (rien n'est perdu ;
    ⌘/Ctrl+Z les retire). Une chaîne d'un seul point n'écrit rien.
  - ⇧ aligne à 15° depuis le point précédent (seul un sommet existant l'emporte).
  - Aimantation, dans l'ordre : sommets existants des murs et des pièces (10 px écran), point sur
    un segment de mur (qui est alors scindé : jonction soudée), grille si l'aimantation est active (Alt l'inverse). Le
    retour visuel dit lequel : anneau (sommet), losange et segment surligné (segment), croix
    (grille). La longueur du segment en cours s'affiche en cases.
- **Rectangle de murs** (2) : glisser, une ligne fermée de 4 murs soudés (⇧ : carré).
- **Porte** (3).
  - Survol d'un mur : la porte qui serait posée s'affiche. Clic : porte de largeur réglable
    (1 case par défaut, barre contextuelle) centrée sur le clic, le mur scindé en mur, porte,
    mur, en une commande. Un segment plus court que la porte devient la porte ; un bout de mur
    de moins de 2 px n'est pas gardé.
  - Ailleurs : porte libre en deux clics.
  - Icône de porte (tous, taille constante) : un clic ouvre ou ferme, hors de la pile
    d'annulation ; porte verrouillée : un joueur est refusé (toast). Clic droit (MJ) :
    « Verrouiller la porte ». Un joueur ne voit que les icônes des portes dans sa vue (§ 9).
- **Fenêtre** (4), **mur à sens unique** (5) : mêmes gestes que le mur. La flèche, au milieu de
  chaque segment, montre le sens où l'on voit. Menu : « Inverser le sens ».
- **Pièce** (6).
  - Rectangle glissé, ou polygone clic à clic (premier point, double clic ou Entrée pour finir).
  - « Poser aussi les murs » (activé par défaut) : murs soudés sur le contour, et aux murs
    existants, en une commande.
  - « Créer une pièce » sur une boucle de murs fermée sélectionnée (les bouts pendants sont
    ignorés ; plusieurs boucles : refusé). « Poser les murs du contour » sur une pièce.
- **Édition** (7).
  - Glisser un sommet : les sommets soudés (murs et pièces) bougent ensemble ; Alt + glisser le
    détache. Glisser un mur : il se déplace et ses voisins soudés s'étirent (Alt : il s'en
    détache). Flèches : une case (⇧ : cinq), voisins étirés.
  - Clic sur un sommet ou un segment : le sélectionne ; Suppr le supprime (le mur se scinde ou
    s'ouvre). Double clic sur un segment : ajoute un sommet.
  - Lasso : murs et pièces dont un segment touche le rectangle.
  - Inspecteur : type, ouverte, verrouillée, sens, couleur (donnée), opacité (`opacity`).
  - Menu : Convertir en ▸, « Remplacer par un mur » (porte, fenêtre ou sens unique, fondu avec
    les murs qu'il prolonge), « Sélectionner les murs reliés ». Barre : « Tout effacer ».
- **Validation** : segments de moins de 2 px refusés (fondus), murs dégénérés supprimés,
  doublons fusionnés (un segment qui existe déjà n'est pas recréé), sommets posés sur un mur
  insérés dans ce mur et sommets existants sur un mur neuf insérés dans celui-ci (soudure dans
  les deux sens). Chaque geste est **une** commande annulable, envoyée en **un** `/batch` par
  couche : un mur scindé pour une porte ne reste jamais à moitié écrit.
- **Rendu MJ** (plan `gm`) : murs épais (liseré sombre, trait clair ou à leur couleur, intensité
  selon `opacity`), fenêtres en tirets, portes (trait plein fermées, tirets ouvertes), sens
  unique (flèches), pièces (contour pointillé, nom au centre). Survol et sélection : halo sous
  le trait. Portes : plan `adornments`, icône vue du MJ, et des joueurs qui voient la porte.

### Brouillard (`fog`) et lumières (`lights`)

- **Brouillard** (outil G, MJ ; zones touchables seulement avec lui) :
  - formes : 1 Rectangle (aimantation commune), 2 Cercle (depuis le centre ; ⇧ :
    rayon en cases entières), 3 Main levée (tracé simplifié par Ramer-Douglas-Peucker à 1,5 px
    d'écran), 4 Sélection (gestes communs : clic, glisser, poignées de taille, lasso, Suppr) ;
  - mode ajouter ou retirer (gomme de brouillard) dans la barre ; Alt inverse le temps du
    geste ; un clic sans glisser sélectionne la zone touchée ;
  - « Tout couvrir » (`fogFull` vrai) et « Tout découvrir » (faux) : les zones posées
    disparaissent, en une commande annulable (elles reviennent dans leur ordre) ;
  - chaque zone est une commande ; `order` et `createdBy` viennent du serveur (le brouillon est
    posé au-dessus des autres). Une création n'envoie que les champs de sa forme ;
  - dessin MJ : contour et voile pour `fog`, hachures et contour en tirets pour `clear`. Le
    brouillard vu des joueurs est rendu par le module vision.
- **Lumières** (outil L, MJ ; lumières touchables seulement avec lui) :
  - clic pour poser (centre de la case si l'aimantation est active, comme le glisser ; Alt l'inverse), la lumière posée est
    sélectionnée ; réglages des lumières posées dans la barre (rayon, couleur, intensité,
    dégradé) ;
  - poignée de rayon sur le cercle de la lumière sélectionnée : rayon en unités, par demi-case
    (Alt : libre), valeur affichée ; une commande au lâcher, Échap : rien ;
  - inspecteur et menu : nom, allumée ou éteinte, rayon, couleur (donnée), intensité, dégradé ;
  - « Attacher à un token » (torche) : la lumière est là où est le token, à chaque image, aperçu
    du glisser et direct compris ; attachée, elle ne se déplace pas seule ; « Détacher » la
    laisse à la dernière place du token. Le module vision lit `lightPosition(engine, light)`
    (`modules/lights`) : une seule règle ;
  - éteinte : le serveur ne l'envoie pas aux joueurs, son direct reste chez le MJ ;
  - dessin MJ : icône teintée de sa couleur (taille constante), cercle du rayon, tirets à la
    limite du plein éclairage (`falloff`) ; éteinte : cercle gris en tirets.

### Vision (`vision`)

- Rendu du § 9 (`modules/vision/renderer.ts`), état testable à blanc (`vision-state.ts`),
  masquage et plan `allies`, audience du direct, sélecteur « Vue » (MJ : vue du MJ ou
  « Vue de … » ; tous : « Animer la brume »), `components/map/vision/view-menu.tsx`.
- Branchement du serveur sur `@vtt/vision`, filtrage et événements ciblés (§ 9, Serveur).

### Météo (`weather`)

Refonte de la météo de l'ancienne carte (`WeatherCanvas`, `WeatherPicker`) : un canevas 2D
plein écran redessiné à 60 i/s tant qu'une météo était choisie, sans plafond sous Windows ni
pause en arrière-plan. Ici, le même rendu que le reste de la carte (Pixi, rendu à la demande),
plafonné, et arrêté dès qu'il ne sert à rien.

- **Données** : état durable de la scène, le même pour tous. `maps.weather`, contrat
  `MapWeather` :
  - `type` : l'effet (tableau ci-dessous) ; `null` : aucune. Un type inconnu (données
    anciennes) est gardé tel quel et n'affiche rien ;
  - `intensity` : 0 à 2 (le contrat accepte jusqu'à 10, compris comme 2 au-delà). 1 garde son
    sens, l'ancien maximum, au milieu du curseur ; de 1 à 2, l'effet se renforce (voir
    « Intensité ») ;
  - `wind` (facultatif, ajout rétrocompatible) : `{ direction, strength }`. `direction` : où
    va le vent, en degrés (0 vers l'est, 90 vers le sud, sens horaire à l'écran) ; `strength` :
    0 à 1. Absent : le vent propre à l'effet (la pluie penche un peu vers l'est comme avant, le
    sable file vers l'est) ;
  - écriture : `PATCH /maps/:mapId { weather }` par une commande annulable
    (`engine.updateScene`), diffusée à tous par `map.updated`. Même effet, même intensité, même
    vent chez chacun ; seules les particules, tirées au hasard, diffèrent d'un écran à l'autre.
- **Effets** (données, `modules/weather/effects.ts`) :

  | Type        | Nom                | Contenu                                                                                       |
  | ----------- | ------------------ | --------------------------------------------------------------------------------------------- |
  | `rain`      | Pluie              | traînées bleutées penchées par le vent, ronds d'éclaboussure au sol, voile froid léger        |
  | `storm`     | Orage              | pluie plus dense et plus rapide, ciel assombri, éclairs doux                                  |
  | `snow`      | Neige              | flocons sur deux profondeurs (petits et lents, gros et plus rapides) qui se balancent         |
  | `blizzard`  | Blizzard           | flocons et traînées fouettés par le vent, rafales de bruit blanc, voile blanc                 |
  | `fog`       | Brouillard         | deux nappes de bruit qui dérivent à des vitesses différentes et respirent, voile gris         |
  | `leaves`    | Feuilles au vent   | feuilles d'automne (trois formes, quatre teintes) qui tournoient et se retournent             |
  | `embers`    | Cendres et braises | cendres grises qui tombent, braises qui montent en scintillant (fusion additive), voile chaud |
  | `sandstorm` | Tempête de sable   | grains en traînées, deux rafales de bruit ocre, voile ocre qui respire                        |
  | `alert`     | Alerte rouge       | vignette rouge sur les bords, qui pulse lentement                                             |
  | `static`    | Parasites          | grain de télévision, trames qui défilent, bandes de brouillage                                |

  `alert` et `static` venaient du bundle Star Wars de l'ancienne app. Ils sont offerts à toutes
  les campagnes, rangés à part (« Science-fiction ») dans le choix : aucune clé de système en dur.

- **Plan `weather`** (§ 5), au-dessus de `vision` et `allies`, sous `annotations`, `gm` et les
  surcouches : la météo tombe sur le décor, sur les personnages et dans l'obscurité ; les
  annotations, les surcouches du MJ, la sélection et les curseurs restent nets.
- **Espace écran, ancré à la carte au déplacement.**
  - Tout est dessiné en pixels d'écran (le conteneur du module annule la caméra) : même taille
    de goutte et même densité à tous les zooms, nombre de particules proportionnel à la surface
    de la vue. En espace monde, un zoom arrière sur une grande carte ferait des milliers de
    gouttes minuscules, un zoom avant des flocons géants, et le budget dépendrait de la carte.
  - Collée à l'écran, une météo « flotte » quand on déplace la carte. Au déplacement (zoom
    inchangé), particules et nappes suivent donc la carte du même écart, et ce qui sort par un
    bord revient par l'autre (tore). Au zoom, elles restent : une couche d'air entre la caméra
    et le sol.
- **Composition**, 8 appels de dessin au plus :
  - voile : un sprite blanc teinté, plein écran ;
  - nappes : 1 ou 2 `TilingSprite` d'un bruit fractal périodique (256 × 256, calculé une
    fois), agrandis 3 à 6 fois, qui dérivent avec le vent ;
  - émetteurs : un `ParticleContainer` par émetteur (2 au plus par effet). Les particules sont
    les objets de la simulation eux-mêmes (compatibles `IParticle`, aucune copie), tous sur un
    **atlas unique** (traînée, point doux, flocon, trois feuilles, anneau) dessiné une fois au
    montage sur un canevas 2D. Seules les propriétés animées remontent au GPU à chaque image
    (`dynamicProperties` : la position ; rotation, couleur ou taille selon l'émetteur) ;
  - vignette, éclair, grain, trames, bandes : sprites et `TilingSprite` sur des textures faites
    une fois ;
  - ni filtre, ni mode de fusion avancé, ni second contexte WebGL.
- **Intensité** (`densityFactor`, `overdrive`, testés). Jusqu'à 1, les plages de chaque effet
  (densité × intensité, opacités entre leurs deux bornes). De 1 à 2, un renfort propre à
  l'effet (`strong`), linéaire, sans palier : 2,3 à 2,4 fois plus de particules, et pour la
  pluie, l'orage, le blizzard et le sable des particules 1,3 fois plus rapides et 1,35 fois plus
  opaques (voile et nappes compris) ; éclairs deux fois plus fréquents ; brouillard, alerte et
  parasites plus opaques. Les opacités restent bornées à 1, l'éclair à 0,28.
- **Budget** (`particleBudget`, testé) : densité de l'émetteur (particules par million de
  pixels CSS, à intensité 1) × surface de la vue × part de l'intensité ; le total est ramené
  proportionnellement sous le plafond : **1 400 par million de pixels et 3 000 en tout**,
  **700 par million et 1 200 en tout sous Windows**. Le nombre reste proportionnel à la surface
  de la vue ; seuls les très grands écrans touchent le plafond total. Animation coupée ou
  « mouvement réduit » : 35 % des particules, à 60 % de leur opacité, immobiles.
- **Cadence et arrêt** (`WeatherDriver`, testé sans WebGL) :
  - la simulation avance à chaque image rendue (à 60 i/s pendant un glisser, puisque l'image
    est rendue de toute façon) ; la météo ne demande elle-même une image que 33 ms après la
    précédente : **30 i/s au plus**. Pas de temps borné à 0,1 s (retour sur l'onglet) ;
  - **arrêt complet** (plan caché, ni minuteur, ni simulation, particules rendues) : aucune
    météo, type inconnu, intensité nulle ;
  - **pause** (aucun minuteur) : onglet en arrière-plan (`visibilitychange`), vue de taille
    nulle, animation coupée ou « mouvement réduit » : une image fixe et discrète, qui suit encore
    la carte au déplacement ;
  - **aucune allocation par image** : tableaux et particules sont créés au changement de réglage
    ou de taille de la vue ; le rappel du minuteur est créé une fois.
- **Pas de clignotement brutal.** Éclair : un voile bleu-blanc qui monte en 90 ms jusqu'à 0,28
  d'opacité au plus et s'éteint en 0,7 s, parfois doublé 0,2 s plus tard, toutes les 4 à 12 s
  (deux fois plus souvent à l'intensité 2) ;
  l'alerte pulse en 2,2 s ; les bandes des parasites sautent toutes les 120 ms à faible
  opacité. Préférence « Éclairs et clignotements » coupée : ni éclair ni bande, alerte fixe,
  grain plus lent.
- **Préférences locales** (confort de chacun, `localStorage`) : « Animer la météo » et
  « Éclairs et clignotements », éteintes par défaut avec « mouvement réduit ».
- **Réglage du MJ** : bouton « Météo » (emplacement `view` de la barre, icône de la météo en
  cours, allumé quand il y en a une), popover `components/map/weather/weather-menu.tsx` :
  - vignettes des effets (icône et nom), « Aucune » en tête, « Science-fiction » à part ; choisir
    un effet garde l'intensité en cours (le milieu du curseur depuis « Aucune ») ;
  - intensité : curseur de 5 à 100 %, où 50 % est l'intensité 1 et 100 % l'intensité 2 ; aperçu
    local pendant le geste, une commande au lâcher (comme le quadrillage) ;
  - vent, pour les effets qui en ont l'usage : rose des vents à 8 directions (le centre : sans
    vent) et force ; « Vent de l'effet » revient au vent par défaut ;
  - chaque changement est une commande annulable (« Météo », ⌘Z) ;
  - en bas, les préférences locales.
- **Joueurs** : le bouton n'apparaît que quand la scène a une météo : son nom, son intensité et
  les préférences locales.
- **Mesures** : en développement, `window.__vttWeather.summary()` (étapes `step` : simulation,
  `draw` : objets Pixi, `frame` : tout le module ; nombre de particules) et un résumé dans la
  console toutes les 5 s. `weather.bench.ts` mesure la part CPU à blanc (Apple Silicon,
  Node 24), simulation et ancrage d'une image :

  | Cas (intensité 2)                     | Particules | Moyenne | p99     |
  | ------------------------------------- | ---------- | ------- | ------- |
  | orage, 1920 × 1080                    | 2 766      | 0,11 ms | 0,23 ms |
  | orage, 3840 × 2160 (plafond total)    | 2 999      | 0,13 ms | 0,37 ms |
  | orage, Windows, 1920 × 1080           | 1 199      | 0,06 ms | 0,26 ms |
  | blizzard, 1920 × 1080                 | 2 885      | 0,15 ms | 0,49 ms |
  | changement d'effet (une fois)         | —          | 1,7 ms  | 5,4 ms  |
  | bruit des nappes, 256 × 256 (montage) | —          | 5,5 ms  | —       |

### Portails (`portals`)

Refonte des portails de l'ancienne carte (`PortalConfigDialog`, `PortalsLayer`, bouton
« Entrer → » du joueur) : téléportation sur la même carte et changement de scène, en éléments
comme les autres, et le serveur décide qui passe et où.

- **Modèle** (`MapPortal`, couche `portals`) : un portail est **une entrée**.
  - `pos` (centre), `radius` (pixels du monde, montré en cases), `name`, `icon` (`stairs`
    escalier, `door` porte, `portal` portail, `ladder` échelle), `color` (donnée), `visible`
    (des joueurs) ;
  - destination : `same_map` (arrivée `target` sur la carte, `targetMapId` nul) ou
    `scene_change` (`targetMapId` ; `target` : point de cette scène, nul pour son point
    d'arrivée des joueurs, sinon son centre) ;
  - `auto` : franchi dès qu'un joueur y lâche son token, sans question ;
  - `linkedPortalId` : son **retour** (aller-retour).
- **Aller-retour** : deux portails reliés, sur la même carte ou sur deux scènes (escalier du
  rez-de-chaussée et de la cave). Le lien est symétrique et tenu par le serveur, dans la même
  transaction : l'arrivée de l'un est toujours la place de l'autre (déplacer l'un déplace
  l'arrivée de l'autre ; déplacer l'arrivée d'un portail relié déplace son retour) ; changer la
  scène visée délie ; supprimer l'un délie l'autre, qui reste à sens unique. Les paires de
  l'ancienne app (portails jumeaux « same-map ») sont reliées par la migration.
- **Sorte `portal`** (plan `gm`, outil X ; hors de lui, touchée en dernier recours comme une
  lumière : un token posé sur un portail reste prioritaire au clic) :
  - rendu : zone en dégradé radial de sa couleur et anneau ; icône à taille constante (disque
    de sa couleur, liseré clair, glyphe blanc de l'escalier, de la porte, du portail ou de
    l'échelle) ; petits badges « aller-retour » et « automatique » ; nom en étiquette sous
    l'icône. Masqué aux joueurs : anneau en tirets, œil barré (MJ). Sélectionné : son arrivée
    sur la carte (repère d'arrivée relié par des tirets fléchés), ou son retour ;
  - gestes communs : sélection, glisser (outil X), Suppr, ⌘Z, ⌘D, menu, barre, inspecteur,
    « Masquer aux joueurs » et « Montrer » (`visible`) ;
  - chaque partie n'est redessinée que si ce qui la décrit change ; icônes en `GraphicsContext`
    partagés, teintés ; traits redessinés au palier de zoom (`OverlayRedraw`) ;
  - pour un joueur : montré (et touché) seulement si son centre ou un point de sa zone est dans
    sa vue (`visionSamples`), comme une icône de porte.
- **Outil Portails (X, MJ)**, machine à états (testée sans rendu) :

  | État          | Entrée                                                      | Sortie                                                        |
  | ------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
  | `idle`        | poignée de rayon → `radius` ; poignée d'arrivée → `arrival` | portail : gestes communs (`select`) ; vide → `pressing`       |
  | `pressing`    | +4 px : gestes communs (la vue se déplace ; ⇧ : lasso)      | lâcher : entrée posée (brouillon) → `destination`             |
  | `destination` | clic sur la carte : arrivée ici ; panneau : une autre scène | le portail (et son retour) en **une** commande ; Échap : rien |
  | `pick`        | « Choisir l'arrivée sur la carte » (inspecteur)             | clic : arrivée du portail (commande) ; Échap : rien           |
  | `radius`      | rayon par demi-case (Alt : libre), valeur affichée          | lâcher : une commande ; Échap : rien                          |
  | `arrival`     | glisser l'arrivée d'un portail interne non relié (aimantée) | lâcher : une commande ; Échap : rien                          |
  - En `destination`, un panneau « Destination » (colonne de gauche) : « Cliquez sur la carte
    pour une arrivée sur cette scène », ou la liste des autres scènes (dossiers, vignette,
    cachée aux joueurs) ; une scène choisie, son arrivée : son point d'arrivée des joueurs (par
    défaut) ou un point choisi sur l'aperçu de son fond ; puis « Poser le portail ». La ligne
    entrée → pointeur est tracée pendant le choix.
  - Barre contextuelle (réglages des portails posés, gardés dans le navigateur) : icône,
    couleur, rayon, « Aller-retour » (activé par défaut : le retour est posé à l'arrivée, relié,
    avec les mêmes réglages), « Automatique », « Visible des joueurs ».
  - Nom par défaut : celui de l'icône (« Escalier »), **jamais celui de la scène visée** : une
    scène cachée ne se nomme pas par ses portails.
  - ⌘Z retire le portail et son retour (même sur l'autre scène).

- **Inspecteur (MJ)** : nom, icône, couleur, rayon (cases), visible, automatique ;
  destination : « Sur cette carte » (« Choisir l'arrivée sur la carte ») ou une autre scène
  (liste ; arrivée de la scène ou point choisi sur l'aperçu) ; retour : « Relié à … »
  (sélectionner s'il est sur la carte, délier), sinon « Poser le retour ».
- **Menus.**
  - Portail (MJ) : « Faire passer tout le groupe », « Faire passer la zone (n) » (les tokens
    dans sa zone), « Aller à l'arrivée » (caméra) ou « Aller au retour » (caméra, retour
    sélectionné) ou « Ouvrir « <scène> » », « Poser le retour » ou « Délier le retour »,
    « Automatique ». Aucune n'est l'action principale de la barre : faire passer le groupe par
    mégarde doit rester impossible d'un clic.
  - Token ou sélection de tokens (MJ) : « Emprunter un portail ▸ » (portails de la carte).
  - Joueur : « Emprunter » (barre de la sélection, `forPlayers`) sur un portail où se trouve un
    de ses tokens, « Trop loin » grisé sinon ; sur son token dans un portail, au clic droit.
- **Emprunter** (`POST …/portals/:id/use`, § 12) :
  - un joueur qui **lâche** son token (glisser, flèches) dans un portail visible où il n'était
    pas se voit proposer « Emprunter : <nom> » au-dessus du portail (×, Échap ou sortir de la
    zone : la proposition disparaît) ; portail automatique : franchi aussitôt. Arriver dans un
    portail ne le déclenche pas : pas d'aller-retour sans fin ;
  - interne : le token va à l'arrivée ; autre scène : le personnage y voyage (`travel`) et la
    vue du joueur suit la scène (`token.moved` de son personnage) ;
  - arrivée : autour du point d'arrivée, une case d'écart, sans empiler (`spreadAround`, comme
    le groupe qui voyage) ;
  - MJ : « Faire passer tout le groupe » — interne : les personnages joueurs présents sur la
    carte ; autre scène : tout le groupe, et la scène devient celle du groupe (comme « Faire
    venir ») ;
  - direct : les `token.moved` du serveur (les autres voient le token partir et arriver) ; le
    MJ est prévenu par un toast (`map_portal.used`, MJ seul) : « Aria a emprunté
    « Escalier » ». Un joueur ne reçoit pas le nom de la scène avant d'y arriver.
- **Droits** (serveur, miroir côté client pour les menus) :
  - un joueur n'emprunte un portail visible qu'avec ses personnages, dont le token est sur la
    carte **dans la zone** (centre du token à `radius` au plus du centre du portail) ; le
    portail lui ouvre la scène visée, même cachée aux joueurs (`/travel` reste limité aux
    scènes qu'il voit) ;
  - le MJ fait passer tout personnage engagé présent sur la carte, sans condition de zone ;
  - un joueur ne reçoit ni `target`, ni `targetMapId`, ni `linkedPortalId` (nuls pour lui, en
    REST comme sur le bus) : il ne sait où mène un portail qu'en l'empruntant.

## 11. Hors de ce lot, conservé

Les données et routes restent, et le lot suivant les rebranche sur le même modèle d'entité :

- zones sonores (service audio) ;
- gabarits et mesures (règle, cône…) ;
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
     `{ source, count (1 à 20), pos, side?, visibility?, scale?, shape?, layerId? }`, où `source` vaut
     `{ templateId } | { bestiary: { systemeId, key } } | { quick: { name, imageUrl?, type, valeurs? } }`.
   - character crée les personnages (route interne, propriétaire le MJ, PNJ, `templateId`
     gardé), campaign les engage et pose les tokens. En cas d'échec, compensation : rien ne
     reste à moitié créé.
   - `DELETE …/tokens/:tokenId?character=delete` supprime aussi l'instance (un PNJ seulement :
     422 `not_an_npc`) : campaign la retire d'abord de la campagne, puis character la supprime.
   - Engagement d'un PNJ (posé, ou par `POST /characters` hors du camp des joueurs) :
     `campaign.character_added` en `gm_only`, pour qu'un PNJ caché ne se nomme pas aux joueurs.
     Le détail de la campagne (`GET /v1/campaigns/:id`) ne donne à un joueur que les
     engagements de sa liste des personnages. Un personnage retiré de la campagne quitte les
     cartes avec un `token.deleted` adressé comme à la carte (`deleteToken`).
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
11. **Visibilité serveur sur `@vtt/vision`** : fait (§ 9, Serveur) ; `map.visibility_changed`
    ajouté au contrat ; `items` jamais envoyé à un joueur.

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
13. **Intégration** (lot 3).
    - Textes : `rotation` (degrés, autour de `pos`) sur `map_notes` (changeset
      `0019-map-note-rotation.sql`), au contrat et dans le service.
    - `map.live.stroke.fill` : le remplissage d'une forme en cours.
    - `CreateMapNpcs.layerId` : les PNJ posés vont dans le calque choisi (422 `unknown_layer`
      avant toute création).
    - Non-fuite : détail de la campagne filtré pour les joueurs comme la liste des personnages
      (`characters/visibility.ts`), `campaign.character_added` d'un PNJ en `gm_only`, et
      `token.deleted` d'un personnage retiré adressé par la vision (`deleteToken`, partagé avec
      la carte).
14. **Portails** (§ 10, Portails ; changeset `0022-map-portals-use.sql`).
    - Colonnes `auto` (faux par défaut) et `linked_portal_id` (portail de la même campagne,
      clé étrangère composite, `ON DELETE SET NULL`) sur `map_portals` ; les paires jumelles de
      l'ancienne app (même carte, arrivées croisées) sont reliées par la migration.
    - Lien tenu par le service (`portals.ts`), dans la transaction de l'écriture : relier
      (`linkedPortalId`) aligne la destination des deux portails ; déplacer l'un déplace
      l'arrivée de l'autre ; déplacer l'arrivée d'un portail relié déplace son retour ; changer
      la scène visée délie ; supprimer délie le retour. Un `map_portal.updated` par portail
      touché, même sur une autre carte.
    - `POST …/portals/:itemId/use { characterIds } | { party: true }` : le serveur vérifie les
      droits (§ 10, Portails), déplace (`/tokens/move`) ou fait voyager (`travel`) et rend
      `{ mapId, items }` ; événement `map_portal.used`, MJ seul.
    - Non-fuite : `target`, `targetMapId` et `linkedPortalId` nuls pour un joueur (liste,
      chargement initial, `…/at`, événements : l'événement complet part aux MJ, l'autre, de même
      version, aux joueurs).

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
