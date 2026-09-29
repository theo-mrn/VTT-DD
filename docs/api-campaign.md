# API du service campaign

Le service campaign gère les campagnes (les « salles » de l'ancienne app) :

- leurs membres et leurs rôles, les invitations, les bannissements ;
- le système de règles de la campagne ;
- les personnages engagés dans la campagne et le personnage incarné par chaque membre ;
- les sessions prévues et la discussion ;
- l'état de combat : initiative, tours, durées.

La carte (scènes, tokens, brouillard, lumières, murs, objets…) est dans le même service : voir [api-map.md](api-map.md).
Les notes privées et partagées (le Grimoire) aussi : voir [api-notes.md](api-notes.md).

Toutes les routes publiques passent par la gateway (`/v1/campaigns/*`) et demandent un jeton d'accès. Corps et réponses sont en JSON, champs en anglais (camelCase) ; les erreurs suivent le format `application/problem+json` de la plateforme, avec un `code` en anglais (snake_case). Une campagne dont l'appelant n'est pas membre est introuvable (404 `campaign_not_found`) : son existence n'est pas révélée. Un membre sans le rôle requis reçoit 403.

## Campagnes et membres

| Méthode | Route                                        | Corps                                                                                                  | Réponse                                                                                                                                                                                                                                         |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns?role=`                        | —                                                                                                      | mes campagnes (résumés enrichis, voir plus bas), les plus récemment modifiées d'abord ; `role` (`gm`, `player`, `spectator`) filtre sur mon rôle exact                                                                                          |
| GET     | `/v1/campaigns/public?search=&page=`         | —                                                                                                      | `{ campaigns, page, perPage: 20, total }` : campagnes publiques, les plus récemment modifiées d'abord ; `search` cherche dans le nom, la description, ou le code exact                                                                          |
| POST    | `/v1/campaigns`                              | `{ name, systemId, description?, isPublic?, characterCreation?, pitch?, accent?, tags?, imageUrl? }`   | 201 et la campagne ; le créateur est MJ propriétaire ; un `code` est généré ; défauts : privée, création permise, accent `gold` ; `imageUrl` : `null` ou une image de la bibliothèque (voir Images) ; 400 `unknown_system`, `invalid_image`     |
| GET     | `/v1/campaigns/:id`                          | —                                                                                                      | détail de la campagne (membres)                                                                                                                                                                                                                 |
| PATCH   | `/v1/campaigns/:id`                          | `{ name?, description?, systemId?, isPublic?, characterCreation?, pitch?, accent?, tags?, imageUrl? }` | MJ ; `imageUrl` : `null`, la valeur actuelle, une image de la bibliothèque, ou une URL rendue par `POST /image` pour cette campagne (sinon 400 `invalid_image`) ; 409 `characters_engaged` pour changer de système avec des personnages engagés |
| POST    | `/v1/campaigns/:id/code`                     | —                                                                                                      | la campagne (MJ) avec un nouveau `code` : l'ancien ne permet plus de rejoindre ; `campaign.updated` (`code`, `changes`)                                                                                                                         |
| DELETE  | `/v1/campaigns/:id`                          | —                                                                                                      | 204 ; MJ propriétaire seulement ; membres, invitations, engagements, sessions, messages et combat disparaissent avec elle                                                                                                                       |
| POST    | `/v1/campaigns/:id/image`                    | `{ contentType, size }`                                                                                | `{ uploadUrl, publicUrl, expiresIn }` (MJ) ; PNG, JPEG, WebP ou GIF, 5 Mo au plus ; envoyer le fichier par `PUT uploadUrl`, puis `PATCH { imageUrl: publicUrl }` ; 503 `storage_unavailable` sans stockage                                      |
| PATCH   | `/v1/campaigns/:id/members/:userId`          | `{ role: 'gm' \| 'player' \| 'spectator' }`                                                            | MJ ; le propriétaire reste MJ (409 `owner`)                                                                                                                                                                                                     |
| DELETE  | `/v1/campaigns/:id/members/:userId?ban=true` | —                                                                                                      | 204 ; le MJ exclut un membre, `ban` l'empêche de revenir (400 `cannot_ban_self`) ; un membre se retire lui-même pour quitter ; le propriétaire ne part pas (409 `owner`)                                                                        |
| GET     | `/v1/campaigns/:id/bans`                     | —                                                                                                      | `[{ userId, name, avatarUrl, bannedBy, bannedAt }]` (MJ)                                                                                                                                                                                        |
| DELETE  | `/v1/campaigns/:id/bans/:userId`             | —                                                                                                      | 204 ; lève le bannissement (MJ) ; 404 si l'utilisateur n'est pas banni                                                                                                                                                                          |

Rôles :

- `gm` : tous les droits sur la campagne et ses personnages (plusieurs MJ possibles : co-MJ) ;
- `player` : ses propres personnages ;
- `spectator` : lecture seule, n'engage ni n'incarne de personnage.

Quand un membre part (ou est exclu), ses personnages quittent la campagne et le combat en cours.

### Champs d'une campagne

| Champ               | Sens (ancien champ Firestore `Salle/{code}`)                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| `name`              | titre (`title`), 100 caractères au plus                                              |
| `description`       | description, 2 000 caractères au plus                                                |
| `system`            | `{ id, version }` : système de règles de la campagne (`gameSystemId`)                |
| `code`              | code court affiché et partagé, unique, généré à la création (id du document `Salle`) |
| `imageUrl`          | image de la campagne, envoyée par URL présignée comme l'avatar (`imageUrl`)          |
| `isPublic`          | visible dans la liste des campagnes en ligne (`isPublic`)                            |
| `characterCreation` | les joueurs peuvent créer leur fiche dans la campagne (`allowCharacterCreation`)     |
| `pitch`             | accroche d'une ligne, 160 caractères au plus (nouveau)                               |
| `accent`            | couleur d'accent : `gold`, `ember`, `arcane`, `sylvan`, `frost`, `blood` (nouveau)   |
| `tags`              | genres (« Horreur », « Enquête »…), sans doublon, 10 au plus de 40 caractères        |
| `playerCount`       | membres qui ne sont pas MJ (spectateurs compris) ; aucune limite de joueurs          |
| `owner`             | `{ id, name, avatarUrl }` : MJ propriétaire (profil public d'identity)               |

Précisions :

- `code` : 6 caractères parmi `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (base32 sans 0, O, 1 ni I). La saisie est tolérante (minuscules, espaces et tirets ignorés). Les codes à 6 chiffres des campagnes importées restent valides.
- Résumé (campagnes publiques, invitations reçues) : `{ id, name, description, system, code, imageUrl, isPublic, characterCreation, pitch, accent, tags, playerCount, owner, updatedAt, role, memberCount }`. `role` vaut `null` si l'appelant n'est pas membre ; `memberCount` compte tous les membres, MJ compris.
- Mes campagnes (`GET /v1/campaigns`) : le résumé, plus ce que les listes affichent sans charger le détail : `members` (les 5 premiers membres, MJ d'abord, `{ userId, name, avatarUrl, role }`), `nextSession` (`{ id, date, title }` ou `null`), `playedCharacterId` (le personnage que j'incarne) et `characterIds` (tous les personnages engagés). Quatre requêtes en base pour toute la liste.
- Détail (`GET /v1/campaigns/:id`, et réponse des routes qui modifient la campagne) : les champs du résumé sans `memberCount`, plus `ownerId`, `role` (celui de l'appelant), `playedCharacterId` (le personnage que l'appelant incarne, ou `null`), `members: [{ userId, name, avatarUrl, role }]`, `characters: [{ characterId, ownerId, side, addedBy, playedBy }]` (pour un joueur ou un spectateur, les mêmes engagements que `GET /characters` : camp des joueurs, les siens, PNJ dont un token lui est visible), `combat?` (voir Combat), `invitees` (invitations nominatives en attente, pour le MJ seulement : `[{ userId, name, avatarUrl, invitedBy, invitedAt }]`, vide pour les autres), `version` et `createdAt`.

### Images

`imageUrl` n'accepte jamais une URL arbitraire (elle serait affichée aux autres joueurs : pistage, contenu tiers). Deux sources :

- une image **envoyée** : `POST /v1/campaigns/:id/image`, puis `PATCH { imageUrl: publicUrl }` ;
- une image de la **bibliothèque du produit** (couvertures proposées par le front) : une URL `https` sous `PRESET_IMAGES_URL` (défaut `https://assets.yner.fr/` ; vide : désactivée), sans identifiants, requête, fragment ni `..`. Seule source possible à la création, l'envoi demandant une campagne existante.

### Réglages de table

Décidés par le MJ pour toute la table, versionnés à part de la campagne (modifier un réglage n'entre pas en conflit avec une modification du titre).

| Méthode | Route                        | Corps                                                           | Réponse                                                                                                                                                                                                                                 |
| ------- | ---------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/settings` | —                                                               | `{ version, dice: { hiddenAttributes }, rules: { options }, updatedAt }` (membres) ; `version` 0 et défauts tant que le MJ n'a rien réglé                                                                                               |
| PATCH   | `/v1/campaigns/:id/settings` | `{ version, dice?: { hiddenAttributes }, rules?: { options } }` | les réglages (MJ) ; `version` : celle lue, sinon 409 `version_conflict` ; 400 `not_rollable` pour une clé qui ne sert pas aux jets dans le système, `unknown_option` pour une option qu'il ne déclare pas ; `campaign.settings_updated` |

- `dice.hiddenAttributes` : attributs retirés du lanceur de dés (200 au plus, doublons ignorés). Seuls les attributs dont les règles déclarent `jet` sont proposés (docs/regles.md, « Attributs jetables ») : le MJ ne peut qu'en retirer, jamais en ajouter. Après un changement de système, une clé qui ne sert plus aux jets est ignorée à la lecture.
- `rules.options` : règles optionnelles du système (`options` de `systeme.yaml`, voir [regles-optionnelles.md](regles-optionnelles.md)), allumées ou éteintes pour la campagne : `{ encombrement: true }`. Seuls les écarts au `defaut` du système sont gardés (une option remise à son défaut disparaît). Le PATCH règle les options envoyées, les autres gardent leur valeur. Après un changement de système, une option qu'il ne déclare pas est ignorée à la lecture.
- Stockage : table `campaign_settings` (document `jsonb` validé par Zod, clés inconnues ignorées). Pas de migration : les deux réglages vivent dans le même document.

## Invitations et adhésion

| Méthode | Route                                | Corps                      | Réponse                                                                                                                                                                                            |
| ------- | ------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/campaigns/:id/invitations`      | `{ expiresIn?, maxUses? }` | 201 `{ code, url, expiresAt, maxUses }` (MJ) : lien `<APP_URL>/join/<code>` ; `expiresIn` en secondes (7 jours par défaut, de 60 s à 30 jours), `maxUses` de 1 à 100 (10 par défaut)               |
| POST    | `/v1/campaigns/join`                 | `{ code }`                 | la campagne (détail) ; code d'invitation (`inv_…`) **ou** code de campagne (publique ou privée) ; refus 404 `campaign_not_found`, 403 `banned`, 410 `invitation_expired` / `invitation_exhausted`  |
| POST    | `/v1/campaigns/:id/join`             | —                          | la campagne (détail) ; rejoindre sans code une campagne **publique**, ou une campagne où l'on est **invité nominativement** ; sinon 404 `campaign_not_found` (existence non révélée), 403 `banned` |
| POST    | `/v1/campaigns/:id/invitees`         | `{ userIds }` (1 à 20)     | la campagne (MJ) ; invite nominativement ; membres et déjà invités ignorés ; 409 `user_banned` (levez d'abord le bannissement), 409 `too_many_invitees` (50 en attente au plus)                    |
| DELETE  | `/v1/campaigns/:id/invitees/:userId` | —                          | 204 ; le MJ annule une invitation, ou l'invité la décline (`userId` = lui-même) ; 404 sans invitation                                                                                              |
| GET     | `/v1/campaigns/invited`              | —                          | campagnes où l'appelant est invité : résumés plus `invitedBy` (`{ id, name, avatarUrl }`) et `invitedAt`, les plus récentes d'abord                                                                |

Seule l'empreinte SHA-256 du code d'invitation est stockée : le code n'est renvoyé qu'à sa création. Une campagne privée n'apparaît pas dans les campagnes publiques et reste introuvable (404) pour qui n'en est pas membre : on la rejoint seulement par un lien d'invitation, par son code, ou par une invitation nominative. Un membre qui rejoint devient `player` ; déjà membre, la campagne est renvoyée telle quelle, sans consommer d'utilisation. `POST /join` est limité par IP (`RATE_LIMIT_JOIN_MAX` tentatives par minute).

Deux sortes d'invitations :

- **liens** (`POST /:id/invitations`) : valent pour qui détient le code, avec expiration et nombre d'utilisations ;
- **nominatives** (`POST /:id/invitees`) : un utilisateur précis (un ami), qui voit l'invitation (`GET /invited`), la décline ou rejoint par `POST /:id/join`. Rejoindre par n'importe quel moyen efface l'invitation nominative.

Les campagnes publiques (`GET /public`) donnent leur `code` (comme l'ancienne app) ; le front les rejoint pourtant par `POST /:id/join`, qui ne dépend pas du code et reste valable s'il change.

## Sessions prévues et discussion

| Méthode | Route                                              | Corps                   | Réponse                                                                                                                                                                                                         |
| ------- | -------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/sessions`                       | —                       | prochaines sessions `[{ id, date, title }]`, par date croissante (membres) ; une session passée n'est plus listée                                                                                               |
| POST    | `/v1/campaigns/:id/sessions`                       | `{ date, title? }`      | 201 et la session (MJ) ; `date` ISO 8601 avec fuseau, dans le futur (400 `date_in_past`) ; titre de 100 caractères au plus ; 50 sessions à venir au plus (409 `too_many_sessions`)                              |
| DELETE  | `/v1/campaigns/:id/sessions/:sessionId`            | —                       | 204 (MJ)                                                                                                                                                                                                        |
| GET     | `/v1/campaigns/:id/messages?before=&after=&limit=` | —                       | messages lisibles par l'appelant `[Message]`, du plus ancien au plus récent (membres)                                                                                                                           |
| GET     | `/v1/campaigns/:id/messages/:messageId`            | —                       | le message (membres qui le lisent ; 404 `message_not_found` sinon)                                                                                                                                              |
| POST    | `/v1/campaigns/:id/messages`                       | `{ body, recipients? }` | 201 et le message (membres) ; 1 000 caractères au plus ; 20 messages par minute et par membre, sinon 429 `too_many_messages` (en-tête `retry-after` : secondes avant qu'un message sorte de la fenêtre, 1 à 60) |
| PATCH   | `/v1/campaigns/:id/messages/:messageId`            | `{ body }`              | 200 et le message modifié (`editedAt`) ; l'auteur seul (403 `not_author`, même pour le MJ) ; un texte identique ne change rien                                                                                  |
| DELETE  | `/v1/campaigns/:id/messages/:messageId`            | —                       | 204 ; auteur ou MJ, parmi ceux qui lisent le message                                                                                                                                                            |

`Message` : `{ id, author: { id, name, avatarUrl }, body, recipients, createdAt, editedAt }`. `editedAt` vaut `null` tant que l'auteur n'a pas modifié son texte.

**Chuchotements.** `recipients` absent ou `null` : toute la table. Sinon `{ gm?: boolean, userIds?: [userId] }` (50 membres au plus) : le message est lu par son auteur, les membres listés, et les MJ de la campagne si `gm` vaut vrai (ceux du moment de la lecture : un joueur promu MJ lit les messages adressés au MJ). Le MJ n'a pas d'autre droit : un chuchotement entre joueurs ne lui est pas montré, comme dans l'ancienne app. Un chuchotement a au moins un destinataire (400 `recipients_required`) ; chaque destinataire est un membre de la campagne, jamais l'auteur (422 `invalid_recipient`). La réponse donne `recipients: { gm, users: [{ id, name, avatarUrl }] }`, ou `null`.

Un message que l'appelant ne lit pas est introuvable (404), y compris pour le MJ. Les listes et le rattrapage n'en renvoient jamais.

Lecture paginée :

- sans curseur : les `limit` derniers messages (50 par défaut, 100 au plus) ;
- `before=<id>` : la page précédente, plus ancienne que ce message ;
- `after=<id>` : les messages arrivés après ce message (rattrapage après une coupure du temps réel). `before` et `after` ne se combinent pas.

Le temps réel (`campaign.message_*`, voir [Événements](#événements)) ne porte jamais le texte : le client relit la suite de la liste (`after`) ou le message (`GET /messages/:messageId`).

## Personnages de la campagne

Les personnages restent dans le service character. Campaign enregistre seulement leur **engagement** dans une campagne, avec un camp (`side`), et le membre qui l'incarne :

| Méthode | Route                                       | Corps                                                        | Réponse                                                                                                                                                    |
| ------- | ------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/characters?kind=`        | —                                                            | personnages engagés : `[{ characterId, name, avatarUrl, type, kind, side, ownerId, playedBy, inCreation, summary }]` (membres) ; `kind=pc` ou `npc` filtre |
| POST    | `/v1/campaigns/:id/characters`              | `{ characterId, side?: 'players' \| 'enemies' \| 'allies' }` | 201 et la campagne ; engage un de mes personnages (le MJ engage ainsi ses PNJ)                                                                             |
| DELETE  | `/v1/campaigns/:id/characters/:characterId` | —                                                            | 204 ; retire le personnage (le MJ, ou son propriétaire si aucun autre membre ne l'incarne : 409 `character_played` sinon), et le sort du combat en cours   |
| PUT     | `/v1/campaigns/:id/me/character`            | `{ characterId: string \| null }`                            | la liste des personnages engagés (comme `GET /characters`) ; `null` libère le personnage incarné                                                           |

Règles de l'engagement :

- on n'engage que ses propres personnages, du système de la campagne : le personnage d'un autre est introuvable (404), un autre système est refusé (422 `system_mismatch`), un doublon aussi (409 `already_engaged`) ;
- camp par défaut : `players` pour un joueur, `enemies` pour le MJ ; seul le MJ engage des `enemies` ; un spectateur n'engage rien ;
- character injoignable : 502 `character_unavailable`, rien n'est engagé.

Dans `GET /characters`, `name`, `avatarUrl`, `type`, `kind` (`pc` personnage joueur, `npc` PNJ) et `summary` (résumé des listes : `{ tagline, highlights }`, voir [api-character.md](api-character.md)) viennent de character : ils valent `null` si character est injoignable ou si le personnage n'existe plus. `inCreation` vaut `true` tant que la fiche est en cours de création. Le paramètre `kind` ne garde que les personnages dont character confirme la nature : un personnage dont character ne donne pas le résumé en est exclu (il reste dans la liste sans filtre). Le choix du personnage (`/campagnes/:id/personnage`) lit `?kind=pc`.

Un joueur ou un spectateur ne voit dans cette liste (et dans la réponse de `PUT /me/character`) que les personnages du camp des joueurs, les siens (possédés ou incarnés) et les PNJ dont un token lui est visible sur une carte qu'il voit, selon le filtre de la carte ([api-map.md](api-map.md)) : le nom d'un PNJ caché ne fuit pas. Le MJ voit tout. Un PNJ qui apparaît au joueur sur la carte y entre à la relecture suivante de la liste.

Retirer un personnage retire aussi ses tokens de toutes les cartes, avec un `token.deleted { id, mapId, characterId }` par token, public si le token était visible des joueurs, réservé aux MJ sinon (comme `DELETE …/tokens/:tokenId`).

Personnage incarné (ancien `users/{uid}.persoId`) :

- un membre incarne au plus un personnage par campagne : en choisir un autre libère l'ancien ;
- un joueur incarne n'importe quel personnage du camp `players` (le sien ou celui d'un autre joueur) ou un de ses personnages ; le MJ incarne n'importe quel personnage engagé (PNJ ou personnage de joueur) ;
- pas de verrou (depuis 2026-09-28, comme l'ancienne app) : un personnage incarné par un autre membre se choisit quand même, il le lui reprend (l'autre n'incarne plus rien) ; l'événement le dit dans `takenFrom` ;
- un seul personnage actif, pas de possession (depuis 2026-09-28) : la fiche d'un personnage engagé s'écrit par le membre qui l'incarne et par le MJ ; les autres membres, son propriétaire compris, la lisent seulement. Le propriétaire garde la main hors campagne et pendant la création ; lui seul supprime le personnage (droits de character, voir [api-character.md](api-character.md#droits)) ;
- un joueur ne termine en combat que le tour du personnage qu'il incarne (403 sinon) ;
- refus : 404 `character_not_engaged`, 403 pour un PNJ d'un autre (camps `enemies` et `allies`) ou pour un spectateur ;
- le personnage est libéré quand son membre quitte la campagne ou devient spectateur.

« Créer un nouveau personnage » dans une campagne : le front crée le personnage dans character (`POST /v1/characters`, système de la campagne), l'engage (`POST /v1/campaigns/:id/characters`), l'incarne, puis ouvre la création (`/characters/:id/creation?campaign=<id>`).

Règle de `characterCreation` : un personnage « créé pour l'occasion » est un personnage dont la création est en cours (`etat.creation` vrai dans character). Si `characterCreation` est faux, un joueur qui tente de l'engager reçoit 403 `character_creation_forbidden` ; il peut toujours engager un personnage terminé du bon système. Le MJ n'est pas concerné.

Campaign lit cet état dans le résumé interne de character (`GET /internal/characters/:id`, champ `creation`). Tant que character ne renvoie pas ce champ, il vaut `false` et la règle ne bloque rien.

### Routes internes

Protégées par `INTERNAL_API_SECRET` (en-tête `x-internal-secret`, vérifié avant toute validation) et jamais relayées par la gateway. Sans secret configuré, elles n'existent pas.

- `GET /internal/characters/:characterId/campaigns-of?userId=` → `{ read, write, engaged, plays, playedByOther, campaigns: [{ campaignId, role, playedBy }] }` : utilisée par character pour ses droits. `read` : membre d'une campagne où le personnage est engagé ; `write` : il y est MJ ou il y incarne le personnage (`played_by`) ; `engaged` : engagé dans au moins une campagne, que l'utilisateur en soit membre ou non (hors campagne, son propriétaire garde la main) ; `plays` : il l'incarne ; `playedByOther` : un autre membre l'incarne quelque part (la suppression est alors refusée) ; `campaigns` : les campagnes où il est engagé et dont l'utilisateur est membre, avec leur incarnateur. Character garde la réponse quelques secondes en cache ; une panne de campaign n'ouvre aucun droit.
- `GET /internal/campaigns/:campaignId/rights?userId=&characterId=` → `{ member, role, character?: { engaged, side, read, write } }` : les droits d'un utilisateur dans une campagne donnée, et sur un personnage engagé (lecture : membre ; écriture : MJ ou membre qui l'incarne ; l'exception de la création est décidée par character).
- `GET /internal/characters/:characterId/rules` → `{ campaignId, options }` : règles optionnelles réglées dans la campagne du personnage (écarts au défaut, comme `rules.options`), pour le calcul de sa fiche par character. Engagé dans plusieurs campagnes, la première où il l'a été fait foi ; engagé nulle part : `{ campaignId: null, options: {} }`.

## Combat

L'état de combat vit dans la campagne. Il n'y a qu'un combat actif par campagne.

| Méthode | Route                                 | Corps                                                             | Réponse                                                                                                                                                                                                                   |
| ------- | ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/campaigns/:id/combat`            | `{ participants: [characterId], mode?: 'individual' \| 'slots' }` | 201 ; démarre le combat (MJ) ; participants engagés (422 `character_not_engaged`), sans doublon (400 `duplicate_participant`) ; 409 `combat_in_progress`                                                                  |
| POST    | `/v1/campaigns/:id/combat/initiative` | `{ params?: { [characterId]: {...} } }`                           | le serveur lance l'action d'initiative du système pour chaque participant (via character) et trie selon les clés rendues. À égalité parfaite : camp `players` d'abord, puis ordre stable (MJ)                             |
| POST    | `/v1/campaigns/:id/combat/next`       | `{ characterId? }` (obligatoire pour un joueur en mode `slots`)   | passe au participant ou au créneau suivant ; un joueur ne termine que le tour du personnage qu'il incarne (403 sinon, 409 `not_their_turn`, 400 `character_required`). En fin de round, décompte les durées via character |
| POST    | `/v1/campaigns/:id/combat/end`        | —                                                                 | 204 ; termine le combat (MJ)                                                                                                                                                                                              |
| GET     | `/v1/campaigns/:id/combat`            | —                                                                 | l'état du combat (membres) ; 404 sans combat                                                                                                                                                                              |

État du combat : `{ id, round, mode, order: [{ characterId, side, sortKeys, hasActed }], currentIndex, slots?: [{ side }], initiativeRolled, version }`. `currentIndex` est l'index du participant (mode `individual`) ou du créneau (mode `slots`) dont c'est le tour.

Le mode vaut `individual` par défaut ; le MJ passe `mode: 'slots'` pour Star Wars : l'ordre devient une suite de créneaux par camp, et pendant un créneau, n'importe quel participant du camp qui n'a pas encore agi peut agir. `/combat/next` renvoie aussi, en fin de round, `durationUpdates: [{ characterId, expired }]` (états arrivés à 0) et `durationFailures` (personnages injoignables). L'initiative refusée par les règles donne 422 `initiative_rejected` ; un système sans initiative, 422 `no_initiative`.

## Événements

Écrits dans l'outbox du service, dans la transaction de la donnée. Sujet NATS `vtt.<campaignId>.<domaine>.<action>` (champ `roomId` de l'enveloppe commune), agrégat `campaign` ou `combat`.

- `campaign.created`, `campaign.updated` (champs envoyés, et diff avant/après `changes`, voir [bus.md](bus.md#diff-avantaprès-changes)), `campaign.deleted`
- `campaign.invitation_created` (visible du MJ seulement : `invitationId`, `expiresAt`, jamais le code)
- `campaign.member_joined` (`invitationId`, `byCampaignCode`, `byInvitee` ou `publicCampaign` selon le moyen), `campaign.member_left` (`kicked`, `banned`), `campaign.member_role_changed` (`previousRole`)
- `campaign.member_invited` (`userId`) et `campaign.invitee_removed` (`userId`, `declined`) : invitations nominatives, visibles du MJ seulement
- `campaign.member_unbanned` (visible du MJ seulement)
- `campaign.character_added` (public dans le camp des joueurs ; hors de lui, `gm_only`, plus son propriétaire s'il n'est pas le MJ : le nom d'un PNJ ne fuit pas), `campaign.character_removed` (`reason: 'member_left'` au départ d'un membre), `campaign.character_played` (`previousCharacterId`, `takenFrom` : membre à qui le personnage a été repris, ou `null`)
- `campaign.session_scheduled`, `campaign.session_cancelled`
- `campaign.settings_updated` (`version`, `dice`, `rules`, et diff avant/après `changes`)
- `campaign.message_posted`, `campaign.message_updated` (`editedAt`), `campaign.message_deleted` : `{ id, authorId, recipients }` (`recipients` : `null`, ou `{ gm, userIds }`), **jamais le texte** (le journal history est en ajout seul : il ne fige pas ce qu'un joueur a écrit puis effacé). Message public : `public` ; chuchotement : `gm_only` + `visibleToUsers` (l'auteur et les membres destinataires). Le MJ reçoit donc l'id et les destinataires d'un chuchotement entre joueurs, sans pouvoir le lire ; `recipients.gm` dit au client si le message lui est adressé
- `combat.started`, `combat.turn_changed` (`reason` : `initiative`, `next`, `new_round`, `participants_removed`), `combat.ended`

## Base de données

Schéma `campaign` (Liquibase, `backend/campaign/db`) : `campaigns`, `campaign_members`, `campaign_invitations`, `campaign_invitees` (invitations nominatives, `0011-campaign-invitees.sql`), `campaign_bans`, `campaign_sessions`, `campaign_messages`, `campaign_characters`, `campaign_combats`, `campaign_combat_participants`, `legacy_ids`, `outbox`, `inbox`. Les tables `rooms`/`room_*` d'origine ont été renommées par le changeset `0005-campaigns.sql` (colonnes en anglais, rôles `gm`/`player`/`spectator`, camps `players`/`enemies`/`allies`, modes `individual`/`slots`). `0006-drop-max-players.sql` retire la limite de joueurs ; `0010-campaign-presentation.sql` ajoute `pitch`, `accent` et `tags`. `0016-message-whispers.sql` ajoute aux messages leurs destinataires (`whisper_recipients`, `whisper_gm`) et `edited_at`.

## Migration

Import des campagnes Firebase : `backend/campaign/src/import/`, lancé par `pnpm import:campaigns` (simulation par défaut, `--importer` pour écrire, `--sans-export` pour réutiliser l'export). Il passe **après** les comptes (`pnpm import:firebase`) et les personnages (`pnpm import:personnages --importer`) : il réutilise leurs exports (`Salle`, `users`, `cartes`, `gameSystems`) et n'exporte que `salles` (membres). Exports et rapport NDJSON (`rapport-campagnes.ndjson`) dans `~/vtt-export`, hors du dépôt. La CLI sous-jacente prend `--export`, `--report` et `--dry-run`.

| Ancien (Firestore)                                                            | Nouveau                                                                                                                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Salle/{code}` (id du document)                                               | `campaigns.code` : le code à 6 chiffres est gardé (nouveau code s'il est pris ou invalide)                                                                      |
| `title`, `description`                                                        | `name` (« Campagne {code} » à défaut), `description` (bornés à 100 et 2 000 caractères)                                                                         |
| `imageUrl`                                                                    | `image_url` tel quel : le fichier reste sur Firebase Storage (avertissement)                                                                                    |
| `gameSystemId` (+ `gameSystems/{id}.name`)                                    | `system_id` : `dnd-classic`, Star Wars ou Noobliés d'après le nom, sinon d'après les personnages, D&D à défaut                                                  |
| `creatorId`                                                                   | `owner_id`, membre `gm`                                                                                                                                         |
| `users/{uid}/rooms/{code}`, `users/{uid}.room_id`, `salles/{code}/Noms/{uid}` | `campaign_members` : `gm` pour le créateur seul ; les autres, y compris ceux entrés « MJ » dans l'ancienne app, sont `player` (le créateur les promeut ensuite) |
| `bannedUsers`                                                                 | `campaign_bans` (banni par le propriétaire) ; un banni n'est pas membre                                                                                         |
| `cartes/{code}/characters/{id}`                                               | `campaign_characters` : camp `players` si `type` vaut « joueurs », `enemies` sinon                                                                              |
| `users/{uid}.persoId` (campagne active), sinon `Noms.nom` = `Nomperso`        | `played_by` (un incarnateur par personnage, sans verrou)                                                                                                        |
| `Salle/{code}/sessions` (`date`)                                              | `campaign_sessions` (créées par le propriétaire, sans titre)                                                                                                    |
| `Salle/{code}/chat` (`uid`, `text`, `timestamp`)                              | `campaign_messages` (id UUIDv7 à la date d'envoi, `body` borné à 1 000 caractères)                                                                              |

Correspondances : UID Firebase → compte par `identity.legacy_ids` (lecture, rôle `identity_svc`), chemin du personnage → personnage par `characters.legacy_ids` (lecture, rôle `characters_svc`). Un membre, banni ou auteur sans compte migré est ignoré, un personnage non importé ou d'un autre système n'est pas engagé : chaque cas est un avertissement du rapport. Une campagne dont le créateur n'a pas de compte migré est confiée à un autre MJ, sinon ignorée (`no-account`).

Chaque campagne est écrite dans une transaction avec son événement `campaign.created` (acteur `system`, `payload.imported: true`) et son lien `legacy_ids` (`firebase`, `Salle/{code}`). Rejouable : une campagne déjà importée est ignorée en entier (les membres arrivés depuis ne sont pas ajoutés). La discussion de la carte (`rooms/{code}/chat`) n'est pas importée ici.
