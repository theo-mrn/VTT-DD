# Carte : brouillard d'exploration (mémoire de ce qui a été vu)

Conception du chantier « exploration », complément de [carte.md](carte.md) § 9 (Visibilité), qui
renvoie ici. Tout agent qui touche à l'exploration lit d'abord carte.md § 9, puis ce document.
Une décision qui s'en écarte est d'abord écrite ici.

## 1. Ce que veut la table

- Aujourd'hui, un joueur ne voit que ce que ses personnages voient **en ce moment** : quand ils
  s'éloignent, tout redevient noir. La landing promet pourtant « la carte se dévoile au fil de
  l'exploration ».
- Ce qui a déjà été vu reste montré, **grisé** : le fond et ce qui est fixe (décors, dessins et
  textes rangés dans les calques, murs tracés). Ce qui bouge ou se cache (PNJ, objets hors
  décor, icônes de porte) n'y apparaît pas tant que ce n'est pas vu en direct.
- La mémoire est **par scène** et **partagée par le groupe** (§ 8, D1). Elle est enregistrée et
  survit au rechargement.
- Le MJ active ou coupe l'exploration par scène, la réinitialise, révèle ou oublie une zone, et
  voit ce que le groupe a exploré (voile léger dans sa vue, rendu exact en « Vue de … »).
- Aucune régression : 60 i/s en déplacement, rien qui fuite chez un joueur, une représentation
  compacte côté serveur, des mises à jour mutualisées.

## 2. Ce qui compte comme « exploré »

```
Explorée(scène) = ⋃ dans le temps de Vu(O), pour chaque observateur O du groupe
Groupe          = ⋃ des observateurs de chaque joueur non MJ (ses personnages, les alliés)
Montré grisé    = Explorée − Vu(joueur)       (Vu(joueur) reste montré en clair, § 9)
```

- `Vu(O)` est exactement celui de carte.md § 9 (ligne de vue, pièces fermées, brouillard,
  lumières) : un seul algorithme, `@vtt/vision`, pour le rendu, le filtrage et la mémoire.
- **Seuls les observateurs explorent.** La « vue d'en haut » (joueur sans observateur sur la
  carte) n'explore rien : sinon une carte sans token serait explorée d'office.
- Une zone éclairée vue depuis un observateur est explorée (elle est dans `Vu(O)`) ; une lumière
  seule, sans observateur qui la voit, n'explore rien.
- **Traînée** : pendant un glisser, la vue suit le token ; la mémoire aussi. Au lâcher, le
  client envoie les points du chemin (§ 5.3) et le serveur explore depuis chacun. Sans eux, un
  couloir traversé d'un seul glisser serait oublié (le serveur ne reçoit que la position finale)
  ; une droite entre départ et arrivée traverserait les murs d'un couloir coudé.
- Le **réglage d'affichage** `obstacles: false` du MJ coupe l'occlusion pour l'exploration
  comme pour la vue (même scène préparée).

## 3. Représentation : un masque raster par scène

### Grille

- La carte (`width × height`, pixels du monde) est découpée en `cols × rows` cases d'exploration,
  à peu près carrées : **un quart de case de jeu** (`scenePixelsPerUnit / 4`), au plus **512** par
  côté (au-delà, les cases grandissent). Donjon de 2 600 px à 100 px la case : 104 × 104.
- Une case est explorée si son **centre** est vu. Le bord de la mémoire suit donc la vue au
  quart de case près ; il déborde au plus d'une demi-case d'exploration (≈ 1/8 de case de jeu)
  au-delà d'un mur, sous le trait sombre des murs tracés pour les joueurs (1/10 de case).
- La grille est fixée à la création du masque et **normalisée sur la carte** : une mise à
  l'échelle (`rescale`) ne la touche pas (chaque case garde la même part de la carte), un
  quadrillage recalibré non plus. « Réinitialiser » refait la grille avec la taille et la case
  du moment.

### Masque

- `Uint8Array` d'une valeur par case (0, 1) en mémoire, rangée par lignes ; en base, **bits
  tassés** (`bytea`, 8 cases par octet) : 1,4 Kio pour 104 × 104, 32 Kio au plus (512 × 512).
