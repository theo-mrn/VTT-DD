# API de la carte (service campaign)

La carte vit dans le service campaign (module `backend/campaign/src/modules/maps`). Modèle,
correspondance avec l'ancienne app, visibilité et événements : [map.md](map.md). Conception de
la refonte (moteur PixiJS, calques, visibilité) : [carte.md](carte.md).

**Contrat** : `packages/contracts/src/map.ts` (`@vtt/contracts`). Tous les éléments, leurs corps
de création (`Create…`) et de modification (`Update…`), le chargement initial (`MapSnapshot`),
les charges des événements (`MapEventPayloads`) et les messages éphémères (`MapLiveMessage`,
`MapPingMessage`) y sont définis en Zod ; le service valide ses routes avec les mêmes schémas.

Mêmes conventions que [api-campaign.md](api-campaign.md) : jeton d'accès obligatoire, JSON
camelCase, erreurs `application/problem+json` avec un `code`. Campagne dont l'appelant n'est
pas membre : 404 `campaign_not_found` ; carte invisible pour lui : 404 `map_not_found`.
Coordonnées en **pixels de l'image de fond** : `{ x, y }`. Chaque élément porte un `version` ;
tout `PATCH` accepte `version` (facultatif) et répond 409 `version_conflict` s'il a changé. Les
corps sont stricts : une clé inconnue donne 400.

Droits : le MJ fait tout. Un joueur lit ce qu'il voit (filtré par le serveur), déplace les tokens
de ses personnages (et active leur vision augmentée), ouvre ou ferme une porte non verrouillée,
crée des dessins, textes et gabarits, modifie, réordonne ou supprime les siens, et fouille les
objets à portée de ses personnages. Un spectateur lit seulement. Au-delà : 403.

## Cartes (scènes)

