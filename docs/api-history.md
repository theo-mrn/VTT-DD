# API du service history

Le service **history** (`backend/history`, port 3005) tient le **journal d'actions** de l'application : chaque événement publié sur le bus (NATS JetStream, sujets `vtt.<campagne|global>.<domaine>.<action>`, voir `docs/bus.md`) y est enregistré en **ajout seul**, avec un rang et une **chaîne de hash** par campagne qui rendent toute altération détectable. Il remplace la collection Firestore `Historique/{roomId}/events`, écrite à la main par `logHistoryEvent` (`legacy/src/lib/historiqueTrackerService.ts`) et lue directement par `legacy/src/components/(historique)/Historique.tsx`.

Il ne reçoit rien en écriture par HTTP : les événements arrivent **uniquement par le bus**, écrits par chaque service dans la même transaction que la donnée (outbox) puis relayés. Les routes publiques passent par la gateway (`/v1/history`) et demandent un jeton d'accès.

## Timeline d'une campagne

| Méthode | Route                                    | Réponse                                                                |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| GET     | `/v1/history?campaignId=…`               | `{ events, hasMore }` : événements visibles par l'appelant             |
| GET     | `/v1/history/verify?campaignId=…`        | `{ campaignId, ok, events, lastSeq, firstBroken }` : chaîne recalculée |
| GET     | `/internal/campaigns/:campaignId/events` | route interne (secret partagé), jamais relayée par la gateway          |

### `GET /v1/history`

| Paramètre     | Rôle                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `campaignId`  | Obligatoire. L'appelant doit être membre de la campagne : sinon **404 `campaign_not_found`**, comme si elle n'existait pas.            |
| `afterSeq`    | Événements de rang **strictement supérieur** (rattrapage) ; ordre par défaut alors : du plus ancien au plus récent.                    |
| `beforeSeq`   | Événements de rang **strictement inférieur** (page précédente). `afterSeq` < `beforeSeq`, sinon 400.                                   |
| `from`, `to`  | Bornes de date sur `occurredAt` (ISO 8601 avec fuseau) : `from` inclus, `to` exclu. Remplace le choix de la journée de l'ancienne app. |
| `characterId` | Événements d'un personnage (vue « par personnage » de l'ancienne app).                                                                 |
| `types`       | Types séparés par des virgules, exacts ou par domaine : `character.hp_changed,legacy.*` (20 au plus).                                  |
| `limit`       | 50 par défaut, 200 au plus ; `hasMore` indique qu'il en reste.                                                                         |
| `order`       | `asc` ou `desc`. Par défaut : `desc` (du plus récent au plus ancien), `asc` avec `afterSeq`.                                           |

**Visibilité** (reprise de l'ancienne app, où un événement portant `targetUserId` n'était montré qu'à cet utilisateur) :

| `visibility` | Qui le voit                                                        |
| ------------ | ------------------------------------------------------------------ |
| `public`     | tous les membres                                                   |
| `owner`      | son auteur (`actor.userId`) et le MJ                               |
| `gm_only`    | le MJ seul (jets secrets, PNJ cachés) ; jamais renvoyé à un joueur |

Le MJ voit tout ; un joueur ou un spectateur voit `public` et les `owner` dont il est l'auteur. Les rangs vus par un joueur peuvent donc avoir des trous.

Un événement renvoyé est l'**enveloppe du bus** (`packages/contracts/src/events.ts`), plus son rang et le personnage concerné :

```json
{
  "id": "0192…",
  "seq": 42,
  "type": "character.hp_changed",
  "version": 1,
  "occurredAt": "2026-09-25T14:21:00.000Z",
  "recordedAt": "2026-09-25T14:21:00.035Z",
  "roomId": "…",
  "actor": { "userId": "…", "role": "gm", "characterId": null },
  "aggregate": { "type": "character", "id": "…" },
  "characterId": "…",
  "visibility": "public",
  "payload": { "before": { "hp": 24 }, "after": { "hp": 17 } },
  "correlationId": "…",
  "causationId": null
}
```

- `roomId` est l'identifiant de la campagne (nom du champ dans l'enveloppe) ; `null` pour un événement global.
- `seq` : rang de l'événement dans **sa campagne** (1, 2, 3…), attribué par history à l'enregistrement. Ce n'est pas la séquence du flux JetStream que realtime envoie comme curseur (`docs/api-realtime.md`).
- `characterId` : personnage concerné, dérivé : l'agrégat s'il s'agit d'un personnage, sinon le personnage incarné par l'auteur (`actor.characterId`).
- `recordedAt` : date d'enregistrement dans le journal (`occurredAt` : date de l'action).
- Ni le hash ni le `traceparent` ne sont renvoyés.

