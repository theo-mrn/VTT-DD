# API du service campaign

Le service campaign gère les campagnes (les « salles » de l'ancienne app) :

- leurs membres et leurs rôles, les invitations, les bannissements ;
- le système de règles de la campagne ;
- les personnages engagés dans la campagne et le personnage incarné par chaque membre ;
- les sessions prévues et la discussion ;
- l'état de combat : initiative, tours, durées.

La carte (brouillard, lumières, objets) viendra dans une tranche suivante, dans le même service.

Toutes les routes publiques passent par la gateway (`/v1/campaigns/*`) et demandent un jeton d'accès. Corps et réponses sont en JSON, champs en anglais (camelCase) ; les erreurs suivent le format `application/problem+json` de la plateforme, avec un `code` en anglais (snake_case). Une campagne dont l'appelant n'est pas membre est introuvable (404 `campaign_not_found`) : son existence n'est pas révélée. Un membre sans le rôle requis reçoit 403.

## Campagnes et membres

| Méthode | Route                                        | Corps                                                                                       | Réponse                                                                                                                                                                                                           |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns?role=`                        | —                                                                                           | mes campagnes (résumés, voir plus bas), les plus récemment modifiées d'abord ; `role` (`gm`, `player`, `spectator`) filtre sur mon rôle exact                                                                     |
| GET     | `/v1/campaigns/public?search=&page=`         | —                                                                                           | `{ campaigns, page, perPage: 20, total }` : campagnes publiques, les plus récemment modifiées d'abord ; `search` cherche dans le nom, la description, ou le code exact                                            |
| POST    | `/v1/campaigns`                              | `{ name, systemId, description?, maxPlayers?, isPublic?, characterCreation? }`              | 201 et la campagne ; le créateur est MJ propriétaire ; un `code` est généré ; défauts : 4 joueurs, privée, création permise ; 400 `unknown_system`                                                                |
| GET     | `/v1/campaigns/:id`                          | —                                                                                           | détail de la campagne (membres)                                                                                                                                                                                   |
| PATCH   | `/v1/campaigns/:id`                          | `{ name?, description?, systemId?, maxPlayers?, isPublic?, characterCreation?, imageUrl? }` | MJ ; `imageUrl` : `null`, la valeur actuelle, ou une URL rendue par `POST /image` pour cette campagne (sinon 400 `invalid_image`) ; 409 `characters_engaged` pour changer de système avec des personnages engagés |
| DELETE  | `/v1/campaigns/:id`                          | —                                                                                           | 204 ; MJ propriétaire seulement ; membres, invitations, engagements, sessions, messages et combat disparaissent avec elle                                                                                         |
| POST    | `/v1/campaigns/:id/image`                    | `{ contentType, size }`                                                                     | `{ uploadUrl, publicUrl, expiresIn }` (MJ) ; PNG, JPEG, WebP ou GIF, 5 Mo au plus ; envoyer le fichier par `PUT uploadUrl`, puis `PATCH { imageUrl: publicUrl }` ; 503 `storage_unavailable` sans stockage        |
| PATCH   | `/v1/campaigns/:id/members/:userId`          | `{ role: 'gm' \| 'player' \| 'spectator' }`                                                 | MJ ; le propriétaire reste MJ (409 `owner`)                                                                                                                                                                       |
| DELETE  | `/v1/campaigns/:id/members/:userId?ban=true` | —                                                                                           | 204 ; le MJ exclut un membre, `ban` l'empêche de revenir (400 `cannot_ban_self`) ; un membre se retire lui-même pour quitter ; le propriétaire ne part pas (409 `owner`)                                          |
| GET     | `/v1/campaigns/:id/bans`                     | —                                                                                           | `[{ userId, name, avatarUrl, bannedBy, bannedAt }]` (MJ)                                                                                                                                                          |
| DELETE  | `/v1/campaigns/:id/bans/:userId`             | —                                                                                           | 204 ; lève le bannissement (MJ) ; 404 si l'utilisateur n'est pas banni                                                                                                                                            |

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
| `maxPlayers`        | nombre de joueurs maximum, MJ non compris, de 1 à 50 (`maxPlayers`, défaut 4)        |
| `isPublic`          | visible dans la liste des campagnes en ligne (`isPublic`)                            |
| `characterCreation` | les joueurs peuvent créer leur fiche dans la campagne (`allowCharacterCreation`)     |
| `playerCount`       | places occupées : membres qui ne sont pas MJ (spectateurs compris)                   |
| `isFull`            | `playerCount >= maxPlayers`                                                          |
| `owner`             | `{ id, name, avatarUrl }` : MJ propriétaire (profil public d'identity)               |

Précisions :

- `code` : 6 caractères parmi `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (base32 sans 0, O, 1 ni I). La saisie est tolérante (minuscules, espaces et tirets ignorés). Les codes à 6 chiffres des campagnes importées restent valides.
- Résumé (listes) : `{ id, name, description, system, code, imageUrl, maxPlayers, isPublic, characterCreation, playerCount, isFull, owner, updatedAt, role, memberCount }`. `role` vaut `null` si l'appelant n'est pas membre ; `memberCount` compte tous les membres, MJ compris.
- Détail (`GET /v1/campaigns/:id`, et réponse des routes qui modifient la campagne) : les mêmes champs sans `memberCount`, plus `ownerId`, `role` (celui de l'appelant), `playedCharacterId` (le personnage que l'appelant incarne, ou `null`), `members: [{ userId, name, avatarUrl, role }]`, `characters: [{ characterId, ownerId, side, addedBy, playedBy }]`, `combat?` (voir Combat), `version` et `createdAt`.

## Invitations et adhésion

| Méthode | Route                           | Corps                      | Réponse                                                                                                                                                                                                                |
| ------- | ------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/campaigns/:id/invitations` | `{ expiresIn?, maxUses? }` | 201 `{ code, url, expiresAt, maxUses }` (MJ) : lien `<APP_URL>/join/<code>` ; `expiresIn` en secondes (7 jours par défaut, de 60 s à 30 jours), `maxUses` de 1 à 100 (10 par défaut)                                   |
| POST    | `/v1/campaigns/join`            | `{ code }`                 | la campagne (détail) ; code d'invitation (`inv_…`) **ou** code de campagne (publique ou privée) ; refus 404 `campaign_not_found`, 403 `banned`, 410 `invitation_expired` / `invitation_exhausted`, 409 `campaign_full` |

Seule l'empreinte SHA-256 du code d'invitation est stockée : le code n'est renvoyé qu'à sa création. Une campagne privée n'apparaît pas dans les campagnes publiques et reste introuvable (404) pour qui n'en est pas membre : on la rejoint seulement par une invitation ou par son code. Un membre qui rejoint devient `player` ; déjà membre, la campagne est renvoyée telle quelle, sans consommer d'utilisation. `POST /join` est limité par IP (`RATE_LIMIT_JOIN_MAX` tentatives par minute).

## Sessions prévues et discussion

| Méthode | Route                                              | Corps              | Réponse                                                                                                                                                                            |
| ------- | -------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/sessions`                       | —                  | prochaines sessions `[{ id, date, title }]`, par date croissante (membres) ; une session passée n'est plus listée                                                                  |
| POST    | `/v1/campaigns/:id/sessions`                       | `{ date, title? }` | 201 et la session (MJ) ; `date` ISO 8601 avec fuseau, dans le futur (400 `date_in_past`) ; titre de 100 caractères au plus ; 50 sessions à venir au plus (409 `too_many_sessions`) |
| DELETE  | `/v1/campaigns/:id/sessions/:sessionId`            | —                  | 204 (MJ)                                                                                                                                                                           |
| GET     | `/v1/campaigns/:id/messages?before=&after=&limit=` | —                  | messages `[{ id, author: { id, name, avatarUrl }, body, createdAt }]`, du plus ancien au plus récent (membres)                                                                     |
| POST    | `/v1/campaigns/:id/messages`                       | `{ body }`         | 201 et le message (membres) ; 1 000 caractères au plus ; 20 messages par minute et par membre, sinon 429 `too_many_messages` (en-tête `retry-after`)                               |
| DELETE  | `/v1/campaigns/:id/messages/:messageId`            | —                  | 204 ; auteur ou MJ                                                                                                                                                                 |

Lecture des messages, en polling en attendant le service realtime :

- sans curseur : les `limit` derniers messages (50 par défaut, 100 au plus) ;
- `before=<id>` : la page précédente, plus ancienne que ce message ;
- `after=<id>` : les messages arrivés après ce message (polling). `before` et `after` ne se combinent pas.

## Personnages de la campagne

Les personnages restent dans le service character. Campaign enregistre seulement leur **engagement** dans une campagne, avec un camp (`side`), et le membre qui l'incarne :

| Méthode | Route                                       | Corps                                                        | Réponse                                                                                                         |
| ------- | ------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/characters`              | —                                                            | personnages engagés : `[{ characterId, name, avatarUrl, type, side, ownerId, playedBy, inCreation }]` (membres) |
| POST    | `/v1/campaigns/:id/characters`              | `{ characterId, side?: 'players' \| 'enemies' \| 'allies' }` | 201 et la campagne ; engage un de mes personnages (le MJ engage ainsi ses PNJ)                                  |
| DELETE  | `/v1/campaigns/:id/characters/:characterId` | —                                                            | 204 ; retire le personnage (son propriétaire ou le MJ), et le sort du combat en cours                           |
| PUT     | `/v1/campaigns/:id/me/character`            | `{ characterId: string \| null }`                            | la liste des personnages engagés (comme `GET /characters`) ; `null` libère le personnage incarné                |

Règles de l'engagement :

- on n'engage que ses propres personnages, du système de la campagne : le personnage d'un autre est introuvable (404), un autre système est refusé (422 `system_mismatch`), un doublon aussi (409 `already_engaged`) ;
- camp par défaut : `players` pour un joueur, `enemies` pour le MJ ; seul le MJ engage des `enemies` ; un spectateur n'engage rien ;
- character injoignable : 502 `character_unavailable`, rien n'est engagé.

Dans `GET /characters`, `name`, `avatarUrl` et `type` viennent de character : ils valent `null` si character est injoignable ou si le personnage n'existe plus. `inCreation` vaut `true` tant que la fiche est en cours de création.

Personnage incarné (ancien `users/{uid}.persoId`) :

- un membre incarne au plus un personnage par campagne : en choisir un autre libère l'ancien ;
- un joueur incarne un de ses personnages engagés ; le MJ incarne n'importe quel personnage engagé (PNJ ou personnage de joueur) ;
- refus : 409 `character_taken` s'il est incarné par un autre membre, 404 `character_not_engaged`, 403 pour le personnage d'un autre joueur ou pour un spectateur ;
- le personnage est libéré quand son membre quitte la campagne ou devient spectateur.

« Créer un nouveau personnage » dans une campagne : le front crée le personnage dans character (`POST /v1/characters`, système de la campagne), l'engage (`POST /v1/campaigns/:id/characters`), l'incarne, puis ouvre la création (`/characters/:id/creation?campaign=<id>`).

Règle de `characterCreation` : un personnage « créé pour l'occasion » est un personnage dont la création est en cours (`etat.creation` vrai dans character). Si `characterCreation` est faux, un joueur qui tente de l'engager reçoit 403 `character_creation_forbidden` ; il peut toujours engager un personnage terminé du bon système. Le MJ n'est pas concerné.

Campaign lit cet état dans le résumé interne de character (`GET /internal/characters/:id`, champ `creation`). Tant que character ne renvoie pas ce champ, il vaut `false` et la règle ne bloque rien.

### Routes internes

Protégées par `INTERNAL_API_SECRET` (en-tête `x-internal-secret`, vérifié avant toute validation) et jamais relayées par la gateway. Sans secret configuré, elles n'existent pas.

- `GET /internal/characters/:characterId/campaigns-of?userId=` → `{ read, write, campaigns: [{ campaignId, role }] }` : utilisée par character pour savoir si un utilisateur est membre (lecture) ou MJ (écriture) d'une campagne où le personnage est engagé. Character garde la réponse quelques secondes en cache ; une panne de campaign n'ouvre aucun droit.
- `GET /internal/campaigns/:campaignId/rights?userId=&characterId=` → `{ member, role, character?: { engaged, side, read, write } }` : les droits d'un utilisateur dans une campagne donnée, et sur un personnage engagé (lecture : membre ; écriture : MJ ou propriétaire).

## Combat

L'état de combat vit dans la campagne. Il n'y a qu'un combat actif par campagne.

| Méthode | Route                                 | Corps                                                             | Réponse                                                                                                                                                                                              |
| ------- | ------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/campaigns/:id/combat`            | `{ participants: [characterId], mode?: 'individual' \| 'slots' }` | 201 ; démarre le combat (MJ) ; participants engagés (422 `character_not_engaged`), sans doublon (400 `duplicate_participant`) ; 409 `combat_in_progress`                                             |
| POST    | `/v1/campaigns/:id/combat/initiative` | `{ params?: { [characterId]: {...} } }`                           | le serveur lance l'action d'initiative du système pour chaque participant (via character) et trie selon les clés rendues. À égalité parfaite : camp `players` d'abord, puis ordre stable (MJ)        |
| POST    | `/v1/campaigns/:id/combat/next`       | `{ characterId? }` (obligatoire pour un joueur en mode `slots`)   | passe au participant ou au créneau suivant ; un joueur ne termine que le tour de son personnage (409 `not_their_turn`, 400 `character_required`). En fin de round, décompte les durées via character |
| POST    | `/v1/campaigns/:id/combat/end`        | —                                                                 | 204 ; termine le combat (MJ)                                                                                                                                                                         |
| GET     | `/v1/campaigns/:id/combat`            | —                                                                 | l'état du combat (membres) ; 404 sans combat                                                                                                                                                         |

État du combat : `{ id, round, mode, order: [{ characterId, side, sortKeys, hasActed }], currentIndex, slots?: [{ side }], initiativeRolled, version }`. `currentIndex` est l'index du participant (mode `individual`) ou du créneau (mode `slots`) dont c'est le tour.

Le mode vaut `individual` par défaut ; le MJ passe `mode: 'slots'` pour Star Wars : l'ordre devient une suite de créneaux par camp, et pendant un créneau, n'importe quel participant du camp qui n'a pas encore agi peut agir. `/combat/next` renvoie aussi, en fin de round, `durationUpdates: [{ characterId, expired }]` (états arrivés à 0) et `durationFailures` (personnages injoignables). L'initiative refusée par les règles donne 422 `initiative_rejected` ; un système sans initiative, 422 `no_initiative`.

## Événements

Écrits dans l'outbox du service, dans la transaction de la donnée. Sujet NATS `vtt.<campaignId>.<domaine>.<action>` (champ `roomId` de l'enveloppe commune), agrégat `campaign` ou `combat`.

