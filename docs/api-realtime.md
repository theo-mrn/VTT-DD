# API du service realtime

Le service **realtime** (`backend/realtime`, port 3006) remplace `onSnapshot` et Realtime Database : il pousse aux navigateurs les événements du bus (canal **durable**) et relaie les messages de passage entre joueurs d'une même campagne (canal **éphémère** : curseurs, jeton en cours de glissement, pings), sans jamais toucher à Postgres.

- Serveur **Socket.IO 4** attaché au serveur HTTP du service, chemin `/v1/realtime/socket.io`, **WebSocket seulement** (pas de long polling, qui exigerait des sessions collantes entre réplicas).
- Joignable uniquement par la gateway, qui relaie la poignée de main WebSocket (`UPSTREAM_REALTIME_URL`). En local, le front passe par la réécriture `/v1/*` de Next, qui relaie aussi les WebSockets.
- Source des événements : le flux JetStream `VTT_EVENTS` (`vtt.<campagne|global>.<domaine>.<action>`, enveloppe `@vtt/contracts`), alimenté par le relais d'outbox de chaque service.

## Connexion

```ts
import { io } from 'socket.io-client';

const socket = io({
  path: '/v1/realtime/socket.io',
  transports: ['websocket'],
  // Relu à chaque (re)connexion : jeton à jour
  auth: (cb) => getToken().then((token) => cb({ token })),
});
```

- Le jeton d'accès (JWT d'identity) voyage dans `auth.token` (ou `Authorization: Bearer …` pour un client Node). Il est vérifié exactement comme sur les routes HTTP des services : signature par le JWKS d'identity, issuer, audience, expiration.
- Refus : `connect_error` avec le message `unauthorized` (le client ne réessaie pas seul).
- À l'expiration du jeton, le serveur envoie `session_expired` puis ferme la connexion (`io server disconnect`) : le client se reconnecte avec un jeton neuf.
- Clés d'API : pas de temps réel.

Le navigateur ne voit pas le jeton d'accès (gardé par le client API, `frontend/src/lib/api.ts`) ; il le relit par une route HTTP du service, portée et renouvelée par ce client :

| Méthode | Route                | Réponse                                                                                              |
| ------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| GET     | `/v1/realtime/token` | `{ token, expiresAt }` : le jeton de la requête (`cache-control: no-store`) ; 403 avec une clé d'API |

