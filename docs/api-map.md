# API de la carte (service campaign)

La carte vit dans le service campaign (module `backend/campaign/src/modules/maps`). Modèle,
correspondance avec l'ancienne app, visibilité et événements : [map.md](map.md).

Mêmes conventions que [api-campaign.md](api-campaign.md) : jeton d'accès obligatoire, JSON
camelCase, erreurs `application/problem+json` avec un `code`. Campagne dont l'appelant n'est
pas membre : 404 `campaign_not_found` ; carte invisible pour lui : 404 `map_not_found`.
Coordonnées en **pixels de l'image de fond** : `{ x, y }`. Chaque élément porte un `version` ;
tout `PATCH` accepte `version` (facultatif) et répond 409 `version_conflict` s'il a changé.

Droits : le MJ fait tout. Un joueur lit ce qu'il voit (filtré par le serveur), déplace les tokens
de ses personnages (et règle leur vision), ouvre ou ferme une porte non verrouillée, crée des
dessins, textes et gabarits et modifie ou supprime les siens. Un spectateur lit seulement.
Au-delà : 403.

## Cartes (scènes)

| Méthode | Route                                 | Corps                                                                                                                         | Réponse                                                                                                                             |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps`              | —                                                                                                                             | `{ items: [Map] }` ; joueur : cartes `visibleToPlayers` et celle où se trouve un de ses personnages                                 |
| POST    | `/v1/campaigns/:id/maps`              | `{ name, description?, groupId?, backgroundUrl?, isDefault?, visibleToPlayers?, spawn?, width?, height?, weather?, layers? }` | 201 `Map` (MJ) ; 409 `default_map_exists` (une seule carte `isDefault`) ; 422 `unknown_group`                                       |
| GET     | `/v1/campaigns/:id/maps/:mapId?bbox=` | —                                                                                                                             | chargement initial : `{ map, fog, tokens, objects, lights, obstacles, drawings, notes, musicZones, portals, measurements }` filtrés |
| PATCH   | `/v1/campaigns/:id/maps/:mapId`       | mêmes champs, tous facultatifs, `version?`                                                                                    | `Map` (MJ) ; `width`/`height` vont ensemble (400 `size_incomplete`)                                                                 |
| DELETE  | `/v1/campaigns/:id/maps/:mapId`       | —                                                                                                                             | 204 (MJ) ; tout ce qui est posé dessus disparaît ; 409 `players_present` si un personnage joueur s'y trouve                         |

`Map` : `{ id, name, description, groupId, backgroundUrl, isDefault, visibleToPlayers, spawn, width, height, weather, layers, version, updatedAt }`.

- `isDefault` : le fond global de l'ancienne app (aucune scène sélectionnée), une par campagne au plus.
- `width`/`height` : taille de l'image de fond, à envoyer par le client MJ une fois l'image chargée ;
  sert à la taille des cases de brouillard (`round(min(width, height) / 20)`, 100 px sinon).
- `weather` : `{ type, intensity }` ou `null` ; `layers` : `{ lights, obstacles, notes, drawings, objects, characters, fog, music: boolean }` (calques affichés, réglage du MJ ; `obstacles: false` coupe aussi l'occlusion côté serveur).
- `?bbox=x1,y1,x2,y2` : ne renvoie que ce qui touche ce rectangle (index GiST), aussi sur chaque liste.
- Médias (`backgroundUrl`, images, sons) : URL https ou chemin absolu du site. Pour envoyer une
  image, `POST /v1/campaigns/:id/image` (URL présignée, 5 Mo) puis utiliser la `publicUrl` rendue.

## Tokens

| Méthode | Route                                                     | Corps                                                   | Réponse                                                                                                                                                                                   |
| ------- | --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps/:mapId/tokens?bbox=`              | —                                                       | `{ items: [Token] }` présents sur la carte, visibles par l'appelant                                                                                                                       |
| GET     | `/v1/campaigns/:id/maps/:mapId/tokens/near?x=&y=&radius=` | —                                                       | `{ items: [Token & { distance }] }` dans le rayon (pixels), du plus proche au plus loin, filtrés                                                                                          |
| POST    | `/v1/campaigns/:id/maps/:mapId/tokens`                    | `{ characterId, pos, …champs du token }`                | 201 `Token` (MJ) ; personnage engagé (422 `character_not_engaged`) ; 409 `token_exists`, 409 `character_on_other_map` (utiliser `/travel`)                                                |
| PATCH   | `/v1/campaigns/:id/maps/:mapId/tokens/:tokenId`           | `{ pos?, …champs?, version? }`                          | `Token` ; joueur : ses personnages, champs `pos`, `visionRadius`, `visionBoost` seulement                                                                                                 |
| DELETE  | `/v1/campaigns/:id/maps/:mapId/tokens/:tokenId`           | —                                                       | 204 (MJ) ; le personnage reste engagé                                                                                                                                                     |
| POST    | `/v1/campaigns/:id/maps/:mapId/tokens/move`               | `{ moves: [{ tokenId, pos, version? }] }` (200 au plus) | `{ items: [Token] }` : fin de drag, sélection multiple ; un `token.moved` par token                                                                                                       |
| POST    | `/v1/campaigns/:id/maps/:mapId/travel`                    | `{ characterIds?, pos? }`                               | `{ items: [Token] }` : amène des personnages sur cette carte (portail, changement de scène). Sans `characterIds` : tous les personnages joueurs, et la carte devient celle du groupe (MJ) |

