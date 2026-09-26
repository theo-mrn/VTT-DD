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

## Personnages de la salle

Les personnages restent dans le service character. Campaign enregistre seulement leur **engagement** dans une salle, avec un camp :

| Méthode | Route                                    | Corps                                                            | Réponse                                                  |
| ------- | ---------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| POST    | `/v1/rooms/:id/personnages`              | `{ characterId, camp?: 'joueurs' \| 'adversaires' \| 'allies' }` | engage un de mes personnages (le MJ peut engager un PNJ) |
| DELETE  | `/v1/rooms/:id/personnages/:characterId` | —                                                                | retire le personnage de la salle                         |

Les droits d'un MJ sur les personnages de sa salle passent par une route interne de campaign : `GET /internal/rooms/:roomId/droits?userId=&characterId=`, protégée par `INTERNAL_API_SECRET` et jamais relayée par la gateway. Le service character l'interroge pour autoriser le MJ, et met la réponse en cache.

## Combat

L'état de combat vit dans la salle. Il n'y a qu'un combat actif par salle.

| Méthode | Route                             | Corps                                                                | Réponse                                                                                                                                                                                  |
| ------- | --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/rooms/:id/combat`            | `{ participants: [characterId], mode?: 'individuel' \| 'creneaux' }` | démarre le combat (MJ)                                                                                                                                                                   |
| POST    | `/v1/rooms/:id/combat/initiative` | `{ parametres?: { [characterId]: {...} } }`                          | le serveur lance l'action d'initiative du système pour chaque participant (via character) et trie selon `initiative.tri`. À égalité parfaite : camp `joueurs` d'abord, puis ordre stable |
| POST    | `/v1/rooms/:id/combat/suivant`    | —                                                                    | passe au participant ou au créneau suivant. En fin de round, décompte les durées : les états arrivés à 0 sont retirés via character                                                      |
| POST    | `/v1/rooms/:id/combat/fin`        | —                                                                    | termine le combat                                                                                                                                                                        |
| GET     | `/v1/rooms/:id/combat`            | —                                                                    | `{ round, mode, ordre: [{ characterId, camp, cles, aAgi }], courant, creneaux? }`                                                                                                        |

En mode `creneaux` (Star Wars), l'ordre est une suite de créneaux par camp. Pendant un créneau, n'importe quel participant du camp qui n'a pas encore agi peut agir.

## Événements

- `room.created`, `room.updated`, `room.deleted`
- `room.member_joined`, `room.member_left`, `room.member_role_changed`
- `room.character_added`, `room.character_removed`
- `combat.started`, `combat.turn_changed`, `combat.ended`

## Migration

Les anciennes salles Firebase (`Salle`, `salles`, `rooms`, fusionnées) et leurs membres sont importées. Les personnages de `cartes/{roomId}/characters` sont engagés dans leur salle d'origine. La correspondance des identifiants passe par `legacy_ids`.