La gateway laisse passer sans jeton la seule poignée de main WebSocket vers `/v1/realtime/socket.io/` (un navigateur ne peut pas y joindre d'en-tête) ; les routes HTTP du service exigent un jeton comme les autres. Tout autre upgrade WebSocket est refusé par la gateway.

## Rooms

| Room               | Qui                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ |
| `user:<id>`        | toutes les connexions d'un utilisateur, dès le handshake                             |
| `campaign:<id>`    | les abonnés de la campagne (appartenance vérifiée auprès de campaign)                |
| `campaign:<id>:gm` | les abonnés MJ de la campagne                                                        |
| `replay:<id>`      | interne : connexions en cours de rejeu (exclues du direct, événements mis en tampon) |

## Messages du client

Les accusés (`ack`) sont facultatifs.

### `subscribe` — suivre une campagne

`{ campaignId, afterSeq? }` → accusé :

```ts
| { ok: true; campaignId; role: 'gm' | 'player' | 'spectator'; seq: number | null; replayed: number; resync: boolean }
| { ok: false; error: 'invalid' | 'forbidden' | 'unavailable' | 'busy' | 'rate_limited' | 'too_many_subscriptions' }
```

- L'appartenance est demandée à campaign (`GET /internal/campaigns/:id/rights?userId=`, secret partagé), gardée 30 s dans Valkey (partagé entre réplicas) et oubliée dès qu'un événement `campaign.member_*` la concerne. campaign en panne : `unavailable`, aucun droit ouvert.
- Sans `afterSeq` (premier abonnement) : `seq` est la fin actuelle du flux. Le client charge ou relit son état en REST **après** cet accusé : tout événement de `seq` inférieur y est déjà pris en compte.
- Avec `afterSeq` (reconnexion) : les événements de la campagne qui suivent ce `seq` sont renvoyés (`event`) **avant** l'accusé, dans l'ordre, filtrés par visibilité ; `seq` est alors le dernier couvert. Pendant ce rejeu, ce qui arrive en direct est mis en tampon puis envoyé après : les `seq` d'une campagne arrivent toujours croissants, sans trou. Un `seq` déjà vu peut revenir (direct en retard sur le rejeu) : le client l'ignore.
- `resync: true` : rejeu impossible (plus de `REPLAY_MAX_EVENTS` événements, messages sortis du flux après 7 jours, bus indisponible) ; le client relit son état en REST, et garde `seq` comme curseur.
- 20 campagnes au plus par connexion (`MAX_SUBSCRIPTIONS`), 20 abonnements d'un coup puis 2 par seconde.

### `unsubscribe` — `{ campaignId }` → `{ ok }`

### `presence` — `{ campaignId }` → `{ ok: true, campaignId, users }` ou `{ ok: false, error: 'not_subscribed' }`

`users : [{ userId, role, connections }]` : utilisateurs abonnés à la campagne, tous réplicas confondus (`connections` : onglets et appareils).

### `ephemeral` — canal éphémère

`{ campaignId, kind, data, gmOnly? }`, sans accusé :

- relayé aux **autres** abonnés de la campagne (`gmOnly` : aux MJ seulement, ex. glissement d'un jeton caché), jamais stocké ;
- `kind` : `[a-z][a-z0-9_.:-]{0,39}` (`cursor`, `drag`, `ping`…) ; `data` : 4 Kio au plus en JSON (`EPHEMERAL_MAX_BYTES`) ;
- débit par connexion : 20 messages par seconde, rafale de 40 (`EPHEMERAL_RATE_PER_SECOND`, `EPHEMERAL_BURST`) ; au-delà, messages ignorés et `rate_limited` (au plus un par seconde) ;
- volatile : perdu plutôt que mis en file si la connexion du destinataire est occupée. Dernier état gagne : un message porte `at` (horloge du serveur).

## Messages du serveur

| Événement         | Contenu                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `event`           | `{ seq, event, redacted? }` : événement du bus ; `seq` = séquence du flux (curseur)           |
| `presence`        | `{ campaignId, users }` à chaque arrivée ou départ                                            |
| `ephemeral`       | `{ campaignId, kind, data, from: { userId, role }, at }`                                      |
| `unsubscribed`    | `{ campaignId, reason: 'removed' \| 'left' \| 'deleted' }` : abonnement retiré par le serveur |
| `session_expired` | jeton expiré, connexion fermée juste après                                                    |
| `rate_limited`    | `{ channel: 'ephemeral' }`                                                                    |

### Visibilité

Appliquée par le serveur avant l'envoi, d'après l'enveloppe :

| `visibility`  | Destinataires                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public`      | tous les abonnés de la campagne                                                                                                                                                                                                                                                                                                                                                             |
| `gm_only`     | les MJ abonnés, et les utilisateurs listés dans `payload.visibleToUsers` (carte : éléments cachés ou en visibilité `custom`), en entier, une seule fois même pour un MJ listé ; l'auteur (`actor.userId`), s'il n'est pas listé, reçoit une version **expurgée** (`redacted: true`, `payload: {}`, type et agrégat conservés) : il relit la donnée en REST, qui la masque (jet caché au MJ) |
| `owner`       | l'auteur seul, sur toutes ses connexions — pas le MJ (dice y range les jets `self`, « l'auteur seul, MJ compris »)                                                                                                                                                                                                                                                                          |
| sans campagne | l'auteur seul (`public`, `owner`) ; pour `gm_only`, seulement `visibleToUsers`                                                                                                                                                                                                                                                                                                              |

Le rejeu (`afterSeq`) suit exactement les mêmes règles. `visibleToUsers` contient des identifiants d’utilisateurs, calculés par le service émetteur (la carte liste des personnages dans `visibleTo` et en déduit leurs propriétaires et incarnateurs).

Membres : sur `campaign.member_left` (y compris exclusion), les connexions du membre sont retirées de la campagne (`unsubscribed`) après avoir reçu l'événement ; `campaign.member_role_changed` fait entrer ou sortir de la room MJ ; `campaign.deleted` retire tout le monde.

## Plusieurs réplicas

- Chaque réplica lit **tout** le flux (consommateur JetStream éphémère ordonné, `deliver: new`) et n'émet qu'à **ses** connexions (`io.local`) : un événement n'est envoyé qu'une fois par client, quel que soit le nombre de réplicas, sans élection de leader ni point unique de défaillance. Le coût est de lire le flux N fois, négligeable ici.
- L'adaptateur Redis (`@socket.io/redis-adapter`, Valkey) ne sert qu'à ce qui part d'un client et doit atteindre les autres réplicas : canal éphémère, annonces de présence, `fetchSockets`.
- Le rejeu d'un client se fait sur le réplica où il se reconnecte (consommateur éphémère `by_start_sequence` sur `vtt.<campagne>.>`, supprimé ensuite).
- Arrêt : `/readyz` passe à 503, puis les connexions sont fermées ; les clients se reconnectent ailleurs et rattrapent avec leur dernier `seq`. HPA de 2 à 6 réplicas.

## Côté front

`frontend/src/lib/realtime.ts` : une connexion par onglet, ouverte tant qu'un hook s'en sert, jeton relu par `GET /v1/realtime/token` (renouvelé avant le handshake s'il expire dans moins de 30 s), reprise avec le dernier `seq`. Les composants passent par des hooks de domaine :

- `useCampaignEvents(campaignId | null, types, handler)` → `{ live, generation }` : `null` pour les événements personnels ; `types` exacts ou `domaine.*` ; `generation` change quand l'état doit être relu en REST (premier abonnement, `resync`, reconnexion pour les événements personnels) ;
- `useCampaignPresence(campaignId)` → `{ users, live }` ;
- `useCampaignEphemeral(campaignId, kinds, handler)` → `{ send, live }` (pour la carte).

Exemple : l'historique des dés (`use-roll-history.ts`) relit le jet en REST sur `dice.rolled` (masquage appliqué par dice), retire le jet sur `dice.roll_deleted` (`aggregate.id`, présent même expurgé), se vide sur `dice.history_cleared`, et ne relit l'historique toutes les 30 s que si le temps réel est coupé.

## Configuration

| Variable                                                                               | Rôle                                                                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWKS_URL`                                               | vérification des jetons (mêmes valeurs que la gateway)                            |
| `NATS_URL`                                                                             | bus ; absent : canal éphémère seulement (avertissement)                           |
| `REDIS_URL`                                                                            | cache des droits et adaptateur entre réplicas ; absent : mémoire, un seul réplica |
| `CAMPAIGN_URL`, `INTERNAL_API_SECRET`                                                  | droits auprès de campaign ; absents : aucun abonnement possible                   |
| `RIGHTS_CACHE_SECONDS` (30)                                                            | durée du cache des droits                                                         |
| `REPLAY_MAX_EVENTS` (1000)                                                             | au-delà, `resync` au lieu du rejeu                                                |
| `MAX_SUBSCRIPTIONS` (20)                                                               | campagnes par connexion                                                           |
| `EPHEMERAL_RATE_PER_SECOND` (20), `EPHEMERAL_BURST` (40), `EPHEMERAL_MAX_BYTES` (4096) | limites du canal éphémère                                                         |

Secrets déployés (SOPS, `realtime-secrets`) : `INTERNAL_API_SECRET` seulement, même valeur que campaign. Pas de base de données ni de migrations. NetworkPolicy : entrées depuis la gateway seulement ; sorties vers NATS et Valkey (namespace `messaging`) et campaign (déjà permises par le chart).

## Tests

- `pnpm --filter @vtt/realtime test` : routage et visibilité (unitaires), puis service démarré sur un port local avec de vrais WebSockets (client Socket.IO minimal sur le WebSocket natif de Node, `src/test/socket-client.ts`) et un faux campaign.
- Avec `NATS_URL` (et `REDIS_URL`) : diffusion en direct, rejeu après coupure (ordre, visibilité, pas de doublon, rejeu pendant que le direct continue, `resync`), et deux réplicas reliés par Redis (un seul envoi par client, éphémère et présence entre réplicas).
