# API du service campaign

Le service campaign gère les salles de jeu :

- leurs membres et leurs rôles, les invitations ;
- le système de règles de la salle ;
- les personnages engagés dans la salle ;
- l'état de combat : initiative, tours, durées.

La carte (brouillard, lumières, objets) viendra dans une tranche suivante, dans le même service.

Toutes les routes passent par la gateway (`/v1/rooms/*`) et demandent un jeton d'accès.

## Salles et membres

| Méthode | Route                           | Corps                                        | Réponse                                                                                                       |
| ------- | ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/rooms`                     | —                                            | les salles dont je suis membre : `[{ id, nom, role, systeme: { id, version }, membres: n, updatedAt }]`       |
| POST    | `/v1/rooms`                     | `{ nom, systemeId, description? }`           | 201 et la salle ; le créateur est MJ                                                                          |
| GET     | `/v1/rooms/:id`                 | —                                            | `{ id, nom, description, systeme, membres: [{ userId, nom, avatarUrl, role }], personnages: [...], combat? }` |
| PATCH   | `/v1/rooms/:id`                 | `{ nom?, description?, systemeId? }`         | MJ seulement                                                                                                  |
| DELETE  | `/v1/rooms/:id`                 | —                                            | MJ propriétaire seulement                                                                                     |
| POST    | `/v1/rooms/:id/invitations`     | `{ expireDans?, utilisations? }`             | `{ code, url, expireLe }` : lien d'invitation (MJ)                                                            |
| POST    | `/v1/rooms/rejoindre`           | `{ code }`                                   | la salle ; l'appelant devient joueur                                                                          |
| PATCH   | `/v1/rooms/:id/membres/:userId` | `{ role: 'mj' \| 'joueur' \| 'spectateur' }` | MJ seulement                                                                                                  |
| DELETE  | `/v1/rooms/:id/membres/:userId` | —                                            | MJ, ou le membre lui-même pour quitter                                                                        |

Rôles :

- `mj` : tous les droits sur la salle et ses personnages ;
- `joueur` : ses propres personnages ;
- `spectateur` : lecture seule.

## Parité avec l'ancienne app (salles)

Champs d'une salle, en plus de `nom`, `description` et `systemeId` :

| Champ                 | Sens (ancien champ Firestore)                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `code`                | code court de la salle, affiché et partagé (« Code de la salle »), unique, généré à la création (id du document `Salle`) |
| `imageUrl`            | image de la salle, envoyée par URL présignée comme l'avatar (`imageUrl`)                                                 |
| `maxJoueurs`          | nombre de joueurs maximum, MJ non compris (`maxPlayers`, défaut 4)                                                       |
| `publique`            | visible dans la liste des campagnes en ligne (`isPublic`)                                                                |
| `creationPersonnages` | les joueurs peuvent créer leur fiche dans la salle (`allowCharacterCreation`)                                            |

Précisions :

- `code` : 6 caractères parmi `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (base32 sans 0, O, 1 ni I). La saisie est tolérante (minuscules, espaces et tirets ignorés). Les codes à 6 chiffres des salles importées restent valides.
- `maxJoueurs` : entier de 1 à 50.
- `joueurs` : membres qui ne sont pas MJ (spectateurs compris), c'est-à-dire les places occupées ; `complete` vaut `joueurs >= maxJoueurs`.
- Une salle en liste (mes salles, campagnes publiques) : `{ id, nom, description, role, systeme, code, imageUrl, maxJoueurs, publique, creationPersonnages, membres, joueurs, complete, proprietaire: { id, nom, avatarUrl }, updatedAt }`. `membres` est un nombre ; `role` vaut `null` si l'appelant n'est pas membre.
- Le détail `GET /v1/rooms/:id` porte les mêmes champs (sauf `membres`, qui reste la liste), plus `personnageIncarne` (le personnage que l'appelant incarne, ou `null`) et `incarnePar` sur chaque personnage.

| Méthode | Route                                       | Corps                                                                            | Réponse                                                                                                                                                                                                      |
| ------- | ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET     | `/v1/rooms?role=mj\|joueur\|spectateur`     | —                                                                                | mes salles (liste ci-dessus) ; `role` filtre sur mon rôle exact                                                                                                                                              |
| GET     | `/v1/rooms/publiques?search=&page=`         | —                                                                                | `{ salles, page, parPage: 20, total }` : campagnes publiques, les plus récemment modifiées d'abord ; `search` cherche dans le nom, la description, ou le code exact                                          |
| POST    | `/v1/rooms`                                 | `{ nom, systemeId, description?, maxJoueurs?, publique?, creationPersonnages? }` | 201 ; un `code` est généré ; défauts : 4 joueurs, privée, création permise                                                                                                                                   |
| PATCH   | `/v1/rooms/:id`                             | `{ ..., maxJoueurs?, publique?, creationPersonnages?, imageUrl? }`               | MJ ; `imageUrl` : `null`, la valeur actuelle, ou une URL rendue par `POST /image` pour cette salle (sinon 400 `image_invalide`)                                                                              |
| POST    | `/v1/rooms/:id/image`                       | `{ contentType, size }`                                                          | `{ uploadUrl, publicUrl, expiresIn }` (MJ) ; PNG, JPEG, WebP ou GIF, 5 Mo au plus ; envoyer le fichier par `PUT uploadUrl`, puis `PATCH { imageUrl: publicUrl }` ; 503 `stockage_indisponible` sans stockage |
| POST    | `/v1/rooms/rejoindre`                       | `{ code }`                                                                       | code d'invitation **ou** code de salle (publique ou privée) ; refus 404 `salle_introuvable`, 403 `banni`, 410 `invitation_expiree` / `invitation_epuisee`, 409 `salle_complete`                              |
| DELETE  | `/v1/rooms/:id/membres/:userId?bannir=true` | —                                                                                | 204 ; exclut le joueur ; `bannir` l'empêche de revenir (MJ ; 400 `bannir_soi_meme`)                                                                                                                          |
| GET     | `/v1/rooms/:id/bannis`                      | —                                                                                | `[{ userId, nom, avatarUrl, banniPar, banniLe }]` (MJ)                                                                                                                                                       |
| DELETE  | `/v1/rooms/:id/bannis/:userId`              | —                                                                                | 204 ; lève le bannissement (MJ) ; 404 si l'utilisateur n'est pas banni                                                                                                                                       |

Une salle privée n'apparaît pas dans les campagnes publiques et reste introuvable (404) pour qui n'en est pas membre : on la rejoint seulement par une invitation ou par son code. Un membre qui rejoint devient `joueur` ; déjà membre, la salle est renvoyée telle quelle.

### Sessions prévues et discussion

| Méthode | Route                                          | Corps              | Réponse                                                                                                                                                                          |
| ------- | ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/rooms/:id/sessions`                       | —                  | prochaines sessions `[{ id, date, titre }]`, par date croissante (membres) ; une session passée n'est plus listée                                                                |
| POST    | `/v1/rooms/:id/sessions`                       | `{ date, titre? }` | 201 et la session (MJ) ; `date` ISO 8601 avec fuseau, dans le futur (400 `date_passee`) ; titre de 100 caractères au plus ; 50 sessions à venir au plus (409 `trop_de_sessions`) |
| DELETE  | `/v1/rooms/:id/sessions/:sessionId`            | —                  | 204 (MJ)                                                                                                                                                                         |
| GET     | `/v1/rooms/:id/messages?avant=&apres=&limite=` | —                  | messages `[{ id, auteur: { id, nom, avatarUrl }, texte, createdAt }]`, du plus ancien au plus récent (membres)                                                                   |
| POST    | `/v1/rooms/:id/messages`                       | `{ texte }`        | 201 et le message (membres) ; 1 000 caractères au plus ; 20 messages par minute et par membre, sinon 429 `trop_de_messages` (en-tête `retry-after`)                              |
| DELETE  | `/v1/rooms/:id/messages/:messageId`            | —                  | 204 ; auteur ou MJ                                                                                                                                                               |

Lecture des messages, en polling en attendant le service realtime :

- sans curseur : les `limite` derniers messages (50 par défaut, 100 au plus) ;
- `avant=<id>` : la page précédente, plus ancienne que ce message ;
- `apres=<id>` : les messages arrivés après ce message (polling). `avant` et `apres` ne se combinent pas.

### Personnage incarné

Dans l'ancienne app, chaque joueur « jouait » un personnage de la salle (`users/{uid}.persoId`), et un personnage n'était joué que par un seul joueur à la fois.

| Méthode | Route                          | Corps                             | Réponse                                                                                                                     |
| ------- | ------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PUT     | `/v1/rooms/:id/moi/personnage` | `{ characterId: string \| null }` | la liste des personnages engagés (comme `GET /personnages`) ; `null` libère le personnage incarné                           |
| GET     | `/v1/rooms/:id/personnages`    | —                                 | personnages engagés : `[{ characterId, nom, avatarUrl, type, camp, proprietaireId, incarnePar: userId \| null, creation }]` |

Règles de l'incarnation :

- un membre incarne au plus un personnage par salle : en choisir un autre libère l'ancien ;
- un joueur incarne un de ses personnages engagés ; le MJ incarne n'importe quel personnage engagé (PNJ ou personnage de joueur) ;
- refus : 409 `personnage_pris` s'il est incarné par un autre membre, 404 `personnage_non_engage`, 403 pour le personnage d'un autre joueur ou pour un spectateur ;
- le personnage est libéré quand son membre quitte la salle ou devient spectateur.

Dans `GET /personnages`, `nom`, `avatarUrl` et `type` viennent de character : ils valent `null` si character est injoignable ou si le personnage n'existe plus. `creation` vaut `true` tant que la fiche est en cours de création.

« Créer un nouveau personnage » dans une salle : le front crée le personnage dans character (`POST /v1/characters`, système de la salle), l'engage (`POST /v1/rooms/:id/personnages`), l'incarne, puis ouvre la création.

Règle de `creationPersonnages` : un personnage « créé pour l'occasion » est un personnage dont la création est en cours (`etat.creation` vrai dans character). Si `creationPersonnages` est faux, un joueur qui tente de l'engager reçoit 403 `creation_interdite` ; il peut toujours engager un personnage terminé du bon système. Le MJ n'est pas concerné.

Campaign lit cet état dans le résumé interne de character (`GET /internal/characters/:id`, champ `creation`). Tant que character ne renvoie pas ce champ, il vaut `false` et la règle ne bloque rien.

## Personnages de la salle

Les personnages restent dans le service character. Campaign enregistre seulement leur **engagement** dans une salle, avec un camp :

| Méthode | Route                                    | Corps                                                            | Réponse                                                  |
| ------- | ---------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| POST    | `/v1/rooms/:id/personnages`              | `{ characterId, camp?: 'joueurs' \| 'adversaires' \| 'allies' }` | engage un de mes personnages (le MJ peut engager un PNJ) |
| DELETE  | `/v1/rooms/:id/personnages/:characterId` | —                                                                | retire le personnage de la salle                         |

Deux routes internes, protégées par `INTERNAL_API_SECRET` et jamais relayées par la gateway :

- `GET /internal/characters/:characterId/salles-de?userId=` : utilisée par character pour savoir si un utilisateur est MJ ou joueur d'une salle où le personnage est engagé. Le MJ peut écrire, les joueurs peuvent lire. La réponse est mise en cache peu de temps.
- `GET /internal/rooms/:roomId/droits?userId=&characterId=` : les droits d'un utilisateur sur une salle donnée.

## Combat

L'état de combat vit dans la salle. Il n'y a qu'un combat actif par salle.

| Méthode | Route                             | Corps                                                                | Réponse                                                                                                                                                                                  |
| ------- | --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/rooms/:id/combat`            | `{ participants: [characterId], mode?: 'individuel' \| 'creneaux' }` | démarre le combat (MJ)                                                                                                                                                                   |
| POST    | `/v1/rooms/:id/combat/initiative` | `{ parametres?: { [characterId]: {...} } }`                          | le serveur lance l'action d'initiative du système pour chaque participant (via character) et trie selon `initiative.tri`. À égalité parfaite : camp `joueurs` d'abord, puis ordre stable |
| POST    | `/v1/rooms/:id/combat/suivant`    | `{ characterId? }` (obligatoire pour un joueur en créneaux)          | passe au participant ou au créneau suivant. En fin de round, décompte les durées : les états arrivés à 0 sont retirés via character                                                      |
| POST    | `/v1/rooms/:id/combat/fin`        | —                                                                    | termine le combat                                                                                                                                                                        |
| GET     | `/v1/rooms/:id/combat`            | —                                                                    | `{ round, mode, ordre: [{ characterId, camp, cles, aAgi }], courant, creneaux? }`                                                                                                        |

Le mode vaut `individuel` par défaut ; le MJ passe `mode: 'creneaux'` pour Star Wars. `/combat/suivant` renvoie aussi `decomptes` et `echecsDecompte` (durées décomptées en fin de round). `/combat/fin` répond 204. Les réponses portent en plus `id`, `version` et les dates, et `proprietaireId` pour une salle.

En mode `creneaux` (Star Wars), l'ordre est une suite de créneaux par camp. Pendant un créneau, n'importe quel participant du camp qui n'a pas encore agi peut agir.

## Événements

- `room.created`, `room.updated`, `room.deleted`
- `room.member_joined`, `room.member_left` (`exclu`, `banni`), `room.member_role_changed`
- `room.member_unbanned` (visible du MJ seulement)
- `room.character_added`, `room.character_removed`, `room.character_embodied`
- `room.session_scheduled`, `room.session_cancelled`
- `room.message_posted`, `room.message_deleted`
- `combat.started`, `combat.turn_changed`, `combat.ended`

## Migration

Les anciennes salles Firebase (`Salle`, `salles`, `rooms`, fusionnées) et leurs membres sont importées. Les personnages de `cartes/{roomId}/characters` sont engagés dans leur salle d'origine. La correspondance des identifiants passe par `legacy_ids`.