- Sur le réseau, **fenêtre codée en plages** (RLE) : un rectangle `{ x, y, w, h }` de cases et
  `data`, la suite des longueurs de plages alternées (0 d'abord, longueur nulle permise) en
  entiers variables LEB128, en base64. Une zone explorée est une tache : quelques plages par
  ligne. Le masque entier d'un donjon exploré à moitié tient en quelques centaines d'octets.
- Pourquoi pas des polygones simplifiés : l'union d'aires de vue successives demande des
  opérations booléennes de polygones (exclues au § 9 : fragiles, coûteuses, sans borne de
  taille), et ce qui est stocké grossirait à chaque pas. Le masque a une taille bornée, une union
  en O(cases touchées), un rendu direct (une texture) et un codage compact (§ 7, mesures).

### Code (`@vtt/vision`, `exploration.ts`, pur, partagé)

```ts
explorationGrid(width, height, pixelsPerUnit): { cols, rows }
class ExplorationMask { cols; rows; cells: Uint8Array; count(); clone(); … }
markView(mask, view, bounds, opts?): CellWindow | null     // cases neuves vues, fenêtre touchée
viewRegion(prep, terms): rectangle du monde où Vu(O) peut tomber (borne du balayage)
rasterizeShape(grid, bounds, shape): fenêtre des cases dont le centre est dans la forme
applyWindow(mask, window, op: 'reveal' | 'forget' | 'set'): CellWindow | null
encodeWindow(mask, rect) / decodeWindow(window): codage RLE
packBits / unpackBits : stockage
```

- **Balayage borné** : pour chaque observateur, seules les cases du rectangle où sa vue peut
  tomber sont examinées (boîte de sa ligne de vue ∩ sa pièce de confinement ∩ (son disque ∪
  hors brouillard ∪ aires éclairées)). Une case déjà explorée est sautée sans test : en régime
  établi, une mise à jour ne coûte presque rien.

## 4. Serveur (service campaign)

### Données (changeset `0031-map-exploration.sql`)

- `maps.exploration` : `off | party`, `party` par défaut pour une scène neuve, `off` pour les
  scènes existantes (aucun changement pour les parties en cours). Au contrat `MapScene`
  (`MapExplorationMode`), modifiable par `PATCH /maps/:mapId` (commande annulable du MJ).
- `map_explorations` : `(map_id, scope)` clé, `campaign_id`, `cols`, `rows`, `cells bytea`,
  `version`, `updated_at`. `scope` vaut `party` (un seul masque, partagé ; la colonne laisse
  la place à un masque par joueur sans migration, § 8, D1). Supprimé avec la carte.
- `map_exploration_queue` : `map_id` clé, `campaign_id`, `queued_at`. Une ligne par scène à
  explorer, insérée dans la transaction de l'écriture : elle n'existe qu'au `COMMIT`.

### Déclencheurs, file et travailleur (mises à jour mutualisées)

- Tout ce qui change la vue des joueurs passe déjà par `notifyVisibilityChanged` (§ 9,
  Serveur) : un observateur bouge ou change de rayon, une porte, un mur, une pièce, une zone,
  une lumière, `fogFull`, la taille, l'occlusion, un calque. Elle ajoute la scène à la file
  (`INSERT … ON CONFLICT DO UPDATE`, une fois par transaction et par scène, seulement si
  l'exploration y est active). Activer l'exploration d'une scène l'y ajoute aussi.
- **Travailleur** (`exploration-worker.ts`, dans le processus du service) : réveillé 40 ms
  après une mise en file (et 250 ms, au cas où la transaction n'a pas fini), et toutes les 2 s
  pour ne rien perdre. Il prend une scène (`DELETE … FOR UPDATE SKIP LOCKED RETURNING` : un seul
  réplica la traite, sans bloquer les écritures), calcule et enregistre, puis passe à la
  suivante. Un échec la remet en file.
- Ainsi, dix murs posés d'un coup, quatre joueurs qui bougent ensemble ou un glisser de douze
  tokens font **un** calcul et **un** événement par scène, après le `COMMIT`, sans rien ajouter
  au temps de réponse des écritures.
- **Calcul** (`exploreMap`) : visibilité de la scène (`loadMapVision`, scène préparée gardée en
  mémoire), observateurs du groupe (union des observateurs de chaque joueur), traînées reçues ;
  `markView` pour chacun ; si des cases sont neuves, la ligne est verrouillée (`FOR UPDATE`),
  fusionnée (OU : rien de ce qu'un autre a écrit n'est perdu), `version + 1`, et l'événement part.

### Routes

| Route                                                  | Qui       | Effet                                                                    |
| ------------------------------------------------------ | --------- | ------------------------------------------------------------------------ |
| `GET /v1/campaigns/:id/maps/:mapId/exploration`        | membres   | `{ exploration: MapExploration \| null }` (null : exploration coupée)    |
| `POST /v1/campaigns/:id/maps/:mapId/exploration/trail` | qui bouge | traînées `{ trails: [{ tokenId, points }] }` : explore depuis ces points |
| `POST /v1/campaigns/:id/maps/:mapId/exploration`       | MJ        | `{ op: 'reveal' \| 'forget', cols, rows, window }` ou `{ op: 'reset' }`  |

- Le chargement de la carte (`GET /maps/:mapId`, `MapSnapshot`) porte aussi `exploration`
  (null si coupée) : rien de plus à demander à l'ouverture.
- **Traînée** : 20 tokens et 32 points chacun au plus, dans la carte. Seuls comptent les tokens
  qui sont des observateurs du groupe, avec leur rayon de vision actuel ; un joueur n'envoie que
  pour ses personnages (même droit que le déplacement), le MJ pour tous. Traitée tout de suite,
  dans la transaction de la route (le joueur n'attend pas : la requête part après le lâcher).
  Elle ne donne aucun pouvoir de plus qu'un déplacement : poser son token là explorerait autant.
- **Révéler, oublier** : la fenêtre (cases calculées par le client du MJ avec
  `rasterizeShape`) est ajoutée ou retirée ; `cols`, `rows` doivent être ceux du masque (sinon
  409 `exploration_grid_changed`). C'est aussi l'annulation : annuler « révéler » oublie les
  seules cases que le geste a ajoutées, et inversement. Exploration coupée : 409
  `exploration_off`.
- **Réinitialiser** : toutes les cases à 0, grille refaite. Annulable (révéler l'ancien masque),
  sauf si la grille a changé entre-temps.

### Événement et non-fuite

- `map.exploration_updated { mapId, scope, version, cols, rows, window }` : `window` est le
  nouvel état du rectangle des cases changées (codé en plages). Une seule forme pour explorer,
  révéler, oublier et réinitialiser (toute la grille).
- Audience : la même que la carte. Carte visible des joueurs : `public` ; sinon `gm_only` et les
  joueurs qui y ont un personnage présent. Exploration coupée : rien ne part.
- **Rien de nouveau n'est envoyé** : le fond, les murs, les zones et les décors sont déjà chez le
  joueur (l'obscurité est un rendu). La mémoire ne dit que **où** le groupe est allé. PNJ et
  objets restent filtrés par la vue **en direct** (§ 9, Serveur), jamais par la mémoire : un PNJ
  dans une salle explorée mais hors de vue n'est ni envoyé ni montré. Tests :
  `exploration.int.test.ts`.

## 5. Client

### 5.1 Modèle (`features/exploration/engine/model.ts`)

- Un modèle par moteur (`explorationOf(engine)`) : le masque du serveur, la version, et une
  couche **locale** (§ 5.3). Il lit `exploration` du chargement (magasin, `extras`), applique les
  événements dans l'ordre des versions (version suivante : appliquée ; plus ancienne : ignorée ;
  trou : relecture `GET …/exploration`), et une révision qui change à chaque modification.
- Surcouche sans rendu (`ExplorationHost`) : écoute `map.exploration_updated`, relit si
  l'exploration est activée sans masque connu.

### 5.2 Rendu (module `vision`)

- Une texture de `cols × rows` texels (RGBA, filtrage linéaire), refaite seulement quand la
  révision du modèle change, lue par le **shader de composition** en coordonnées du monde : un
  terme de plus, aucune passe ni texture d'écran en plus.
- Là où la case est explorée et pas vue : l'obscurité, la brume et le noir des obstacles et des
  salles fermées sont remplacés par un **voile de mémoire** (gris-brun du thème, 62 % de
  l'obscurité) : le fond reste lisible, assombri et désaturé. Bord adouci (`smoothstep` sur le
  filtrage, un quart de case).
- Joueur et « Vue de … » : rendu exact. MJ : le même voile, proportionnel à son voile léger
  (25 % → 15 %) : il distingue d'un coup d'œil exploré, vu et inconnu.
- Masquage des entités inchangé (vue en direct) : PNJ, objets hors décor et icônes de porte
  restent masqués dans la mémoire.

### 5.3 Mémoire locale pendant un glisser

- Le serveur explore au lâcher ; pendant le glisser, la vue suit en direct. Sans rien de plus,
  la zone quittée redeviendrait noire jusqu'à la réponse. Le client marque donc localement ce
  que voit le joueur (`markView` sur sa vue, déjà calculée par l'état de la vision), au plus
  10 fois par seconde, dans une couche locale montrée avec le masque du serveur.
- Le même module retient la traînée des tokens glissés (un point par case parcourue, 32 au plus,
  décimés au-delà) et l'envoie au lâcher (`…/exploration/trail`), une requête pour toute la
  sélection, après la réponse du déplacement.
- La couche locale est vidée 3 s après le dernier marquage (le serveur a répondu entre-temps) et
  à tout oubli ou réinitialisation reçus. Elle n'est jamais envoyée : le serveur recalcule.

### 5.4 MJ : outil Exploration, actions

- Outil **Exploration** (MJ, groupe des outils, après Brouillard et Lumières ; sans touche par
  défaut : toutes les lettres sont prises, l'éditeur des raccourcis en donne une). Icône
  `Footprints`.
  - Formes : 1 Rectangle, 2 Cercle, 3 Main levée (mêmes gestes que le brouillard) ; mode
    **Révéler** ou **Oublier** (Alt inverse le temps du geste) ; chaque geste est une commande
    annulable.
  - Tant que l'outil est actif, la mémoire est surlignée (couleur primaire, 25 %) : on voit ce
    qu'on révèle ou oublie.
  - Barre contextuelle : formes, mode, interrupteur « Exploration » de la scène, « Réinitialiser »
    (confirmation). Pas de texte d'aide : infobulles.
- Actions (sans touche par défaut, `lib/map/shortcuts.ts`) : `exploration.toggle` (activer ou
  couper sur la scène), `exploration.reset` (réinitialiser, avec confirmation).
- « Vue de … » (menu Vue) montre la mémoire exactement comme ce joueur.

## 6. Performances (budgets)

| Où                                                          | Budget      |
| ----------------------------------------------------------- | ----------- |
| Client, marquage local d'une vue (donjon du banc, régime)   | < 0,5 ms    |
| Client, marquage local d'une vue (première fois, 104 × 104) | < 3 ms      |
| Client, composition : une texture lue de plus               | négligeable |
| Serveur, exploration d'une scène (4 joueurs, régime)        | < 5 ms      |
| Serveur, traînée de 32 points                               | < 30 ms     |
| Événement d'un pas d'exploration                            | < 1 Kio     |
| Masque en base                                              | ≤ 32 Kio    |

Mesures : § 7.

## 7. Mesures

(à remplir par le banc, `packages/vision/src/exploration.bench.ts` et
`features/vision/engine/vision-drag.bench.ts`)

## 8. Décisions prises

- **D1 — Mémoire partagée par le groupe, par scène.** La table joue ensemble : la carte se
  dévoile pour tous, comme une carte dressée en commun ; un joueur arrivé en retard ou dont le
  personnage était ailleurs en profite. Un seul calcul et un seul événement par scène (au lieu
  d'un par joueur), un seul masque à gérer pour le MJ (révéler, oublier, réinitialiser), une
  « Vue de … » qui suffit à le montrer. Une mémoire par joueur (groupe séparé, secrets) reste
  possible sans migration (`scope` = identifiant du joueur) : elle n'est pas faite.
- **D2 — Masque raster d'un quart de case, 512 par côté au plus**, plutôt que des polygones :
  taille bornée, union triviale, rendu direct, codage compact (§ 3).
- **D3 — Le serveur calcule** (après le `COMMIT`, par une file en base et un travailleur), le
  client ne fait que montrer et retenir sa traînée. Un joueur ne peut pas écrire la mémoire du
  groupe ; ce qui est enregistré ne dépend que de l'état de la base.
- **D4 — File en base plutôt que bus ou minuteur en mémoire** : la ligne n'apparaît qu'au
  `COMMIT` (aucune exploration d'un état annulé), survit à un redémarrage, se partage entre
  réplicas (`SKIP LOCKED`) ; aucune connexion `LISTEN` de plus (PgBouncer).
- **D5 — Traînée envoyée par le client**, à part du déplacement : le contrat des déplacements ne
  change pas, et le module des tokens ne dépend pas de l'exploration.
- **D6 — Exploration activée par défaut sur les scènes neuves, coupée sur les existantes.**
- **D7 — Voile de mémoire plutôt qu'un vrai gris** : désaturer le fond demanderait un filtre sur
  tout le plan du contenu à chaque image ; un voile gris-brun du thème à 62 % se lit comme
  « grisé » pour un coût nul.
- **D8 — La mémoire ne montre que le fixe** : fond, décors, dessins et textes des calques, murs
  tracés. PNJ, objets hors décor et icônes de porte suivent la vue en direct (filtrage serveur
  inchangé).

## 9. Reste à faire, limites

- Mémoire par joueur (D1) : non faite.
- Le bord de la mémoire déborde d'au plus 1/8 de case derrière un mur (§ 3).
- La traînée suit la position affichée du token, échantillonnée à chaque image : un glisser très
  rapide à travers une petite pièce peut la sauter entre deux points (un point par case).
