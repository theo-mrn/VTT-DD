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

| Table                   | Géométrie              | Notes                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map_groups`            | —                      | dossiers de scènes                                                                                                                                                                                                                                               |
| `maps`                  | `spawn` Point          | scène ; `is_default` (un par campagne) = fond global ; `width/height` du fond (taille du monde) ; `layers` jsonb (réglage d'affichage, `display` dans l'API) ; `fog_full` ; `weather` jsonb                                                                      |
| `map_settings`          | —                      | une ligne par campagne : échelle, unité, ombres, mode donjon, `party_map_id` (scène du groupe), musique                                                                                                                                                          |
| `map_layers`            | —                      | calques du MJ (0018) : `name`, `sort_order` (réel, du bas vers le haut), `visible_to_players`, `locked`, `opacity`, `role` (`ground`, `objects`, `tokens` : calque par défaut d'une sorte, un par carte)                                                         |
| `map_tokens`            | `pos` Point            | un personnage **engagé** (FK `campaign_characters`) sur une carte ; `present` : une seule carte à la fois par personnage (index unique partiel), les autres lignes gardent la dernière position sur chaque scène (legacy `positions[cityId]`) ; `layer_id` + `z` |
| `map_objects`           | `pos` Point            | coin haut gauche, `width/height/rotation` (autour du centre) ; `layer_id` + `z` ; `items` typés ; `searchable`, `search_radius` (unités) ; `is_background` : legacy, sert au calque par défaut (Sol) à l'insertion                                               |
| `map_lights`            | `pos` Point            | `radius` en unités (× `pixels_per_unit`), `color`, `intensity`, `falloff`, `attached_token_id` (token de la même carte, FK composite)                                                                                                                            |
| `map_obstacles`         | `geom` LineString      | `kind` : `wall`, `one_way_wall`, `door`, `window` ; `is_open`, `is_locked`, `blocks_from` (`left`/`right`, relatif au tracé), `opacity` (1 : opaque) ; `direction` obsolète (0017)                                                                               |
| `map_rooms`             | `geom` Polygon         | pièces (0017) : contour fermé, `name`                                                                                                                                                                                                                            |
| `map_fog_zones`         | `geom` Polygon         | zones de brouillard (0017) : `shape` (`circle`, `rect`, `polygon`), `mode` (`fog`, `clear`), `center` + `radius` (cercle ; `geom` en est l'approximation), `seq` (ordre d'application), `created_by`                                                             |
| `map_drawings`          | `geom` LineString      | `tool`, couleur, épaisseur ; `created_by` ; `layer_id` (nul : annotation) + `z`                                                                                                                                                                                  |
| `map_notes`             | `pos` Point            | texte, couleur, police, `rotation` (degrés, autour de `pos`) ; `created_by` ; `layer_id` (nul : annotation) + `z`                                                                                                                                                |
| `map_music_zones`       | `pos` Point + `radius` | cercle : `ST_DWithin(pos, point, radius)`                                                                                                                                                                                                                        |
| `map_portals`           | `pos` Point + `radius` | `kind` `scene_change`/`same_map`, `target_map_id`, `target` Point, `auto`, `linked_portal_id` (retour relié, même campagne, 0022)                                                                                                                                |
| `map_measurements`      | `geom` LineString      | gabarit permanent (`shape`, origine → extrémité, options)                                                                                                                                                                                                        |
| `map_explorations`      | —                      | mémoire de l'exploration (0031, [exploration.md](exploration.md)) : `(map_id, scope)` clé, `scope` `party`, `cols × rows` cases, `cells` bytea (8 cases par octet), `version` ; `maps.exploration` (`off`, `party`) l'active par scène                           |
| `map_exploration_queue` | —                      | scènes à explorer (0031) : une ligne par scène, écrite dans la transaction qui change la vue, vidée par le travailleur du service après le `COMMIT` (`SKIP LOCKED`)                                                                                              |
| `map_fog`               | —                      | obsolète (0017) : ancien brouillard par cases (`full_map`, `cells`), converti en zones ; plus lu ni écrit                                                                                                                                                        |

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

Le MJ voit tout. Pour un joueur ou un spectateur, le service filtre avec `@vtt/vision`, le même
paquet que le rendu du navigateur ([carte.md](carte.md) § 9 ; règles :
`backend/campaign/src/modules/maps/vision-rules.ts`, miroir exact de
`frontend/src/lib/map/features/vision/engine/rules.ts`) :

- calques masqués aux joueurs (`visible_to_players = false`) : ni le calque ni son contenu
  (tokens, objets, dessins, textes) ne sont envoyés, en REST, sur le bus ou au rejeu ; exception :
  les tokens de ses propres personnages ;
- tokens `invisible` : jamais envoyés ; `custom` : seulement aux joueurs dont un personnage est
  dans `visible_to` ; personnages joueurs, ses propres tokens et `ally` : toujours ;
- observateurs d'un joueur : ses tokens (possédés ou incarnés) et les `ally` hors calque masqué,
  rayon `vision_radius` (déjà triplé par « Vision augmentée ») ;
- un PNJ `visible` est envoyé s'il est vu : `Vu(joueur) = ⋃ Vu(O)`, ligne de vue (murs opaques,
  portes fermées, sens unique vus de leur côté bloquant, murs soudés sans fuite), pièces fermées
  (de dedans on ne voit pas dehors, de dehors pas dedans), brouillard (dans une zone, seulement
  dans un rayon de vision ou éclairé ; les zones s'appliquent par `seq`, en partant de
  `maps.fog_full`), lumières (rayon × `pixels_per_unit`, coupé par les murs ; une lumière
  attachée est là où est son token). Un token est vu si l'un de ses 9 points (centre et 8 points
  à 0,7 × rayon, rayon = `pixels_per_unit × scale × token_scale / 2`) l'est ;
- un PNJ `hidden` n'est vu que dans un rayon de vision ou une zone éclairée (même formule, toute
  la carte sous le brouillard) ;
- objets : `hidden` jamais, `custom` pour les joueurs visés, `decor` toujours (l'obscurité le
  couvre), les autres s'ils sont vus (centre, coins et milieux des bords du rectangle tourné) ;
  leur contenu (`items`) n'est **jamais** envoyé à un joueur (`[]`), seule la fouille le donne ;
- sans observateur sur la carte (spectateur, personnage ailleurs) : vue « d'en haut », hors
  brouillard et hors pièces fermées, plus les zones éclairées, sans ombre de mur ;
- réglage d'affichage `obstacles: false` (MJ) : murs et pièces sans effet, comme avant ;
- lumières et portails éteints (`visible = false`) : MJ seulement ;
- cartes : celles `visible_to_players` et celle où se trouve un de mes personnages.

Scène préparée en mémoire par carte (LRU de 64 cartes) sous une empreinte relue à chaque appel :
version de la carte et condensé des `(id, version)` des obstacles, pièces et zones. Toute
écriture, d'où qu'elle vienne (autre réplique, import, mise à l'échelle), change l'empreinte ;
une scène lue dans une transaction d'écriture sert sans être gardée. Lumières, tokens, calques
masqués et échelle sont relus à chaque appel. Le chargement garde le filtre `bbox` sur les index
GiST.

## Événements (outbox, sujet `vtt.<campaignId>.<domaine>.<action>`)

| Domaine                                                                         | Actions                                               | Visibilité                                                                                                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `map`                                                                           | `created`, `updated`, `deleted`, `hidden`, `rescaled` | `public` si `visible_to_players`, sinon `gm_only` ; `imported` (import) : `gm_only`                                                |
| `map_group`                                                                     | `created`, `updated`, `deleted`                       | `gm_only`                                                                                                                          |
| `map_settings`                                                                  | `updated`                                             | `public`                                                                                                                           |
| `map_layer`                                                                     | `created`, `updated`, `deleted`, `hidden`             | `public` si visible des joueurs, sinon `gm_only` ; masqué : `hidden` public                                                        |
| `map`                                                                           | `visibility_changed`                                  | ciblé : `public` si tous les joueurs, sinon `gm_only` + `visibleToUsers`                                                           |
| `token`                                                                         | `created`, `updated`, `moved`, `deleted`, `hidden`    | routés joueur par joueur (ci-dessous) : `public` si tous le voient, sinon `gm_only` + `visibleToUsers`                             |
| `map_object`                                                                    | `created`, `updated`, `deleted`, `hidden`             | routés joueur par joueur, sans contenu ; le contenu part aux MJ seuls                                                              |
| `map_light`, `map_portal`                                                       | `created`, `updated`, `deleted`, `hidden`             | `gm_only` pour les éléments cachés (éteints)                                                                                       |
| `map_portal`                                                                    | `used`                                                | `gm_only` (le MJ est prévenu du passage) ; `created`/`updated` d'un portail visible : complet `gm_only`, sans destination `public` |
| `map_object`                                                                    | `searched`, `looted`                                  | `gm_only` (le MJ est prévenu d'une fouille et d'une prise)                                                                         |
| `map_obstacle`, `map_room`, `map_fog_zone`, `map_music_zone`, `map_measurement` | `created`, `updated`, `deleted`                       | `public`                                                                                                                           |
| `map_note`                                                                      | `created`, `updated`, `deleted`, `hidden`             | `public`, sauf dans un calque masqué                                                                                               |
| `map_drawing`                                                                   | `created`, `updated`, `deleted`, `cleared`, `hidden`  | `public`, sauf dans un calque masqué                                                                                               |

- Charges : `MapEventPayloads` du contrat (`packages/contracts/src/map.ts`).
- `token.moved` : un seul événement par déplacement (fin de drag, voyage entre scènes),
  `{ tokenId, characterId, from: { mapId, x, y } | null, to: { mapId, x, y } }`.
- **Routage joueur par joueur** ([carte.md](carte.md) § 9, Serveur) de `token.created`,
  `token.updated`, `token.moved`, `token.deleted` et `map_object.*` : la visibilité est calculée
  pour chaque membre non MJ avant et après l'écriture (`vision.ts`). Ceux qui voient l'élément
  après reçoivent l'événement complet (`public` s'ils le voient tous, sinon `gm_only` avec
  `visibleToUsers`) ; ceux qui le voyaient avant et plus après reçoivent `<domaine>.hidden
{ id, mapId }` (public s'ils le perdent tous). Un token qui change de carte : `token.hidden`
  de l'ancien token à ceux qui le voyaient. Un joueur qui reçoit `token.moved` d'un token
  inconnu relit ses tokens.
- **Contenu des objets** : un objet avec des `items` produit deux événements de même version :
  l'un complet, `gm_only` sans `visibleToUsers` (les MJ seuls), l'autre avec `items: []` pour ceux
  qui le voient (le client du MJ garde le premier, version égale). Sans contenu, un seul.
- **`map.visibility_changed { mapId }`** : un mur, une porte, une pièce, une zone de brouillard
  ou une lumière change (champs qui comptent pour la vue), `fogFull`, la taille ou l'occlusion de
  la carte changent, un observateur ou une torche bouge (ses joueurs : propriétaire et
  incarnateur, ou tous pour un allié ou une torche) : ces joueurs relisent tokens et objets. Au
  plus un par joueur, par carte et par transaction.
- Un élément qui devient caché (visibilité, calque masqué) produit l'événement complet en
  `gm_only` **et** un `<domaine>.hidden` public `{ id, mapId }` pour que les clients joueurs le
  retirent. Un calque masqué produit `map_layer.hidden` : les joueurs retirent aussi son contenu.
- `custom` : les joueurs visés sont ceux dont un personnage est dans `visibleTo` (propriétaires et
  incarnateurs) ; realtime suit `visibleToUsers` pour envoyer un événement `gm_only` à ces
  joueurs en plus des MJ ; jamais pour un élément d'un calque masqué (sauf ses propres tokens).
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