| Méthode | Route                                   | Corps                                                                                                                                            | Réponse                                                                                             |
| ------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps`                | —                                                                                                                                                | `{ items: [Map] }` ; joueur : cartes `visibleToPlayers` et celle où se trouve un de ses personnages |
| POST    | `/v1/campaigns/:id/maps`                | `{ name, description?, groupId?, backgroundUrl?, isDefault?, visibleToPlayers?, spawn?, width?, height?, weather?, display?, fogFull?, grids? }` | 201 `Map` (MJ), née avec ses trois calques ; 409 `default_map_exists` ; 422 `unknown_group`         |
| GET     | `/v1/campaigns/:id/maps/:mapId?bbox=`   | —                                                                                                                                                | `MapSnapshot` : chargement initial, filtré pour l'appelant                                          |
| PATCH   | `/v1/campaigns/:id/maps/:mapId`         | mêmes champs, tous facultatifs, `version?`                                                                                                       | `Map` (MJ) ; `width`/`height` vont ensemble (400 `size_incomplete`)                                 |
| DELETE  | `/v1/campaigns/:id/maps/:mapId`         | —                                                                                                                                                | 204 (MJ) ; tout ce qui est posé dessus disparaît ; 409 `players_present` si un joueur s'y trouve    |
| POST    | `/v1/campaigns/:id/maps/:mapId/rescale` | `{ sx, sy }` (0 à 1000 exclus)                                                                                                                   | `MapSnapshot` (MJ) : toute la géométrie mise à l'échelle en une transaction                         |

`Map` (`MapScene`) : `{ id, name, description, groupId, backgroundUrl, isDefault, visibleToPlayers, spawn, width, height, weather, display, fogFull, grids, version, updatedAt }`.

- `isDefault` : le fond global de l'ancienne app (aucune scène sélectionnée), une par campagne au plus.
- `backgroundUrl` : image (png, jpeg, webp, avif, gif) ou vidéo (webm, mp4). `width`/`height` :
  taille naturelle du fond, envoyée par le client du MJ une fois le fond chargé (taille du monde).
- `weather` : `{ type, intensity }` ou `null`.
- `display` (ex-`layers`) : familles affichées, réglage du MJ,
  `{ lights, obstacles, notes, drawings, objects, characters, fog, music: boolean }` ;
  `obstacles: false` coupe aussi l'occlusion côté serveur. Ce ne sont pas les calques du MJ.
- `grids` : quadrillages de la scène (`MapGrid`, quatre au plus) :
  `{ id, name, size, offsetX, offsetY, color, opacity, thickness, visibleToPlayers, primary }`,
  en pixels du monde (`thickness` en pixels d'écran). La grille de jeu (`primary`, une au plus,
  400 sinon) donne la case de la scène : rayons des lumières et de la fouille, écart des PNJ
  posés, arrivée du groupe (`scenePixelsPerUnit`), sinon `pixelsPerUnit` des réglages. Lue par
  tous (la grille de jeu compte même cachée aux joueurs), modifiée par le MJ (`PATCH`).
- `fogFull` : toute la carte est sous le brouillard au départ (remplace `fullMapFog`) ; les zones
  de brouillard s'appliquent ensuite.
- `?bbox=x1,y1,x2,y2` : ne renvoie que ce qui touche ce rectangle (index GiST), aussi sur chaque liste.
- **Mise à l'échelle** (`rescale`, fond changé de taille) : `x × sx`, `y × sy` pour chaque
  position et chaque géométrie de la carte (tokens, objets, lumières, obstacles, pièces, zones,
  dessins, textes, zones sonores, portails, gabarits, point d'apparition, taille du fond), et
  les longueurs × √(sx·sy) : rayons (vision, lumières en unités, fouille, zones, sons), taille
  des tokens, épaisseur des dessins, police des textes, largeur et hauteur des objets (× `sx`,
  × `sy`). Les points d'arrivée des portails d'autres cartes qui visent celle-ci suivent. Chaque
  élément prend une version de plus ; événements `map.updated` puis `map.rescaled` : les clients
  relisent la carte.

`MapSnapshot` : `{ map, layers, tokens, objects, lights, obstacles, rooms, fogZones, drawings, notes, musicZones, portals, measurements }`.

## Médias

| Méthode | Route                     | Corps                                                            | Réponse                                               |
| ------- | ------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| POST    | `/v1/campaigns/:id/media` | `{ kind: 'image', contentType, size }` ou `{ kind: 'video', … }` | `{ uploadUrl, publicUrl, expiresIn }` (MJ), 20/min/IP |

- Images : `image/png`, `image/jpeg`, `image/webp`, `image/avif`, `image/gif`, 10 Mo au plus.
  Vidéos : `video/webm`, `video/mp4`, 100 Mo au plus. Autre type ou taille : 400.
- Le navigateur envoie le fichier par `PUT uploadUrl` avec les en-têtes `content-type` et
  `content-length` annoncés (signés : le stockage refuse un autre fichier), puis utilise
  `publicUrl` (fond, objet, token). URL valable 5 min. Stockage non configuré : 503
  `storage_unavailable`.
- Même signature que `POST /v1/campaigns/:id/image` (image de la campagne, 5 Mo) et
  `/notes/upload` (`signUpload`, `src/storage/images.ts`) ; fichiers sous
  `campaigns/<campaignId>/<uuidv7>.<ext>`. En local : SeaweedFS (`S3_*` de `.env`), CORS du
  front autorisé.

## Tokens

| Méthode | Route                                                     | Corps                                                   | Réponse                                                                                                                                                                                   |
| ------- | --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps/:mapId/tokens?bbox=`              | —                                                       | `{ items: [Token] }` présents sur la carte, visibles par l'appelant                                                                                                                       |
| GET     | `/v1/campaigns/:id/maps/:mapId/tokens/near?x=&y=&radius=` | —                                                       | `{ items: [Token & { distance }] }` dans le rayon (pixels), du plus proche au plus loin, filtrés                                                                                          |
| POST    | `/v1/campaigns/:id/maps/:mapId/tokens`                    | `CreateMapToken` : `{ characterId, pos, …champs }`      | 201 `Token` (MJ) ; personnage engagé (422 `character_not_engaged`) ; 409 `token_exists`, 409 `character_on_other_map` (utiliser `/travel`) ; 422 `unknown_layer`                          |
| PATCH   | `/v1/campaigns/:id/maps/:mapId/tokens/:tokenId`           | `UpdateMapToken` : `{ pos?, …champs?, version? }`       | `Token` ; joueur : ses personnages, `pos` et `visionBoost` seulement (le rayon triple, puis revient)                                                                                      |
| DELETE  | `/v1/campaigns/:id/maps/:mapId/tokens/:tokenId`           | `?character=delete` facultatif                          | 204 (MJ) ; sans paramètre, le personnage reste engagé ; avec, voir PNJ                                                                                                                    |
| POST    | `/v1/campaigns/:id/maps/:mapId/tokens/move`               | `{ moves: [{ tokenId, pos, version? }] }` (200 au plus) | `{ items: [Token] }` : fin de drag, sélection multiple ; un `token.moved` par token                                                                                                       |
| POST    | `/v1/campaigns/:id/maps/:mapId/travel`                    | `{ characterIds?, pos? }`                               | `{ items: [Token] }` : amène des personnages sur cette carte (portail, changement de scène). Sans `characterIds` : tous les personnages joueurs, et la carte devient celle du groupe (MJ) |

