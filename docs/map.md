# Carte — modèle de données (service campaign)

Phase 6 de [refacto.md](refacto.md) : la carte vit dans le schéma `campaign`, en PostGIS
(SRID 0, coordonnées en **pixels de l'image de fond**, index GiST `(map_id, geom)` grâce à
`btree_gist`). Contrat HTTP : [api-map.md](api-map.md).

## Inventaire de l'ancienne carte

La carte legacy (`legacy/src/app/[roomid]/map/**`, hooks `hooks/map/*`, `CitiesManager`)
lit et écrit les chemins suivants. « Scène » = document `cities` ; `cityId` absent ou nul =
le **fond global** (pas de scène sélectionnée).

| Ancien chemin                                                  | Contenu                                                                                                                                                                                                    | Devient                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `cartes/{r}/cities/{id}`                                       | scène : nom, description, `backgroundUrl`, `visibleToPlayers`, `groupId`, `spawnX/Y`, `weather`                                                                                                            | `maps`                                                |
| `cartes/{r}/fond/fond1` + `settings/general.weather`           | fond et météo du fond global                                                                                                                                                                               | `maps` avec `is_default`                              |
| `cartes/{r}/groups/{id}`                                       | dossiers de scènes (`name`, `order`)                                                                                                                                                                       | `map_groups`                                          |
| `cartes/{r}/settings/general`                                  | `globalTokenScale`, `pixelsPerUnit`, `unitName`, `shadowOpacity`, `donjon`, `currentCityId`                                                                                                                | `map_settings`                                        |
| `cartes/{r}/settings/layers[_{cityId}]`                        | calques affichés (réglage MJ par scène)                                                                                                                                                                    | `maps.layers`                                         |
| `cartes/{r}/fog/fog_{cityId}` · `fogData`                      | brouillard : `fullMapFog` + cases `"cx,cy"`                                                                                                                                                                | `maps.fog_full` + `map_fog_zones`                     |
| `cartes/{r}/characters/{id}` (champs de carte)                 | `x/y`, `positions{cityId}`, `cityId`, `currentSceneId`, `visibility`, `visibilityRadius`, `visibleToPlayerIds`, `scale`, `shape`, `imageURL2/Final`, `visionBoostActive`, `audio`, `interactions`, `notes` | `map_tokens` (la fiche est déjà dans character)       |
| RTDB `rooms/{r}/positions/{charId}`                            | position durable (`x/y`, `positions{cityId}`), prioritaire sur Firestore                                                                                                                                   | `map_tokens.pos`                                      |
| `cartes/{r}/objects/{id}`                                      | objets, décors, coffres (`items`), `visibility`, `visibleToPlayerIds`, `isBackground`, `isLocked`                                                                                                          | `map_objects`                                         |
| `cartes/{r}/lights/{id}`                                       | lumières (rayon en unités × `pixelsPerUnit`)                                                                                                                                                               | `map_lights`                                          |
| RTDB `rooms/{r}/obstacles` (ex-`cartes/{r}/obstacles`)         | murs, murs à sens unique, portes, fenêtres (polygones et rectangles éclatés en murs)                                                                                                                       | `map_obstacles` (LineString)                          |
| RTDB `rooms/{r}/drawings` (ex-`cartes/{r}/drawings`)           | dessins à main levée, lignes, formes                                                                                                                                                                       | `map_drawings` (LineString)                           |
| RTDB `rooms/{r}/notes` (ex-`cartes/{r}/text`)                  | textes posés sur la carte                                                                                                                                                                                  | `map_notes`                                           |
| `cartes/{r}/musicZones/{id}`                                   | zones sonores (url mp3 ou id YouTube, rayon, volume)                                                                                                                                                       | `map_music_zones`                                     |
| `cartes/{r}/portals/{id}`                                      | portails (changement de scène ou téléportation)                                                                                                                                                            | `map_portals`                                         |
| RTDB `rooms/{r}/measurements` (`permanent: true`)              | gabarits posés                                                                                                                                                                                             | `map_measurements`                                    |
| RTDB `rooms/{r}/music`                                         | musique d'ambiance en cours (YouTube, lecture/pause)                                                                                                                                                       | `map_settings.music`                                  |
| `cartes/{r}/cities/{id}/combat/state`, `combat/{id}/engaged    | rapport`                                                                                                                                                                                                   | tour actif, cibles, rapports d'attaque                | module `combat` existant / history ; non importé |
| `Salle/{r}/groupEntities`, `cartes/{r}/games`, `scenario/main` | entités de groupe (vaisseaux), parties d'échecs, scénario                                                                                                                                                  | hors carte ; non importé (`group_entity_id` conservé) |
| `global_sounds/{r}`                                            | déclenchement d'un son ponctuel                                                                                                                                                                            | éphémère (realtime)                                   |

