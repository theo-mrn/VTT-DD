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
| `cartes/{r}/fog/fog_{cityId}` · `fogData`                      | brouillard : `fullMapFog` + cases `"cx,cy"`                                                                                                                                                                | `map_fog`                                             |
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

| Table              | Géométrie              | Notes                                                                                                                                                                                                                                         |
| ------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map_groups`       | —                      | dossiers de scènes                                                                                                                                                                                                                            |
| `maps`             | `spawn` Point          | scène ; `is_default` (un par campagne) = fond global ; `width/height` de l'image (taille des cases de brouillard) ; `layers` jsonb ; `weather` jsonb                                                                                          |
| `map_settings`     | —                      | une ligne par campagne : échelle, unité, ombres, mode donjon, `party_map_id` (scène du groupe), musique                                                                                                                                       |
| `map_fog`          | —                      | `full_map` + `cells` (`"cx,cy"`), case = `round(min(width, height) / 20)` px (100 si inconnu)                                                                                                                                                 |
| `map_tokens`       | `pos` Point            | un personnage **engagé** (FK `campaign_characters`) sur une carte ; `present` : une seule carte à la fois par personnage (index unique partiel), les autres lignes gardent la dernière position sur chaque scène (legacy `positions[cityId]`) |
| `map_objects`      | `pos` Point            | coin haut gauche, `width/height/rotation`                                                                                                                                                                                                     |
| `map_lights`       | `pos` Point            | `radius` en unités (× `pixels_per_unit`)                                                                                                                                                                                                      |
| `map_obstacles`    | `geom` LineString      | `kind` : `wall`, `one_way_wall`, `door`, `window` ; `is_open`, `is_locked`, `direction`                                                                                                                                                       |
| `map_drawings`     | `geom` LineString      | `tool`, couleur, épaisseur ; `created_by`                                                                                                                                                                                                     |
| `map_notes`        | `pos` Point            | texte, couleur, police ; `created_by`                                                                                                                                                                                                         |
| `map_music_zones`  | `pos` Point + `radius` | cercle : `ST_DWithin(pos, point, radius)`                                                                                                                                                                                                     |
| `map_portals`      | `pos` Point + `radius` | `kind` `scene_change`/`same_map`, `target_map_id`, `target` Point                                                                                                                                                                             |
| `map_measurements` | `geom` LineString      | gabarit permanent (`shape`, origine → extrémité, options)                                                                                                                                                                                     |

Chaque ligne a un `version` (verrou optimiste facultatif, `409 version_conflict`).

## Visibilité (côté serveur)

Le MJ voit tout. Pour un joueur ou un spectateur, le serveur reprend
`utils/visibility-checks.ts` avant de répondre :

- tokens `invisible` : jamais envoyés ; `custom` : seulement aux joueurs dont un personnage est
  dans `visible_to` ; personnages joueurs et `ally` : toujours ;
- ligne de vue (si le calque obstacles est affiché) : caché si le segment entre chacun de mes
  tokens et la cible coupe un mur, un mur à sens unique ou une porte fermée (`ST_Intersects`) ;
- éclairé par une lumière allumée (`ST_DWithin`) : visible ;
- dans le brouillard (ou `hidden`) : visible seulement dans le rayon de vision d'un de mes tokens
  ou d'un allié (`ST_DWithin`, rayon + demi-diagonale de case) ;
- objets `hidden` et lumières, portails éteints (`visible = false`) : MJ seulement ;
- cartes : celles `visible_to_players` et celle où se trouve un de mes personnages.

Écart assumé : les ombres de pièce (`roomMode`) et le sens bloquant des murs à sens unique
ne sont pas modélisés côté serveur (un mur à sens unique bloque dans les deux sens).

## Événements (outbox, sujet `vtt.<campaignId>.<domaine>.<action>`)

| Domaine                                                                        | Actions                                            | Visibilité                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `map`                                                                          | `created`, `updated`, `deleted`, `imported`        | `public` si `visible_to_players`, sinon `gm_only`                         |
| `map_group`                                                                    | `created`, `updated`, `deleted`                    | `gm_only`                                                                 |
| `map_settings`                                                                 | `updated`                                          | `public`                                                                  |
| `map_fog`                                                                      | `updated`                                          | `public`                                                                  |
| `token`                                                                        | `created`, `updated`, `moved`, `deleted`, `hidden` | `public` si visible par tous (`visible`, `ally`, joueur), sinon `gm_only` |
| `map_object`, `map_light`, `map_portal`                                        | `created`, `updated`, `deleted`, `hidden`          | `gm_only` pour les éléments cachés                                        |
| `map_obstacle`, `map_drawing`, `map_note`, `map_music_zone`, `map_measurement` | `created`, `updated`, `deleted`                    | `public`                                                                  |

- `token.moved` : un seul événement par déplacement, `{ tokenId, characterId, from: { mapId, x, y }, to: { mapId, x, y } }`.
- Un élément qui devient caché produit l'événement complet en `gm_only` **et** un `<domaine>.hidden`
  public `{ id, mapId }` pour que les clients joueurs le retirent.
- `custom` : événement `gm_only`, `visibleTo` (ids de personnages) dans le payload pour une
  diffusion ciblée par realtime ; les tokens `hidden` restent `gm_only` : les clients joueurs
  relisent `GET …/tokens` (filtré) quand un de leurs tokens bouge.

## Import Firebase

`node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js maps --export ~/vtt-export --rtdb ~/vtt-export/rtdb-rooms.json --report ~/vtt-export/rapport-cartes.ndjson [--importer]`

- après comptes, personnages et campagnes ; simulation par défaut ;
- `--rtdb` : JSON de la Realtime Database (export complet de la console Firebase, ou objet
  `{ "rooms": { … } }`) ; sans lui, positions Firestore seulement et ni murs, ni dessins,
  ni textes récents, ni musique ;
- identifiants stables : UUID (SHA-1, version 5) du chemin legacy (`cartes/{r}/cities/{id}`,
  `rtdb:rooms/{r}/obstacles/{id}`…) : un import rejoué n'écrit rien de plus (`ON CONFLICT DO NOTHING`) ;
- médias sur Firebase Storage (fonds, images de tokens) copiés dans le stockage S3 par
  `src/import/images.ts` ; les autres URL (assets.yner.fr, chemins relatifs) sont gardées ;
- un token n'est créé que pour un personnage importé **et** engagé dans la campagne ;
  les ids de `visibleToPlayerIds` sont traduits (`characters.legacy_ids`).
