# Bus d'événements (NATS JetStream)

Chaque changement d'état est écrit dans l'outbox du service, dans la même transaction que la
donnée, puis publié sur NATS JetStream par le relais du service. history et realtime consomment
le même flux (voir « Le tunnel d'historique » dans [refacto.md](refacto.md)).

## Sujets et flux

- Sujet : `vtt.<campaignId|global>.<domaine>.<action>`, calculé par `subjectFor` (`@vtt/contracts`)
  à partir du `type` et du `roomId` de l'enveloppe. Ex. `vtt.0192….dice.rolled`,
  `vtt.global.identity.user_registered`.
- Filtres utiles : `vtt.<campaignId>.>` (une campagne), `vtt.*.dice.>` (un domaine), `vtt.>` (tout).
- Un seul flux, `VTT_EVENTS`, sur `vtt.>` : stockage fichier, rétention 7 jours (rejeu après une
  panne), fenêtre de dédoublonnage 10 minutes. `connectBus` le crée ou le met à jour.
- Consommateurs (`consumeEvents`) : history en durable (tout rejouer, ack explicite), realtime en
  éphémère ordonné (seulement le nouveau), identity en durable `identity-titles` (voir plus bas) ; dice
  (`dice-rights`) et identity (`identity-rights`) en durable sur
  `vtt.global.billing.entitlements_changed` (droits publiés par billing, voir
  [paiement.md](paiement.md)).

## Relais d'outbox (`@vtt/platform`, `outbox-relay.ts`)

```
transaction du service : donnée + INSERT INTO <schéma>.outbox
  → trigger outbox_notify : pg_notify('<schéma>_outbox', id)
  → relais (LISTEN) : lot FOR UPDATE SKIP LOCKED → publishEvent → published_at = now()
```

- Branché dans `main.ts` d'identity, character, campaign, dice et billing via `startOutboxRelayWithBus`,
  après le démarrage HTTP, seulement si `NATS_URL` est définie. Canaux : `identity_outbox`,
  `characters_outbox`, `campaign_outbox`, `dice_outbox`, `billing_outbox`. Option `consumers` :
  consommateurs démarrés sur la même connexion (retentés s'ils ne démarrent pas).
- Réveil : `LISTEN` sur un client pg dédié (reconnexion de 1 à 30 s), et relecture toutes les
  5 s en filet de sécurité. `LISTEN` ne traverse pas PgBouncer en mode transaction : en cluster,
  `DATABASE_DIRECT_URL` pointe sur `vtt-pg-rw.data.svc` (sans elle, `DATABASE_URL` est utilisée et
  seul le poll de 5 s réveille le relais).
- Lots de 100 dans l'ordre `created_at, id`, sous un verrou consultatif de transaction : un seul
  réplica publie à la fois, l'ordre est préservé. Un lot s'arrête après 10 s et committe ce qui est
  publié.
- Échec de publication : `attempts + 1`, `last_error`, fin du lot (les lignes suivantes attendent)
  et pause jusqu'au prochain poll : pas de boucle serrée quand NATS est coupé.
- NATS injoignable au démarrage : le service démarre quand même (`/readyz` reste vert), les
  événements s'accumulent dans l'outbox, la connexion est retentée de 1 à 30 s.
- Purge : une fois par heure, les lignes publiées depuis plus de 7 jours sont supprimées si le rôle
  `<svc>_svc` a le droit DELETE (c'est le cas via les privilèges par défaut du schéma).
- Ligne bloquante : une ligne qui échoue toujours (ex. enveloppe au-delà de `max_payload`, 1 Mo)
  bloque les suivantes. Elle se repère à `attempts` et `last_error` élevés ; à corriger à la main.

## Dédoublonnage

- Côté producteur : `Nats-Msg-Id = event.id`. Si le relais publie puis perd sa connexion avant le
  COMMIT, la ligne est republiée au lot suivant et JetStream l'écarte (`duplicate: true`) tant
  qu'on reste dans la fenêtre de 10 minutes.
- Côté consommateur : la livraison est « au moins une fois » ; chaque consommateur dédoublonne par
  `event.id` (table `inbox`, clé primaire de `history.events`).

## Vérifier en local

`pnpm dev` ajoute `NATS_URL=nats://127.0.0.1:4222` au `.env` des services qui lisent le bus.

```sql
-- Lignes en attente et échecs, par service (psql -U vtt -d vtt)
SELECT count(*) FILTER (WHERE published_at IS NULL) AS en_attente, max(attempts) FROM dice.outbox;
-- Le relais écoute bien son canal
SELECT application_name, query FROM pg_stat_activity WHERE application_name LIKE '%outbox-relay';
```

```sh
# État du flux (monitoring NATS)
curl -s 'http://127.0.0.1:8222/jsz?streams=true'
```

```js
// check-bus.mjs, à la racine du dépôt (après pnpm --filter @vtt/platform build) :
// affiche les événements dice déjà sur le flux, puis s'arrête
import { connectBus, consumeEvents } from './backend/platform/dist/index.js';
const bus = await connectBus({ url: 'nats://127.0.0.1:4222', name: 'check-bus' });
const stop = await consumeEvents(bus, {
  subjects: ['vtt.*.dice.>'],
  deliver: 'all',
  handler: async (e) => console.log(e.occurredAt, e.type, e.id),
});
setTimeout(async () => (await stop(), await bus.close()), 3000);
```

Test d'intégration du relais (table temporaire, l'outbox réelle n'est pas touchée ; les
événements publiés sont purgés du flux à la fin) :

```sh
TEST_DATABASE_URL=postgres://dice_svc:dice-dev@127.0.0.1:5432/vtt NATS_URL=nats://127.0.0.1:4222 \
  pnpm --filter @vtt/platform test
```

## Déploiement

Namespace `messaging`, synchronisé par Argo CD (`infra/argocd/messaging.yaml`, projet
`messaging`) ; charts officiels à version épinglée, valeurs dans `infra/messaging/`.

| Application Argo CD        | Contenu                                                                            | Adresse                        |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| `messaging-base`           | namespace (Pod Security `restricted`), NetworkPolicies (`infra/cluster/messaging`) | —                              |
| `messaging-nats`           | chart `nats` 2.15.0, `infra/messaging/nats.yaml`                                   | `nats.messaging.svc:4222`      |
| `messaging-valkey-staging` | chart `valkey` 0.12.0, `infra/messaging/valkey.yaml`                               | `valkey-staging.messaging.svc` |
| `messaging-valkey-prod`    | idem                                                                               | `valkey-prod.messaging.svc`    |

### Isolement staging / prod

- **NATS : un serveur, un compte par environnement.** `STAGING` (utilisateur `vtt-staging`) et
  `PROD` (`vtt-prod`) ont chacun leur JetStream : même flux `VTT_EVENTS`, mêmes consommateurs
  (`history`, `identity-titles`), mais données séparées ; rien n'est exporté d'un compte à
  l'autre et une connexion sans utilisateur est refusée. `SYS` sert seulement à l'administration.
  Limites : 2 Gio de disque pour `STAGING`, 6 Gio pour `PROD` (volume de 10 Gio), 8 flux, 1 000
  et 2 000 consommateurs, pas de stockage mémoire ; `max_payload` 1 Mo.
- **Valkey : une instance par environnement.** Le code ne préfixe ni les clés (`<service>:…`) ni
  les canaux (`vtt-realtime#…`) par environnement : une base logique ne sépare pas le pub/sub, et
  des ACL à préfixe demanderaient de changer le code. Deux instances séparent aussi la mémoire (une
  charge de staging n'évince rien en prod). Utilisateur `default` avec mot de passe, commandes
  `@dangerous` refusées sauf `INFO` (FLUSHALL, KEYS, CONFIG…), pas de persistance, 200 Mo en
  `allkeys-lru`.
- **Réseau** : tout est refusé dans `messaging`, sauf NATS (4222) depuis les pods `vtt` de
  `vtt-staging` et `vtt-prod`, `valkey-staging` (6379) depuis `vtt-staging` seulement,
  `valkey-prod` depuis `vtt-prod` seulement, et les routes entre serveurs NATS (6222). Côté
  services, le chart commun ouvre déjà la sortie vers `messaging` sur 4222 et 6379.

### Secrets

Aucun mot de passe dans le dépôt. `infra/messaging/generate-secrets.sh` est le gabarit : il
écrit les cinq Secrets avec des mots de passe aléatoires, identiques côté serveur et côté client.

| Namespace     | Secret                  | Clés                                                | Lu par                    |
| ------------- | ----------------------- | --------------------------------------------------- | ------------------------- |
| `messaging`   | `nats-accounts`         | `SYS_PASSWORD`, `STAGING_PASSWORD`, `PROD_PASSWORD` | NATS (`$NATS_…_PASSWORD`) |
| `messaging`   | `valkey-staging-users`  | `default`                                           | valkey-staging (ACL)      |
| `messaging`   | `valkey-prod-users`     | `default`                                           | valkey-prod (ACL)         |
| `vtt-staging` | `messaging-credentials` | `NATS_PASSWORD`, `REDIS_PASSWORD`                   | services de staging       |
| `vtt-prod`    | `messaging-credentials` | `NATS_PASSWORD`, `REDIS_PASSWORD`                   | services de prod          |

```sh
# Avant la première synchronisation (sinon les pods attendent leurs secrets)
kubectl create namespace messaging; kubectl create namespace vtt-staging; kubectl create namespace vtt-prod
bash infra/messaging/generate-secrets.sh > ~/vtt-messaging-secrets.yaml   # HORS du dépôt
kubectl apply -f ~/vtt-messaging-secrets.yaml && rm ~/vtt-messaging-secrets.yaml
```

- Format : `p` + 64 caractères hexadécimaux (`openssl rand -hex 32`). Hexadécimal pour aller tel
  quel dans une URL ; la lettre en tête parce que NATS lit `$NATS_…_PASSWORD` comme une valeur de
  sa configuration, où un mot de passe commençant par un chiffre serait lu comme un nombre.
- Pour versionner les secrets, les chiffrer avec SOPS (age) avant tout commit ; ils ne sont
  jamais écrits en clair dans le dépôt.
- Rotation : changer la valeur des deux côtés (ex. `STAGING_PASSWORD` et le `NATS_PASSWORD` de
  `vtt-staging`), puis `kubectl -n messaging rollout restart statefulset/nats` (le serveur lit ses
  variables au démarrage) et `kubectl -n vtt-staging rollout restart deployment`. Pour Valkey :
  `kubectl -n messaging rollout restart deployment/valkey-staging` (ACL générée au démarrage).

### Connexion des services

Dans `infra/gitops/<env>/*.yaml`, `secretEnv` (chart `infra/helm/service`) déclare
`NATS_PASSWORD` et `REDIS_PASSWORD` depuis `messaging-credentials` avant les autres variables, et
Kubernetes les substitue dans les URL :

```yaml
NATS_URL: nats://vtt-staging:$(NATS_PASSWORD)@nats.messaging.svc:4222
REDIS_URL: redis://default:$(REDIS_PASSWORD)@valkey-staging.messaging.svc:6379
```

ioredis lit l'utilisateur et le mot de passe de `REDIS_URL`. nats.js ignore ceux d'une URL :
`connectBus` les extrait (`parseNatsUrl`) et les passe en options `user` et `pass`. Vérifié sur un
NATS avec comptes : bon mot de passe accepté, mauvais refusé (`Authorization Violation`).

### Haute disponibilité (3 nœuds)

- `config.cluster.enabled: true` dans `infra/messaging/nats.yaml` : 3 serveurs, un par nœud
  (volume `local-path` lié au nœud), routes sur 6222 déjà permises.
- `VTT_EVENTS` : passer `NATS_STREAM_REPLICAS=3` à **tous** les services qui se connectent au bus
  (chaque démarrage met le flux à jour avec cette valeur ; 1 par défaut). En R3, chaque message
  compte trois fois dans `max_file` : revoir les limites des comptes et la taille des volumes.

### Vérification

```sh
kubectl -n messaging get pods,pvc,networkpolicy
# Flux par compte, sans identifiants (port de monitoring, hors Service)
kubectl -n messaging port-forward pod/nats-0 8222 &
curl -s 'http://127.0.0.1:8222/jsz?accounts=true&streams=true'   # STAGING et PROD, chacun son VTT_EVENTS
# Avec la CLI nats en local
kubectl -n messaging port-forward svc/nats 4222 &
export NATS_URL=nats://127.0.0.1:4222 NATS_USER=vtt-staging
export NATS_PASSWORD=$(kubectl -n messaging get secret nats-accounts -o jsonpath='{.data.STAGING_PASSWORD}' | base64 -d)
nats stream info VTT_EVENTS; nats account info   # limites du compte STAGING
NATS_USER= NATS_PASSWORD= nats stream ls          # anonyme : Authorization Violation
# Valkey (mot de passe par l'entrée standard, jamais dans la ligne de commande)
kubectl -n messaging get secret valkey-staging-users -o jsonpath='{.data.default}' | base64 -d |
  kubectl -n messaging exec -i deploy/valkey-staging -- sh -c 'read -r p; VALKEYCLI_AUTH="$p" valkey-cli info memory'
```

Vérifié sur un NATS 2.15 jetable avec la configuration rendue par le chart : deux comptes, deux
`VTT_EVENTS` indépendants (3 messages d'un côté, 1 de l'autre), durable `history` invisible de
l'autre compte, consommateur ordonné accepté sans stockage mémoire, anonyme et mot de passe de
l'autre compte refusés. Valkey 9.1 avec l'ACL du chart : cache, script Lua du rate limit et
pub/sub de l'adaptateur passent ; FLUSHALL, KEYS et CONFIG sont refusés.

## Diff avant/après (`changes`)

Les événements de mise à jour portent, en plus de leurs champs propres, le diff de ce qui a changé :
`character.updated` (état, nom, avatar : `enregistrer()` de character) et `campaign.updated` (nom,
description, système, image, options). Utilitaire générique : `changesPayload` / `diffValues` de
`@vtt/contracts` (`changes.ts`), sans clé propre à un système de jeu.

```json
{
  "version": 9,
  "operation": "valeurs",
  "valeurs": { "PV": 2 },
  "changes": [{ "path": "etat.valeurs.PV", "before": 9, "after": 2 }]
}
```

- `changes` : liste de `{ path, before?, after?, truncated? }`, dans l'ordre des clés (triées) puis
  des éléments. Liste vide si rien n'a bougé. `before` absent : ajout ; `after` absent : retrait ;
  `null` est une vraie valeur (ex. `avatarUrl` retiré : `after: null`).
- `path` : clés séparées par des points (`etat.valeurs.PV`), entre `["…"]` si ce ne sont pas des
  identifiants simples. Dans un tableau d'objets, l'élément est désigné par son identité, pas par
  son index : `id`, ou pour les possessions `entree#exemplaire` (`etat.possessions[fleche#2].quantite`,
  `etat.possessions[epee-longue]` pour l'exemplaire sans identifiant). Une identité purement
  numérique est entre guillemets (`["12"]`) pour ne pas passer pour un index.
- Tableau sans identité (journal, effets) : par index, après avoir retiré le début et la fin communs
  (retirer la ligne 1 d'un journal donne un seul changement `journal[1]`). Tableau de valeurs simples
  (nœuds acquis) : rapporté en entier. L'ordre des éléments identifiés n'est pas suivi.
- Ajout, retrait ou changement de nature (objet ↔ tableau ↔ valeur) : la valeur entière.
- Bornes (défauts de `DIFF_DEFAULTS`) : profondeur 8 (au-delà, la valeur entière du niveau atteint),
  50 changements, textes de 1 000 caractères, objets de 2 000 caractères de JSON (au-delà, aperçu de
  leur JSON), 64 000 caractères pour toute la liste : l'enveloppe reste loin de `max_payload` (1 Mo,
  voir « Ligne bloquante »). Une valeur raccourcie porte `truncated: true` ; le payload porte
  `truncated: true` dès que quelque chose a été coupé ou omis (sinon la clé est absente).
- État de character comparé après normalisation (valeurs par défaut du schéma) : un état importé
  qui omet un champ par défaut ne produit pas de faux ajout.
- Les champs existants restent (`valeurs`, `possession`, `details` des étapes…) : `changes` s'ajoute.

## Garde-fou : chaque route d'écriture émet un événement

`src/event-guard.test.ts` dans character, campaign, identity et dice (sans base de données) : il
échoue si une route publique `POST`, `PUT`, `PATCH` ou `DELETE` (hors `/internal/`) n'a aucun chemin
vers `appendEvent` et ne figure pas dans ses `EXCEPTIONS` commentées.

- Analyse statique par le vérificateur de types de TypeScript (`findWriteRoutes` de
  `@vtt/platform/testing`) : les routes sont les appels `.post/.put/.patch/.delete` sur une instance
  Fastify reconnue par son type ; depuis le handler, chaque identifiant est résolu vers sa
  déclaration et parcouru (imports et alias, fonctions locales comme `modifierPour` → `modifier` →
  `enregistrer`, rappels, méthodes, fonctions renvoyées par une fabrique). Le chemin trouvé est
  vérifié sur une route connue de chaque service, et chaque exception doit désigner une route
  existante qui n'émet rien (une exception périmée fait échouer le test).
- Limites : l'analyse prouve qu'un chemin vers l'émetteur existe, pas qu'il est pris à chaque appel
  réussi (une branche sans événement passe, ex. un changement de rôle identique, volontairement
  muet) ; un appel à travers une interface (dépendance injectée) n'est pas suivi.
- Exceptions actuelles : `POST /v1/campaigns/:id/image`, `POST /v1/campaigns/:id/notes/upload` et
  `POST /v1/users/me/uploads` (URL d'envoi signée, rien d'écrit ; l'image est enregistrée ensuite
  par `PATCH` ou `POST`, tracé), `POST /v1/auth/refresh`
  (rotation technique du jeton). Manque connu : `POST /v1/auth/logout` (pas d'événement de
  déconnexion, alors que la connexion émet `identity.user_logged_in`).

## Consommateur des titres (identity)

identity consomme le bus pour débloquer les titres « événement », que l'ancienne app attribuait
côté client (`dice-roller.tsx`, `challenge-tracker.ts`). Code : `backend/identity/src/modules/titres/`
(`event-rules.ts` pour les règles, `consumer.ts` pour le traitement), branché par `src/bus.ts`.

- Durable `identity-titles`, sujets `vtt.*.dice.rolled` et `vtt.*.campaign.message_posted`. Démarré
  dans `main.ts` seulement si `NATS_URL` est définie, sur la même connexion NATS que le relais
  d'outbox d'identity (reconnexion de 1 à 30 s, le démarrage HTTP n'attend pas). À sa création, il
  ne lit que les événements à venir (pas de rattrapage des 7 jours du flux) ; ensuite il reprend où
  il s'était arrêté.
- Une seule fois par événement : l'id entre dans `identity.inbox` (colonne `consumer`) dans la
  transaction qui met à jour `identity.title_progress` (compteurs par joueur), débloque les titres
  (`identity.user_titles`) et écrit leurs événements. Une relivraison est reconnue et ignorée. Un
  événement sans effet (voir le critère) n'écrit rien ; celui d'un compte inconnu d'identity est
  consommé sans effet.
- Critère « vrai jet » (`dice.rolled`) : dans une campagne (`roomId` non nul, comme l'ancienne app
  qui ne suivait que les salles) et `payload.source` parmi `3d`, `mixed`, `free`, `action`. Les jets
  `import` (historique Firebase) et `api` (clé d'API, que l'ancienne route `/api/roll-dice` ne
  suivait pas) ne débloquent rien. Les jets cachés au MJ et privés comptent, comme avant.

| Titre                                      | Événement source          | Condition (reprise de l'ancienne app)                   |
| ------------------------------------------ | ------------------------- | ------------------------------------------------------- |
| Maudit des dés                             | `dice.rolled`             | un 1 sur n'importe quel d20 du jet                      |
| Béni des Dieux                             | `dice.rolled`             | un 20 sur n'importe quel d20 du jet                     |
| Apprenti Lanceur, Lanceur Enthousiaste     | `dice.rolled`             | 1 et 50 jets (`dice_rolls`, un jet compte pour 1)       |
| Chanceux                                   | `dice.rolled`             | 1 réussite critique : premier dé du jet = d20 à 20      |
| Éternel Malchanceux                        | `dice.rolled`             | 10 échecs critiques : premier dé du jet = d20 à 1       |
| Orateur Novice, Conteur Bavard, Barde Lég. | `campaign.message_posted` | 1, 50 et 200 messages (seuils des défis, pas 100 / 500) |

Titres « événement » sans source dans le nouveau système (jamais débloqués pour l'instant) :
Aventurier Confirmé (niveau 5), Collectionneur Débutant, Accumulateur Compulsif, Maître d'Armes,
Étudiant (l'ancienne app les recalculait depuis l'état du personnage joué ; `character.updated`
ne porte ni le propriétaire ni cet état), Héros Accompli et Légende Vivante (les défis niveau 10
et 20 donnaient un skin de dé, jamais ce titre), Combattant Novice, Vétéran de Guerre, Fléau des
Dragons (défis désactivés dans l'ancienne app).

Événement produit : `identity.title_unlocked` (sujet `vtt.global.identity.title_unlocked`,
`roomId` null, visibilité `owner`, agrégat `user`), payload `{ slug, label, source }` avec
`source` = `event` (bus) ou `time` (temps de jeu). Pour un déblocage par le bus, `correlationId` et
`traceparent` sont ceux de l'événement source et `causationId` est son id.

Les e-mails de l'ancienne app au premier « Maudit des dés » / « Béni des Dieux » ne sont pas
envoyés : reportés au futur service d'e-mails, qui consommera `identity.title_unlocked` (TODO dans
`consumer.ts`).

```sh
# Tests (handler direct ; bout en bout via JetStream si NATS_URL est définie)
TEST_DATABASE_URL=postgres://identity_svc:identity-dev@localhost:5432/vtt \
  NATS_URL=nats://127.0.0.1:4222 pnpm --filter @vtt/identity test
```