**Éphémère** (service realtime, jamais Postgres) : RTDB `rooms/{r}/cursors`, `bubbles`,
`stream` (partage d'écran WebRTC), mesures non permanentes (effacées après 6 s), position
d'un token **pendant** le drag, tracé en cours, `global_sounds`. Seul l'état final est écrit
en base (un `token.moved` par déplacement).

## Modèle

Toutes les tables portent `campaign_id` ; chaque élément référence sa carte par
`(map_id, campaign_id)` (clé étrangère composite) : un élément ne peut pas pointer vers la
carte d'une autre campagne. Supprimer une carte supprime ses éléments (cascade).

| Table              | Géométrie              | Notes                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map_groups`       | —                      | dossiers de scènes                                                                                                                                                                                                                                               |
| `maps`             | `spawn` Point          | scène ; `is_default` (un par campagne) = fond global ; `width/height` du fond (taille du monde) ; `layers` jsonb (réglage d'affichage, `display` dans l'API) ; `fog_full` ; `weather` jsonb                                                                      |
| `map_settings`     | —                      | une ligne par campagne : échelle, unité, ombres, mode donjon, `party_map_id` (scène du groupe), musique                                                                                                                                                          |
| `map_layers`       | —                      | calques du MJ (0018) : `name`, `sort_order` (réel, du bas vers le haut), `visible_to_players`, `locked`, `opacity`, `role` (`ground`, `objects`, `tokens` : calque par défaut d'une sorte, un par carte)                                                         |
| `map_tokens`       | `pos` Point            | un personnage **engagé** (FK `campaign_characters`) sur une carte ; `present` : une seule carte à la fois par personnage (index unique partiel), les autres lignes gardent la dernière position sur chaque scène (legacy `positions[cityId]`) ; `layer_id` + `z` |
| `map_objects`      | `pos` Point            | coin haut gauche, `width/height/rotation` (autour du centre) ; `layer_id` + `z` ; `items` typés ; `searchable`, `search_radius` (unités) ; `is_background` : legacy, sert au calque par défaut (Sol) à l'insertion                                               |
| `map_lights`       | `pos` Point            | `radius` en unités (× `pixels_per_unit`), `color`, `intensity`, `falloff`, `attached_token_id` (token de la même carte, FK composite)                                                                                                                            |
| `map_obstacles`    | `geom` LineString      | `kind` : `wall`, `one_way_wall`, `door`, `window` ; `is_open`, `is_locked`, `blocks_from` (`left`/`right`, relatif au tracé), `opacity` (1 : opaque) ; `direction` obsolète (0017)                                                                               |
| `map_rooms`        | `geom` Polygon         | pièces (0017) : contour fermé, `name`                                                                                                                                                                                                                            |
| `map_fog_zones`    | `geom` Polygon         | zones de brouillard (0017) : `shape` (`circle`, `rect`, `polygon`), `mode` (`fog`, `clear`), `center` + `radius` (cercle ; `geom` en est l'approximation), `seq` (ordre d'application), `created_by`                                                             |
| `map_drawings`     | `geom` LineString      | `tool`, couleur, épaisseur ; `created_by` ; `layer_id` (nul : annotation) + `z`                                                                                                                                                                                  |
| `map_notes`        | `pos` Point            | texte, couleur, police ; `created_by` ; `layer_id` (nul : annotation) + `z`                                                                                                                                                                                      |
| `map_music_zones`  | `pos` Point + `radius` | cercle : `ST_DWithin(pos, point, radius)`                                                                                                                                                                                                                        |
| `map_portals`      | `pos` Point + `radius` | `kind` `scene_change`/`same_map`, `target_map_id`, `target` Point                                                                                                                                                                                                |
| `map_measurements` | `geom` LineString      | gabarit permanent (`shape`, origine → extrémité, options)                                                                                                                                                                                                        |
| `map_fog`          | —                      | obsolète (0017) : ancien brouillard par cases (`full_map`, `cells`), converti en zones ; plus lu ni écrit                                                                                                                                                        |

Invariants tenus par la base (déclencheurs de 0018), quel que soit l'écrivain (service, import) :
une carte naît avec « Sol », « Objets » et « Personnages » ; un token ou un objet inséré sans
calque va dans le calque de son rôle (objet `is_background` : Sol ; sans calque de ce rôle, le
plus haut) ; un élément inséré sans `z` va en haut de son calque (`campaign.map_layer_top_z`).

**Migration 0017** (sans perte) : les cases `map_fog.cells` deviennent des zones `polygon`
(union des cases, sommets alignés retirés ; chaque trou devient une zone du mode inverse posée
juste après) ; avec `full_map`, `maps.fog_full` passe à vrai et les cases, qui étaient les cases
**découvertes** (rendu de l'ancienne carte), deviennent des zones `clear`. `direction` des murs à
sens unique devient `blocks_from` (normale du premier segment orientée vers `direction`, nord par
défaut ; côté gauche du tracé : `cross(b − a, p − a) < 0`). Le contenu des objets (`LootItem`)
devient typé, ses autres champs rangés dans `legacy`. **Migration 0018** : trois calques par
carte existante, objets `is_background` → Sol, autres objets → Objets, tokens → Personnages,
`z` dans l'ordre de création.

Chaque ligne a un `version` (verrou optimiste facultatif, `409 version_conflict`).

## Visibilité (côté serveur)

Le MJ voit tout. Pour un joueur ou un spectateur, le serveur reprend
`utils/visibility-checks.ts` avant de répondre (remplacé par `@vtt/vision` au lot 2,
[carte.md](carte.md) § 9) :

- calques masqués aux joueurs (`visible_to_players = false`) : ni le calque ni son contenu
  (tokens, objets, dessins, textes) ne sont envoyés, en REST, sur le bus ou au rejeu ; exception :
  les tokens de ses propres personnages ;
- tokens `invisible` : jamais envoyés ; `custom` : seulement aux joueurs dont un personnage est
  dans `visible_to` ; personnages joueurs et `ally` : toujours ;
- ligne de vue (si l'affichage des obstacles est actif) : caché si le segment entre chacun de mes
  tokens et la cible coupe un mur opaque (`opacity` 1), une porte fermée, ou un mur à sens unique
  vu depuis son côté bloquant (premier segment) ; fenêtres et murs translucides laissent voir ;
- éclairé par une lumière allumée (`ST_DWithin`, rayon en unités ; une lumière attachée est là
  où est son token) : visible ;
- dans le brouillard (ou `hidden`) : visible seulement dans le rayon de vision d'un de mes tokens
  ou d'un allié (`ST_DWithin`). Un point est sous le brouillard si la dernière zone qui le couvre
  (`seq`) est `fog`, ou, sans zone, si `maps.fog_full` ;
- objets `hidden` et lumières, portails éteints (`visible = false`) : MJ seulement ;
- cartes : celles `visible_to_players` et celle où se trouve un de mes personnages.

Écart assumé jusqu'au lot 2 : les pièces fermées ne sont pas encore appliquées côté serveur, et
le contenu d'un objet visible (`items`) est lu par les joueurs qui voient l'objet (« Fouiller »
n'est qu'un geste d'interface, la prise est vérifiée par le serveur).

## Événements (outbox, sujet `vtt.<campaignId>.<domaine>.<action>`)

| Domaine                                                                         | Actions                                               | Visibilité                                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `map`                                                                           | `created`, `updated`, `deleted`, `hidden`, `rescaled` | `public` si `visible_to_players`, sinon `gm_only` ; `imported` (import) : `gm_only`           |
| `map_group`                                                                     | `created`, `updated`, `deleted`                       | `gm_only`                                                                                     |
| `map_settings`                                                                  | `updated`                                             | `public`                                                                                      |
| `map_layer`                                                                     | `created`, `updated`, `deleted`, `hidden`             | `public` si visible des joueurs, sinon `gm_only` ; masqué : `hidden` public                   |
| `token`                                                                         | `created`, `updated`, `moved`, `deleted`, `hidden`    | `public` : joueur, `ally`, ou `visible` hors brouillard, hors calque masqué ; sinon `gm_only` |
| `map_object`, `map_light`, `map_portal`                                         | `created`, `updated`, `deleted`, `hidden`             | `gm_only` pour les éléments cachés (`hidden`, `custom`, éteints, calque masqué)               |
| `map_object`                                                                    | `searched`, `looted`                                  | `gm_only` (le MJ est prévenu d'une fouille et d'une prise)                                    |
| `map_obstacle`, `map_room`, `map_fog_zone`, `map_music_zone`, `map_measurement` | `created`, `updated`, `deleted`                       | `public`                                                                                      |
| `map_note`                                                                      | `created`, `updated`, `deleted`, `hidden`             | `public`, sauf dans un calque masqué                                                          |
| `map_drawing`                                                                   | `created`, `updated`, `deleted`, `cleared`, `hidden`  | `public`, sauf dans un calque masqué                                                          |

- Charges : `MapEventPayloads` du contrat (`packages/contracts/src/map.ts`).
- `token.moved` : un seul événement par déplacement (fin de drag, voyage entre scènes),
  `{ tokenId, characterId, from: { mapId, x, y } | null, to: { mapId, x, y } }` ; `public` si le
  token est visible au départ ou à l'arrivée.
- Un élément qui devient caché (visibilité, calque masqué) produit l'événement complet en
  `gm_only` **et** un `<domaine>.hidden` public `{ id, mapId }` pour que les clients joueurs le
  retirent. Un calque masqué produit `map_layer.hidden` : les joueurs retirent aussi son contenu.
- `custom` : événement `gm_only`, `visibleTo` (ids de personnages) dans le payload, et
  `visibleToUsers` (propriétaires et incarnateurs de ces personnages, ajoutés par `mapEvent`)
  que realtime utilise pour envoyer l'événement à ces joueurs en plus des MJ ; jamais pour un
  élément d'un calque masqué ni pour une autre visibilité ; les tokens `hidden` restent
  `gm_only` : les clients joueurs relisent `GET …/tokens` (filtré) quand un de leurs tokens bouge.
- `map_drawing.cleared` : `{ mapId, ids }` (effacement groupé) ; `map_settings.updated` (réglages
  complets) est aussi émis quand le groupe change de scène (`partyMapId`).
- `map.rescaled` : `{ mapId, sx, sy, version }`, après `map.updated` : les clients relisent la
  carte (les éléments n'ont pas d'événement propre).
- PNJ posés : `campaign.character_added` en `gm_only` (le nom d'un PNJ caché ne fuit pas), puis
  `token.created`.

## Import Firebase

```sh
CHARACTER_DATABASE_URL=… IDENTITY_DATABASE_URL=… \
node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js maps \
  --export ~/vtt-export --rtdb ~/vtt-export/rtdb-rooms.json \
  --report ~/vtt-export/rapport-cartes.ndjson [--importer]
```

- après comptes, personnages et campagnes ; simulation par défaut, `--importer` pour écrire ;
  la sortie ne donne que des compteurs, le détail est dans le rapport (0600) ;
- `--rtdb` : JSON de la Realtime Database, soit l'export complet de la console Firebase,
  soit `{ "rooms": { "<code>": { positions, obstacles, drawings, notes, measurements, music, _migrations } } }`
  (lecture seule, par exemple `firebase database:get /rooms`) ; `tools/firebase-export` ne sait
  pas encore l'exporter. Sans lui : positions Firestore seulement, ni murs, ni dessins, ni textes
  récents, ni musique ;
- salle basculée sur la RTDB (`_migrations.drawings_obstacles_notes`) : les copies Firestore
  (`text`, `obstacles`, `drawings`) sont ignorées, elles sont périmées ;
- identifiants stables : UUID (SHA-1, version 5) du chemin legacy (`cartes/{r}/cities/{id}`,
  `rooms/{r}/obstacles/{id}`, `cartes/{r}/characters/{id}#{cityId}` pour un token…) ; un import
  rejoué n'ajoute que ce qui manque (`ON CONFLICT DO NOTHING`) : à ne pas relancer après la
  bascule, un élément supprimé depuis reviendrait ;
- médias sur Firebase Storage et images `data:` (fonds, tokens, objets, sons) copiés dans le
  stockage S3 (`src/import/images.ts`, 50 Mo, images, vidéos webm/mp4, sons) ; les autres URL
  (assets.yner.fr, R2, chemins relatifs) sont gardées ;
- un token n'est créé que pour un personnage importé **et** engagé dans la campagne ; les ids de
  `visibleToPlayerIds` sont traduits (`characters.legacy_ids`) ; un joueur a un token présent sur
  sa scène (`currentSceneId`, sinon celle du groupe) et un token mémorisé par autre scène connue ;
- non importés (avertissements du rapport) : combat de scène, rapports d'attaque, parties
  d'échecs, scénario, entités de groupe, mesures éphémères ;
- modèle de la refonte (`src/import/maps/legacy-model.ts`, mêmes règles que 0017) : `direction`
  des murs à sens unique → `blocksFrom`, contenu des objets typé, brouillard par cases écrit dans
  `map_fog` puis converti en zones dans la même transaction ; calques créés avec chaque carte et
  contenu rangé par les déclencheurs (objets `isBackground` → Sol).