Erreurs : 401 sans jeton ; 400 `validation_failed` ; 404 `campaign_not_found` ; 503 `campaign_unavailable` (campaign injoignable : aucun droit n'est ouvert).

### `GET /v1/history/verify`

Réservé au **MJ** (403 `gm_only` pour un joueur, 404 pour un non-membre ; 10 appels par minute). Recalcule toute la chaîne de la campagne avec la fonction SQL `history.verify_chain` :

```json
{
  "campaignId": "…",
  "ok": false,
  "events": 156,
  "lastSeq": 156,
  "firstBroken": { "seq": 12, "id": "…", "reason": "hash" }
}
```

`reason` : `hash` (contenu modifié), `seq` (trou : événement retiré au milieu), `prev_hash` (maillon qui ne suit pas le précédent), `head` (la tête de chaîne ne correspond plus au dernier événement : fin de chaîne retirée ; `id` vaut alors `null`).

### Route interne de rattrapage

`GET /internal/campaigns/:campaignId/events?afterSeq=&limit=&userId=&role=`, en-tête `x-internal-secret` (401 sinon ; route absente sans `INTERNAL_API_SECRET`) : les événements de rang supérieur à `afterSeq` (0 par défaut), du plus ancien au plus récent, 500 au plus, et `lastSeq`, le dernier rang attribué dans la campagne (lu après les événements : jamais en retard sur eux). Avec `userId` et `role` (`gm`, `player`, `spectator`), la visibilité est appliquée comme pour `GET /v1/history` ; sans, tout est renvoyé. `limit=0` : `lastSeq` seul. Réponse : `{ campaignId, lastSeq, events, hasMore }`. Sans appelant aujourd'hui (realtime rejoue directement depuis JetStream) : prévue pour un rattrapage au-delà des 7 jours de rétention du flux ; à ouvrir dans la NetworkPolicy (`allowFrom` de `infra/gitops/<env>/history.yaml`) le jour où un service l'appelle.

## Journal

Schéma Postgres `history` (changelog Liquibase `backend/history/db`, rôles `history_owner` pour les migrations, `history_svc` pour le service) :

| Table            | Rôle                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`         | Une ligne par événement, **partitionnée par mois** sur `occurred_at` (`events_AAAA_MM`, plus `events_default` pour ce qui tombe hors des partitions). Clé primaire `(id, occurred_at)`.                  |
| `campaign_heads` | Tête de chaîne de chaque campagne : `last_seq`, `last_hash`.                                                                                                                                             |
| `inbox`          | Identifiants des événements déjà reçus (`history` pour le bus, `import` pour l'ancien Historique) : un événement relivré ou réimporté est écarté. L'unicité de `id` vaut donc sur toutes les partitions. |

Index : `(campaign_id, seq)`, `(aggregate_type, aggregate_id, occurred_at desc)` (audit : qui a modifié quoi), `(campaign_id, character_id, seq)`.

### Enregistrement d'un événement

Le consommateur durable `history` (variable `HISTORY_CONSUMER`, partagé par les réplicas) lit `vtt.>` depuis le début du flux et, pour chaque événement, dans une transaction :

1. `INSERT INTO inbox … ON CONFLICT DO NOTHING` : déjà reçu, on s'arrête (doublon) ;
2. tête de la campagne créée si besoin et **verrouillée** (upsert qui prend le verrou de ligne) : les ajouts d'une campagne passent un par un, les autres campagnes restent parallèles ;
3. `seq = last_seq + 1`, `prev_hash = last_hash`, insertion ; le trigger `events_hash` calcule **`hash = sha256(prev_hash || JSON canonique)`** ;
4. tête mise à jour avec ce rang et ce hash.

Le message est acquitté ensuite. Un échec passager (Postgres injoignable) le fait relivrer 5 s plus tard ; un événement que Postgres refusera toujours (donnée invalide : caractère nul, contrainte) est journalisé en erreur avec son seul identifiant, puis acquitté. Les messages illisibles (hors enveloppe) sont ignorés par `@vtt/platform`.

**Événements sans campagne** (`roomId` null : comptes, profils, titres…) : stockés avec `campaign_id` et `seq` nuls, **sans chaîne** ; leur hash ne couvre qu'eux-mêmes. Une chaîne « globale » ferait passer tous ces événements par un seul verrou.

**JSON canonique** (fonction SQL `history.event_canonical`) : l'enveloppe plus son rang, sérialisée par `jsonb` (clés triées, sans espace superflu), la date en UTC à la microseconde :

```json
{"id": "…", "seq": 1, "type": "…", "actor": {"role": "gm", "userId": null, "characterId": null}, "roomId": "…", "payload": {…}, "version": 1, "aggregate": {"id": "…", "type": "…"}, "occurredAt": "2026-09-27T10:00:00.123456Z", "visibility": "public", "causationId": null, "traceparent": null, "correlationId": "…"}
```

Le hash est toujours calculé par Postgres, jamais fourni par le service ; `history.verify_chain(campaign_id)` le recalcule avec la même fonction, depuis psql comme depuis l'API. La liste des champs est explicite : ajouter une colonne ne change pas le hash des événements déjà enregistrés.

### Ajout seul

- `history_svc` n'a sur `events` que `SELECT` et `INSERT` (`UPDATE`, `DELETE`, `TRUNCATE` retirés), ni `UPDATE` ni `DELETE` sur `inbox`, pas de `DELETE` sur `campaign_heads`, et aucun droit direct sur les partitions (tout passe par `events`).
- Triggers `events_no_update` et `events_no_truncate` : même `history_owner` ne peut ni modifier, ni supprimer, ni vider le journal.
- Une modification faite en contournant tout cela (superutilisateur, triggers désactivés) casse la chaîne : `verify_chain` la signale. Le test de restauration hebdomadaire des sauvegardes vérifie toutes les chaînes (`infra/cluster/backup/restore-test.yaml`).
- `infra/postgres/tests/history-droits.sh` vérifie tout cela en CI après les migrations.

### Partitions

`history.ensure_partitions(date, mois)` crée les partitions mensuelles manquantes. Elle est `SECURITY DEFINER` : `history_svc` n'a pas le droit `CREATE` sur le schéma, il ne peut créer que ces partitions. Appelée par la migration (mois courant et deux suivants), au démarrage du service puis chaque jour (`PARTITION_MONTHS_AHEAD`, 3 par défaut), et par l'import pour les mois de l'ancien Historique. Un événement hors des partitions existantes n'est jamais refusé : il va dans `events_default` ; un mois qui y a déjà des événements n'est plus partitionné (le journal ne se déplace pas), la fonction le signale par un avertissement.

## Import de l'ancien Historique

```bash
pnpm import:history                          # export Firestore + simulation (rien n'est écrit)
pnpm import:history --importer               # export + import réel
pnpm import:history --sans-export --importer # réutilise ~/vtt-export/Historique.ndjson
```

À lancer **après** les comptes, personnages et campagnes. `Historique/{code}/events/{id}` devient un événement :

| Ancien champ                                                              | Journal                                                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| chemin du document                                                        | `id` = UUIDv5 du chemin (espace de noms fixe) : un second import écarte les événements déjà présents                              |
| `{code}`                                                                  | campagne importée (`campaign.legacy_ids`, `Salle/{code}`) ; campagne non importée : événement ignoré                              |
| `type`                                                                    | `legacy.<type en snake_case>` : `legacy.combat`, `legacy.inventaire`, `legacy.note`… (`legacy.unknown` s'il manque)               |
| `timestamp`                                                               | `occurredAt` ; sans date : erreur dans le rapport                                                                                 |
| `targetUserId`                                                            | visibilité `owner`, auteur = compte migré de cet UID (rôle `gm` ou `player` selon la campagne) ; sans compte : visible du MJ seul |
| `characterId`                                                             | agrégat `character` si le personnage est importé (`cartes/{code}/characters/{id}`), sinon agrégat `campaign`                      |
| `message`, `characterName`, `characterAvatar`, `characterType`, `details` | `payload` : `{ message, character: { legacyId, name, avatar, type }, details, extra?, legacy: { source, path, type } }`           |

- L'ancienne app n'enregistrait pas l'auteur d'un événement public : son auteur est `system`.
- Les événements d'une campagne sont ajoutés **dans l'ordre chronologique** : leur rang suit la date. Une campagne qui a déjà des événements du bus reçoit l'ancien historique à la suite (signalé dans le rapport).
- Les avatars intégrés en base64 (`data:…`, jusqu'à 300 Ko chacun) ne sont pas recopiés dans un journal conservé sans limite : `avatar` vaut `null` (avertissement « avatar intégré retiré ») ; l'avatar reste sur la fiche du personnage.
- Les résumés IA (`Historique/{code}/summaries`) ne sont pas importés.
- Rapport : `~/vtt-export/rapport-historique.ndjson` (une ligne par campagne et par événement en erreur) ; la console n'affiche que des compteurs.

## Configuration

| Variable                                 | Rôle                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                           | rôle `history_svc` (jamais `history_owner`)                                                      |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWKS_URL` | jetons d'identity, mêmes valeurs que la gateway                                                  |
| `INTERNAL_API_SECRET`                    | secret partagé (droits demandés à campaign, route interne) ; absent : historique illisible (503) |
| `CAMPAIGN_URL`                           | service campaign (`/internal/campaigns/:id/rights`) ; `RIGHTS_CACHE_MS` : cache des rôles (5 s)  |
| `NATS_URL`                               | bus ; absent : l'API sert le journal mais rien n'est enregistré (avertissement)                  |
| `HISTORY_CONSUMER`                       | nom du consommateur durable (`history`)                                                          |
| `PARTITION_MONTHS_AHEAD`                 | partitions mensuelles créées à l'avance (3)                                                      |

En cluster : valeurs dans `infra/gitops/<env>/history.yaml`, secret **`history-secrets`** (SOPS) avec `DATABASE_URL` (rôle `history_svc`) et `INTERNAL_API_SECRET` (même valeur que campaign) ; migrations par le Job PreSync avec le secret CloudNativePG `pg-history-owner`. NetworkPolicy : appelé par la gateway seulement.

Tests : `pnpm --filter @vtt/history test`, avec `TEST_DATABASE_URL=postgres://history_svc:history-dev@localhost:5432/vtt` pour les tests d'intégration et `TEST_NATS_URL=nats://127.0.0.1:4222` pour le test de bout en bout du bus (ignorés sans). Le journal étant en ajout seul, les événements des tests restent en base (campagnes aléatoires, chaînes valides) ; les tests de chaîne cassée tournent dans des transactions annulées.