- `campaign.created`, `campaign.updated`, `campaign.deleted`
- `campaign.member_joined`, `campaign.member_left` (`kicked`, `banned`), `campaign.member_role_changed` (`previousRole`)
- `campaign.member_unbanned` (visible du MJ seulement)
- `campaign.character_added`, `campaign.character_removed` (`reason: 'member_left'` au départ d'un membre), `campaign.character_played` (`previousCharacterId`)
- `campaign.session_scheduled`, `campaign.session_cancelled`
- `campaign.message_posted`, `campaign.message_deleted`
- `combat.started`, `combat.turn_changed` (`reason` : `initiative`, `next`, `new_round`, `participants_removed`), `combat.ended`

## Base de données

Schéma `campaign` (Liquibase, `backend/campaign/db`) : `campaigns`, `campaign_members`, `campaign_invitations`, `campaign_bans`, `campaign_sessions`, `campaign_messages`, `campaign_characters`, `campaign_combats`, `campaign_combat_participants`, `legacy_ids`, `outbox`, `inbox`. Les tables `rooms`/`room_*` d'origine ont été renommées par le changeset `0005-campaigns.sql` (colonnes en anglais, rôles `gm`/`player`/`spectator`, camps `players`/`enemies`/`allies`, modes `individual`/`slots`).

## Migration

Import des campagnes Firebase : `backend/campaign/src/import/`, lancé par `pnpm import:campaigns` (simulation par défaut, `--importer` pour écrire, `--sans-export` pour réutiliser l'export). Il passe **après** les comptes (`pnpm import:firebase`) et les personnages (`pnpm import:personnages --importer`) : il réutilise leurs exports (`Salle`, `users`, `cartes`, `gameSystems`) et n'exporte que `salles` (membres). Exports et rapport NDJSON (`rapport-campagnes.ndjson`) dans `~/vtt-export`, hors du dépôt. La CLI sous-jacente prend `--export`, `--report` et `--dry-run`.

| Ancien (Firestore)                                                            | Nouveau                                                                                                                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Salle/{code}` (id du document)                                               | `campaigns.code` : le code à 6 chiffres est gardé (nouveau code s'il est pris ou invalide)                                                                      |
| `title`, `description`                                                        | `name` (« Campagne {code} » à défaut), `description` (bornés à 100 et 2 000 caractères)                                                                         |
| `maxPlayers`, `isPublic`, `allowCharacterCreation`                            | `max_players` (ramené entre 1 et 50, 4 à défaut), `is_public`, `character_creation`                                                                             |
| `imageUrl`                                                                    | `image_url` tel quel : le fichier reste sur Firebase Storage (avertissement)                                                                                    |
| `gameSystemId` (+ `gameSystems/{id}.name`)                                    | `system_id` : `dnd-classic`, Star Wars ou Noobliés d'après le nom, sinon d'après les personnages, D&D à défaut                                                  |
| `creatorId`                                                                   | `owner_id`, membre `gm`                                                                                                                                         |
| `users/{uid}/rooms/{code}`, `users/{uid}.room_id`, `salles/{code}/Noms/{uid}` | `campaign_members` : `gm` pour le créateur seul ; les autres, y compris ceux entrés « MJ » dans l'ancienne app, sont `player` (le créateur les promeut ensuite) |
| `bannedUsers`                                                                 | `campaign_bans` (banni par le propriétaire) ; un banni n'est pas membre                                                                                         |
| `cartes/{code}/characters/{id}`                                               | `campaign_characters` : camp `players` si `type` vaut « joueurs », `enemies` sinon                                                                              |
| `users/{uid}.persoId` (campagne active), sinon `Noms.nom` = `Nomperso`        | `played_by` (un joueur n'incarne que son propre personnage)                                                                                                     |
| `Salle/{code}/sessions` (`date`)                                              | `campaign_sessions` (créées par le propriétaire, sans titre)                                                                                                    |
| `Salle/{code}/chat` (`uid`, `text`, `timestamp`)                              | `campaign_messages` (id UUIDv7 à la date d'envoi, `body` borné à 1 000 caractères)                                                                              |

Correspondances : UID Firebase → compte par `identity.legacy_ids` (lecture, rôle `identity_svc`), chemin du personnage → personnage par `characters.legacy_ids` (lecture, rôle `characters_svc`). Un membre, banni ou auteur sans compte migré est ignoré, un personnage non importé ou d'un autre système n'est pas engagé : chaque cas est un avertissement du rapport. Une campagne dont le créateur n'a pas de compte migré est confiée à un autre MJ, sinon ignorée (`no-account`).

Chaque campagne est écrite dans une transaction avec son événement `campaign.created` (acteur `system`, `payload.imported: true`) et son lien `legacy_ids` (`firebase`, `Salle/{code}`). Rejouable : une campagne déjà importée est ignorée en entier (les membres arrivés depuis ne sont pas ajoutés). La discussion de la carte (`rooms/{code}/chat`) n'est pas importée ici.