`Token` : `{ id, mapId, characterId, layerId, z, pos, scale, shape: 'circle'|'square', imageUrl, visibility, visibleTo, visionRadius, visionBoost, notes, audio, interactions, version, updatedAt }`.

- Nom, avatar, stats : le personnage (`characterId`) dans le service character ; `imageUrl` n'est
  renseigné que si le token a sa propre image (sinon l'avatar du personnage).
- `layerId`, `z` : calque du MJ et ordre (voir Calques). Absents à la création : calque
  « Personnages » (rôle `tokens`), en haut de sa pile.
- `visibility` : `visible` (défaut), `hidden` (vu seulement dans un rayon de vision ou éclairé),
  `ally` (toujours vu, et voit pour les joueurs), `custom` (vu des joueurs dont un personnage est
  dans `visibleTo`), `invisible` (MJ seulement). Les personnages joueurs sont toujours vus.
- Filtrage pour un joueur (`@vtt/vision`, [carte.md](carte.md) § 9) : un PNJ `visible` ou
  `hidden` n'est envoyé que s'il est vu (ligne de vue, pièces fermées, brouillard, lumières ; un
  de ses 9 points d'échantillon suffit) ; jamais le contenu d'un calque masqué, sauf ses propres
  tokens. Un token inconnu du joueur répond 404.
- `visionRadius` en pixels (défaut 100), tel qu'enregistré : « Vision augmentée » le triple à
  l'activation ; `audio` : `{ url, radius, volume, loop?, name? }` ou
  `null` ; `interactions` : marchand, jeu, butin (forme de l'ancienne app).
- Un personnage est sur une seule carte à la fois ; en changeant de scène il garde sa dernière
  position sur les autres. Position à l'arrivée d'un `travel` : `pos`, sinon le `spawn` de la carte,
  sinon sa dernière position connue sur cette carte, sinon le centre de la carte. Un joueur ne déplace que ses
  personnages, vers une carte qu'il voit.
- Positions **pendant** un drag : canal éphémère du service realtime (`map.live`) ; seul l'état
  final passe ici.

## PNJ

Chaque PNJ posé est un **vrai personnage** (fiche complète, stats calculées par `@vtt/rules`),
possédé par le MJ, engagé dans la campagne, avec son token.

| Méthode | Route                                                            | Corps                                                                                                                                                                     | Réponse                                                                          |
| ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| POST    | `/v1/campaigns/:id/maps/:mapId/npcs`                             | `CreateMapNpcs` : `{ source, count?, pos, side?, visibility?, scale?, shape?, layerId? }` (calque : 422 `unknown_layer` s'il n'est pas de la carte, avant toute création) | 201 `{ items: [Token], characters: [{ id, name, avatarUrl, templateId }] }` (MJ) |
| POST    | `/v1/campaigns/:id/maps/:mapId/tokens/:tokenId/duplicate`        | `{ pos, count? }`                                                                                                                                                         | 201, même forme (MJ)                                                             |
| DELETE  | `/v1/campaigns/:id/maps/:mapId/tokens/:tokenId?character=delete` | —                                                                                                                                                                         | 204 (MJ)                                                                         |

- `source` : `{ templateId }` (modèle de PNJ de la campagne, `npc-templates`),
  `{ bestiary: { systemeId, key } }` (créature du bestiaire de référence du système de la
  campagne) ou `{ quick: { name, imageUrl?, type, valeurs? } }` (création rapide : type d'entité
  et valeurs saisies, lus dans la présentation du système). `count` : 1 à 20 (défaut 1).
- Noms : « Gobelin », puis « Gobelin 2 », « Gobelin 3 »… ; la numérotation reprend après le plus
  grand numéro des PNJ de ce nom dans la campagne. `templateId` est gardé sur le personnage.
- Engagés dans le camp `side` (`enemies` par défaut), tokens posés en grille serrée autour de
  `pos` (une case d'écart : `pixelsPerUnit × tokenScale × scale`), calque « Personnages »,
  `visibility` choisie (défaut `visible`), image du token = celle du modèle (`tokenUrl`) ou de la
  création rapide.
- **En une fois** : character crée les personnages (sa transaction, route interne
  `POST /internal/npcs`), puis campaign les engage et pose les tokens (la sienne). Si la seconde
  échoue, les personnages créés sont supprimés (`POST /internal/npcs/delete`) et l'erreur est
  renvoyée : rien ne reste à moitié créé. Refus de character : 404 (modèle, créature, PNJ
  introuvable) ou 422 (`system_mismatch`, état invalide) ; character injoignable : 502
  `character_unavailable`.
- `duplicate` : clone l'état **actuel** du PNJ (fiche, présentation, mise en page) et l'apparence
  de son token (calque compris), `count` fois autour de `pos`. Un personnage du camp des joueurs :
  422 `not_an_npc`.
- `DELETE …?character=delete` : seulement un PNJ (character dit `kind: npc`, sinon 422
  `not_an_npc`) ; campaign le retire du combat, supprime ses tokens de toutes les cartes et son
  engagement, puis character le supprime. Si character ne répond pas à cette dernière étape, le
  PNJ reste hors campagne, sans token (journalisé). « Retirer de la carte » : `DELETE` sans
  paramètre, le personnage reste engagé.
- Événements : `campaign.character_added` (`gm_only` : le nom d'un PNJ caché ne fuit pas),
  `token.created` (visibilité du token), `campaign.character_removed`, `token.deleted` ; côté
  character, `character.created` / `character.deleted` dans la campagne, `gm_only`.
- Liste des personnages de la campagne (`GET /v1/campaigns/:id/characters`,
  [api-campaign.md](api-campaign.md)) : un joueur n'y voit que les PNJ dont un token lui est
  visible (même filtre que les tokens). Retirer un personnage de la campagne supprime ses
  tokens de toutes les cartes, avec un `token.deleted` chacun.

## Calques du MJ

Chaque carte a une pile ordonnée de calques (`MapLayer`), du bas vers le haut par `sortOrder`.
Une carte naît avec « Sol » (rôle `ground`), « Objets » (`objects`) et « Personnages » (`tokens`).
Tokens et objets appartiennent à un calque (`layerId`) et y ont un ordre `z` (réel) ; dessins et
textes aussi, ou aucun (`layerId` nul : annotation, au-dessus de l'ombre).

`MapLayer` : `{ id, mapId, name, sortOrder, visibleToPlayers, locked, opacity, role, version, updatedAt }`.

- `role` : calque par défaut d'une sorte (`tokens` pour un token posé sans calque, `objects` pour
  un objet) ; sans calque de ce rôle (supprimé), le plus haut. Un élément créé sans `z` va en haut
  de son calque (`z` = plus grand + 1). Tenu par la base (déclencheurs de 0018), quel que soit
  l'écrivain.
- `visibleToPlayers: false` : le calque **et tout son contenu** ne sont jamais envoyés aux joueurs
  (REST, bus, rejeu), sauf leurs propres tokens. `locked` et `opacity` sont des réglages
  d'affichage et de sélection pour le front ; un joueur ne range rien dans un calque verrouillé.
- Couche `layers` au contrat commun (ci-dessous), sans `bbox`. Création sans `sortOrder` : en haut
  de la pile. `DELETE …/layers/:layerId?moveTo=` : le contenu descend dans le calque du dessous
  (celui du dessus pour le plus bas), ou va dans `moveTo`, posé au-dessus de ce qui s'y trouve,
  ordre relatif gardé (un `<domaine>.updated` par élément déplacé) ; le dernier calque ne se
  supprime pas (409 `last_layer`).

| Méthode | Route                                   | Corps                                                                                   | Réponse                                                                            |
| ------- | --------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| POST    | `/v1/campaigns/:id/maps/:mapId/arrange` | `{ items: [{ kind: 'token'\|'object'\|'drawing'\|'note', id, layerId, z }] }` (1 à 500) | `{ tokens, objects, drawings, notes }` : les éléments modifiés, en une transaction |

- MJ : tout. Joueur : ses dessins et textes seulement (403 sinon), vers un calque ni verrouillé
  (403) ni masqué (422 `unknown_layer`), ou hors calque (`layerId: null`).
- Un token ou un objet appartient toujours à un calque (422 `layer_required`). Calque d'une autre
  carte : 422 `unknown_layer`. Réordonner n'écrit que les éléments envoyés (`z` pris entre deux
  voisins par le client).
- Un `<domaine>.updated` par élément ; un élément qui passe dans un calque masqué produit aussi
  `<domaine>.hidden` public.

## Couches

Même contrat pour `layers`, `objects`, `lights`, `obstacles`, `rooms`, `fog-zones`, `drawings`,
`notes`, `music-zones`, `portals`, `measurements` (clé du chargement initial : `MAP_LAYERS` du
contrat, `fogZones`, `musicZones`…) :

| Méthode | Route                                            | Corps                                                                       | Réponse                                                                                                     |
| ------- | ------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps/:mapId/<couche>?bbox=`   | —                                                                           | `{ items }` filtrés pour l'appelant, par date de création (calques : par `sortOrder` ; zones : par `order`) |
| POST    | `/v1/campaigns/:id/maps/:mapId/<couche>`         | `Create…` : champs obligatoires (ci-dessous), les autres facultatifs        | 201 et l'élément                                                                                            |
| PATCH   | `/v1/campaigns/:id/maps/:mapId/<couche>/:itemId` | `Update…` : champs facultatifs, `version?`                                  | l'élément                                                                                                   |
| DELETE  | `/v1/campaigns/:id/maps/:mapId/<couche>/:itemId` | —                                                                           | 204                                                                                                         |
| POST    | `/v1/campaigns/:id/maps/:mapId/<couche>/batch`   | `{ create?: [], update?: [{ id, … }], delete?: [id] }` (500 au plus chacun) | `{ created, updated, deleted }` en une transaction (murs en chaîne, sélection multiple)                     |
| DELETE  | `/v1/campaigns/:id/maps/:mapId/drawings`         | —                                                                           | 204 : efface les dessins de la carte (MJ) ou les siens (joueur)                                             |

Éléments (tous ont aussi `id`, `mapId`, `version`, `updatedAt`) :

| Couche         | Obligatoire             | Champs                                                                                                                                                                                                                                                                                                    | Écriture                                           |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `layers`       | `name`                  | `name`, `sortOrder`, `visibleToPlayers`, `locked`, `opacity` (0 à 1), `role` (lu seul)                                                                                                                                                                                                                    | MJ                                                 |
| `objects`      | `pos`                   | `name`, `kind: decor\|weapon\|item`, `imageUrl`, `pos` (coin haut gauche), `width`, `height`, `rotation` (degrés, autour du centre), `layerId`, `z`, `isLocked`, `visibility: visible\|hidden\|custom`, `visibleTo`, `notes`, `items`, `linkedId`, `groupEntityId`, `searchable`, `searchRadius` (unités) | MJ                                                 |
| `lights`       | `pos`                   | `name`, `pos`, `radius` (unités, × `pixelsPerUnit`), `visible` (allumée), `color`, `intensity` (0 à 1), `falloff` (0 à 1, part du rayon en dégradé), `attachedTokenId` (token de la carte, 422 `unknown_token`)                                                                                           | MJ                                                 |
| `obstacles`    | `points` (2 et plus)    | `kind: wall\|one_way_wall\|door\|window`, `points`, `blocksFrom: left\|right` (mur à sens unique, `left` par défaut), `isOpen`, `isLocked`, `color`, `opacity` (1 par défaut : bloque ; en dessous, ombre partielle), `roomMode: room\|individual`                                                        | MJ ; joueur : `isOpen` d'une porte non verrouillée |
| `rooms`        | `points` (3 et plus)    | `name`, `points` (contour, sans répéter le premier point)                                                                                                                                                                                                                                                 | MJ                                                 |
| `fog-zones`    | `shape` et sa géométrie | `shape: circle\|rect\|polygon`, `mode: fog\|clear` (défaut `fog`), `center` et `radius` (cercle), `points` (4 pour `rect`, 3 à 5 000 pour `polygon`), `order` et `createdBy` (lus seuls)                                                                                                                  | MJ                                                 |
| `drawings`     | `points`                | `tool: pen\|brush\|eraser\|line\|rectangle\|circle`, `points`, `color`, `width`, `fill`, `closed`, `smooth`, `layerId` (nul : annotation), `z`, `createdBy` (lu seul)                                                                                                                                     | membres ; auteur ou MJ                             |
| `notes`        | `text`, `pos`           | `text`, `pos` (début de la ligne de base), `rotation` (degrés, autour de `pos`), `color`, `fontSize`, `fontFamily`, `layerId` (nul : annotation), `z`, `createdBy`                                                                                                                                        | membres ; auteur ou MJ                             |
| `music-zones`  | `pos`                   | `name`, `pos`, `radius` (pixels), `url` (fichier audio ou id YouTube), `volume` (0 à 1), `color`                                                                                                                                                                                                          | MJ                                                 |
| `portals`      | `pos`                   | `name`, `pos`, `radius`, `kind: scene_change\|same_map`, `targetMapId` (même campagne, 422 `unknown_target_map`), `target` (point d'arrivée), `icon: stairs\|door\|portal\|ladder`, `color`, `visible`                                                                                                    | MJ                                                 |
| `measurements` | `shape`, `start`, `end` | `shape: line\|cone\|circle\|cube`, `start`, `end`, `color`, `skin`, `options` (cône : `coneWidth`, `coneAngle`, `coneShape`, `coneMode`, `fixedLength`…), `createdBy`                                                                                                                                     | membres ; auteur ou MJ                             |

- **Contenu d'un objet** (`items`, coffre, cadavre) : `[{ id, name, quantity, imageUrl?, description?, ref?, legacy? }]`,
  500 au plus. `ref` : entrée du catalogue du système (`entree`) ; absent, objet libre. `legacy` :
  champs de l'ancien `LootItem` (poids, dégâts…) gardés à la migration.
- **Zones de brouillard** : appliquées par `order` croissant (ordre de création), en partant de
  `fogFull` de la carte : `fog` ajoute, `clear` retire. La forme ne change pas : un cercle se règle
  par `center`/`radius`, les autres par `points` (422 `fog_zone_shape` sinon). Un cercle a
  `points: []`, les autres `center` et `radius` nuls.
- **Mur à sens unique** : `blocksFrom` est relatif au sens de tracé a→b : il bloque la vue d'un
  observateur situé de ce côté ; côté gauche : `cross(b − a, p − a) < 0` (y vers le bas).
- Filtrage pour un joueur : objets `hidden` et `custom` hors `visibleTo`, lumières et portails
  `visible: false`, calques masqués et leur contenu sont absents ; un objet (hors `decor`) n'est
  envoyé que s'il est vu (`@vtt/vision`, centre, coins et milieux des bords), et **jamais avec
  son contenu** : `items` vaut `[]` pour un joueur (REST, événements, rejeu), seule la fouille le
  donne. Les gabarits posés ici sont permanents ; les mesures éphémères (6 s) passent par
  realtime.

## Fouille des objets

| Méthode | Route                                                  | Corps                                | Réponse                                                                                                |
| ------- | ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| POST    | `/v1/campaigns/:id/maps/:mapId/objects/:itemId/search` | `{ characterId }`                    | `{ id, mapId, name, items, version }` : le contenu                                                     |
| POST    | `/v1/campaigns/:id/maps/:mapId/objects/:itemId/take`   | `{ characterId, itemId, quantity? }` | `{ object: { id, mapId, name, items, version }, taken: { itemId, name, quantity }, characterVersion }` |

- Joueur : un de ses personnages (403 sinon), engagé, objet vu (404 sinon) et `searchable` (403
  `not_searchable`), token du personnage présent sur la carte à `searchRadius` unités au plus du
  rectangle de l'objet (tourné autour de son centre) : sinon 422 `out_of_range`. Le MJ fouille et
  prend pour tout personnage engagé, sans condition.
- `take` : `quantity` (défaut : tout) au plus ce que contient l'objet (422 `quantity_exceeded`).
  L'objet reste verrouillé pendant que character ajoute l'objet à l'inventaire (route interne
  `POST /internal/characters/:id/possessions/receive` : entrée `ref` du catalogue, sinon l'objet
  libre du système, nommé et décrit) ; refus de character (422, son `code`) ou panne (502) : rien
  ne change. Sinon le contenu diminue (ou disparaît), `map_object.updated`.
- Événements du MJ : `map_object.searched { id, mapId, name, characterId, userId }` et
  `map_object.looted { id, mapId, name, characterId, userId, item, remaining }`, `gm_only`.

## Réglages et dossiers

| Méthode | Route                                   | Corps                                 | Réponse                                                                                                                                                                |
| ------- | --------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/map-settings`        | —                                     | `{ campaignId, partyMapId, tokenScale, pixelsPerUnit, unitName, shadowOpacity, dungeonMode, music, version }` (valeurs par défaut sans réglage : 1, 50, `m`, 1, false) |
| PATCH   | `/v1/campaigns/:id/map-settings`        | mêmes champs, facultatifs, `version?` | MJ ; `partyMapId` : scène du groupe (404 si inconnue) ; `music` : musique d'ambiance (`{ videoId, videoTitle, templateId, isPlaying, … }`)                             |
| GET     | `/v1/campaigns/:id/map-groups`          | —                                     | `{ items: [{ id, name, sortOrder, version }] }` (MJ)                                                                                                                   |
| POST    | `/v1/campaigns/:id/map-groups`          | `{ name, sortOrder? }`                | 201 (MJ)                                                                                                                                                               |
| PATCH   | `/v1/campaigns/:id/map-groups/:groupId` | `{ name?, sortOrder?, version? }`     | MJ                                                                                                                                                                     |
| DELETE  | `/v1/campaigns/:id/map-groups/:groupId` | —                                     | 204 (MJ) ; ses cartes n'ont plus de dossier                                                                                                                            |

L'ancien brouillard par cases (`GET|PUT|PATCH /maps/:mapId/fog`) n'existe plus : `fogFull` et la
couche `fog-zones` le remplacent ; les cases enregistrées ont été converties en zones.

## Requêtes spatiales

| Méthode | Route                                                         | Réponse                                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/maps/:mapId/line-of-sight?from=x,y&to=x,y` | `{ blocked, obstacleIds }` : `blocked` si `to` est hors de la ligne de vue depuis `from` (`@vtt/vision` : murs soudés, portes fermées, sens unique vu de son côté bloquant, bords de la carte) ; `obstacleIds` : les obstacles bloquants que le segment traverse |
| GET     | `/v1/campaigns/:id/maps/:mapId/at?x=&y=`                      | `{ musicZones, portals, lights }` sous ce point (zone sonore à jouer, portail à proposer après un déplacement)                                                                                                                                                   |
| GET     | `/v1/campaigns/:id/maps/:mapId/tokens/near?x=&y=&radius=`     | voir Tokens                                                                                                                                                                                                                                                      |

## Direct (canal éphémère)

Messages relayés par realtime, jamais stockés ([api-realtime.md](api-realtime.md),
[carte.md](carte.md) § 8), schémas du contrat :

- `map.live` (`MapLiveMessage`) : `{ m, s, drag?, cursor?, stroke?, transform?, end? }`, 15 Hz
  au plus pendant un geste, 4 Kio au plus ; `stroke` : `{ id, tool, color, width, fill?, points }`
  (`fill` : remplissage d'une forme fermée) ;
- `map.ping` (`MapPingMessage`) : `{ m, x, y, focus? }`.

Audience : public ; `gmOnly` pour une entité cachée ; `toUsers` (50 au plus) pour une entité vue
de certains joueurs seulement.

## Pour le front

Chargement : `GET /maps` puis `GET /maps/:mapId` (`MapSnapshot`, tout d'un coup) et
`GET /map-settings`, puis les événements `map.*`, `token.*`, `map_*` du WebSocket (liste et
visibilités : [map.md](map.md)). Sur `map.rescaled` et quand un calque redevient visible
(`map_layer.updated` d'un calque inconnu), relire la carte ; sur `map.visibility_changed`
(ciblé), un joueur relit tokens et objets ; le MJ ignore les `*.hidden`. Correspondance avec
l'ancienne carte :

| Ancien                                                               | Nouveau                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cities` (CitiesManager), `groups`                                   | `/maps`, `/map-groups`                                                          |
| `settings/general`, `rooms/{r}/music`                                | `/map-settings`                                                                 |
| `settings/layers_{cityId}`                                           | `map.display` (`PATCH /maps/:mapId`)                                            |
| `fond/fond1`                                                         | carte `isDefault`                                                               |
| `characters.{x,y,positions,cityId,currentSceneId}`, RTDB `positions` | tokens, `/tokens/move`, `/travel`                                               |
| « déplacer tout le groupe » (CitiesManager)                          | `POST /maps/:mapId/travel {}`                                                   |
| `fog/fog_{cityId}` (`fullMapFog`, cases)                             | `map.fogFull`, couche `fog-zones`                                               |
| objets `isBackground`                                                | calque « Sol » (`layerId`)                                                      |
| `objects`, `lights`, `musicZones`, `portals`                         | couches `objects`, `lights`, `music-zones`, `portals`                           |
| RTDB `obstacles`, `drawings`, `notes`, `measurements` (permanentes)  | couches `obstacles`, `drawings`, `notes`, `measurements`                        |
| `visibility-checks.ts`                                               | filtrage serveur sur `@vtt/vision` (le MJ reçoit tout ; « Vue de… » est client) |