`Token` : `{ id, mapId, characterId, pos, scale, shape: 'circle'|'square', imageUrl, visibility, visibleTo, visionRadius, visionBoost, notes, audio, interactions, version, updatedAt }`.

- Nom, avatar, stats : le personnage (`characterId`) dans le service character ; `imageUrl` n'est
  renseigné que si le token a sa propre image (sinon l'avatar du personnage).
- `visibility` : `visible` (défaut), `hidden` (vu seulement dans un rayon de vision ou éclairé),
  `ally` (toujours vu, et voit pour les joueurs), `custom` (vu des joueurs dont un personnage est
  dans `visibleTo`), `invisible` (MJ seulement). Les personnages joueurs sont toujours vus.
- `visionRadius` en pixels (défaut 100) ; `audio` : `{ url, radius, volume, loop?, name? }` ou
  `null` ; `interactions` : marchand, jeu, butin (forme de l'ancienne app).
- Un personnage est sur une seule carte à la fois ; en changeant de scène il garde sa dernière
  position sur les autres. Position à l'arrivée d'un `travel` : `pos`, sinon le `spawn` de la carte,
  sinon sa dernière position connue sur cette carte, sinon l'origine. Un joueur ne déplace que ses
  personnages, vers une carte qu'il voit.
- Positions **pendant** un drag : canal éphémère du service realtime ; seul l'état final passe ici.

## Couches

Même contrat pour `objects`, `lights`, `obstacles`, `drawings`, `notes`, `music-zones`, `portals`,
`measurements` (clé `musicZones` dans le chargement initial) :

| Méthode | Route                                            | Corps                                                                       | Réponse                                                                                 |
| ------- | ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps/:mapId/<couche>?bbox=`   | —                                                                           | `{ items }` filtrés pour l'appelant, par date de création                               |
| POST    | `/v1/campaigns/:id/maps/:mapId/<couche>`         | champs obligatoires (ci-dessous), les autres facultatifs                    | 201 et l'élément                                                                        |
| PATCH   | `/v1/campaigns/:id/maps/:mapId/<couche>/:itemId` | champs facultatifs, `version?`                                              | l'élément                                                                               |
| DELETE  | `/v1/campaigns/:id/maps/:mapId/<couche>/:itemId` | —                                                                           | 204                                                                                     |
| POST    | `/v1/campaigns/:id/maps/:mapId/<couche>/batch`   | `{ create?: [], update?: [{ id, … }], delete?: [id] }` (500 au plus chacun) | `{ created, updated, deleted }` en une transaction (murs en chaîne, sélection multiple) |
| DELETE  | `/v1/campaigns/:id/maps/:mapId/drawings`         | —                                                                           | 204 : efface les dessins de la carte (MJ) ou les siens (joueur)                         |

Éléments (tous ont aussi `id`, `mapId`, `version`, `updatedAt`) :

| Couche         | Obligatoire             | Champs                                                                                                                                                                                                                                           | Écriture                                           |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `objects`      | `pos`                   | `name`, `kind: decor\|weapon\|item`, `imageUrl`, `pos` (coin haut gauche), `width`, `height`, `rotation`, `isBackground`, `isLocked`, `visibility: visible\|hidden\|custom`, `visibleTo`, `notes`, `items` (coffre), `linkedId`, `groupEntityId` | MJ                                                 |
| `lights`       | `pos`                   | `name`, `pos`, `radius` (unités, × `pixelsPerUnit`), `visible`                                                                                                                                                                                   | MJ                                                 |
| `obstacles`    | `points` (2 et plus)    | `kind: wall\|one_way_wall\|door\|window`, `points`, `direction: north\|south\|east\|west`, `isOpen`, `isLocked`, `color`, `opacity`, `roomMode: room\|individual`                                                                                | MJ ; joueur : `isOpen` d'une porte non verrouillée |
| `drawings`     | `points`                | `tool: pen\|brush\|eraser\|line\|rectangle\|circle`, `points`, `color`, `width`, `fill`, `closed`, `smooth`, `createdBy` (lu seul)                                                                                                               | membres ; auteur ou MJ                             |
| `notes`        | `text`, `pos`           | `text`, `pos`, `color`, `fontSize`, `fontFamily`, `createdBy`                                                                                                                                                                                    | membres ; auteur ou MJ                             |
| `music-zones`  | `pos`                   | `name`, `pos`, `radius` (pixels), `url` (fichier audio ou id YouTube), `volume` (0 à 1), `color`                                                                                                                                                 | MJ                                                 |
| `portals`      | `pos`                   | `name`, `pos`, `radius`, `kind: scene_change\|same_map`, `targetMapId` (même campagne, 422 `unknown_target_map`), `target` (point d'arrivée), `icon: stairs\|door\|portal\|ladder`, `color`, `visible`                                           | MJ                                                 |
| `measurements` | `shape`, `start`, `end` | `shape: line\|cone\|circle\|cube`, `start`, `end`, `color`, `skin`, `options` (cône : `coneWidth`, `coneAngle`, `coneShape`, `coneMode`, `fixedLength`…), `createdBy`                                                                            | membres ; auteur ou MJ                             |

Filtrage pour un joueur : objets `hidden` et `custom` hors `visibleTo`, lumières et portails
`visible: false` sont absents. Les gabarits posés ici sont permanents ; les mesures éphémères
(6 s) passent par realtime.

## Brouillard, réglages, dossiers

| Méthode | Route                                   | Corps                                   | Réponse                                                                                                                                                                |
| ------- | --------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps/:mapId/fog`     | —                                       | `{ mapId, fullMap, cells, cellSize, version }` (aussi dans le chargement initial)                                                                                      |
| PUT     | `/v1/campaigns/:id/maps/:mapId/fog`     | `{ cells, fullMap?, version? }`         | remplace les cases (MJ)                                                                                                                                                |
| PATCH   | `/v1/campaigns/:id/maps/:mapId/fog`     | `{ add?, remove?, fullMap?, version? }` | ajoute ou retire des cases (MJ)                                                                                                                                        |
| GET     | `/v1/campaigns/:id/map-settings`        | —                                       | `{ campaignId, partyMapId, tokenScale, pixelsPerUnit, unitName, shadowOpacity, dungeonMode, music, version }` (valeurs par défaut sans réglage : 1, 50, `m`, 1, false) |
| PATCH   | `/v1/campaigns/:id/map-settings`        | mêmes champs, facultatifs, `version?`   | MJ ; `partyMapId` : scène du groupe (404 si inconnue) ; `music` : musique d'ambiance (`{ videoId, videoTitle, templateId, isPlaying, … }`)                             |
| GET     | `/v1/campaigns/:id/map-groups`          | —                                       | `{ items: [{ id, name, sortOrder, version }] }` (MJ)                                                                                                                   |
| POST    | `/v1/campaigns/:id/map-groups`          | `{ name, sortOrder? }`                  | 201 (MJ)                                                                                                                                                               |
| PATCH   | `/v1/campaigns/:id/map-groups/:groupId` | `{ name?, sortOrder?, version? }`       | MJ                                                                                                                                                                     |
| DELETE  | `/v1/campaigns/:id/map-groups/:groupId` | —                                       | 204 (MJ) ; ses cartes n'ont plus de dossier                                                                                                                            |

Brouillard : `cells` = cases `"cx,cy"` couvertes, case de `cellSize` pixels (`cx = floor(x / cellSize)`).
Avec `fullMap`, toute la carte est couverte, comme `fullMapFog` dans l'ancienne app.

## Requêtes spatiales

| Méthode | Route                                                         | Réponse                                                                                                        |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps/:mapId/line-of-sight?from=x,y&to=x,y` | `{ blocked, obstacleIds }` : murs, murs à sens unique et portes fermées qui coupent le segment                 |
| GET     | `/v1/campaigns/:id/maps/:mapId/at?x=&y=`                      | `{ musicZones, portals, lights }` sous ce point (zone sonore à jouer, portail à proposer après un déplacement) |
| GET     | `/v1/campaigns/:id/maps/:mapId/tokens/near?x=&y=&radius=`     | voir Tokens                                                                                                    |

## Pour le front

Chargement : `GET /maps` puis `GET /maps/:mapId` (tout d'un coup) et `GET /map-settings`, puis
les événements `map.*`, `token.*`, `map_*` du WebSocket (liste et visibilités : [map.md](map.md)).
Correspondance avec l'ancienne carte :

| Ancien                                                               | Nouveau                                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `cities` (CitiesManager), `groups`                                   | `/maps`, `/map-groups`                                                              |
| `settings/general`, `rooms/{r}/music`                                | `/map-settings`                                                                     |
| `settings/layers_{cityId}`                                           | `map.layers` (`PATCH /maps/:mapId`)                                                 |
| `fond/fond1`                                                         | carte `isDefault`                                                                   |
| `characters.{x,y,positions,cityId,currentSceneId}`, RTDB `positions` | tokens, `/tokens/move`, `/travel`                                                   |
| « déplacer tout le groupe » (CitiesManager)                          | `POST /maps/:mapId/travel {}`                                                       |
| `fog/fog_{cityId}`                                                   | `/maps/:mapId/fog`                                                                  |
| `objects`, `lights`, `musicZones`, `portals`                         | couches `objects`, `lights`, `music-zones`, `portals`                               |
| RTDB `obstacles`, `drawings`, `notes`, `measurements` (permanentes)  | couches `obstacles`, `drawings`, `notes`, `measurements`                            |
| `visibility-checks.ts`                                               | filtrage serveur (le MJ reçoit tout, le mode « vue joueur » reste un filtre client) |
