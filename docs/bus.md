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
  éphémère ordonné (seulement le nouveau), identity en durable `identity-titles` (voir plus bas).

## Relais d'outbox (`@vtt/platform`, `outbox-relay.ts`)

```
transaction du service : donnée + INSERT INTO <schéma>.outbox
  → trigger outbox_notify : pg_notify('<schéma>_outbox', id)
  → relais (LISTEN) : lot FOR UPDATE SKIP LOCKED → publishEvent → published_at = now()
```

- Branché dans `main.ts` d'identity, character, campaign et dice via `startOutboxRelayWithBus`,
  après le démarrage HTTP, seulement si `NATS_URL` est définie. Canaux : `identity_outbox`,
  `characters_outbox`, `campaign_outbox`, `dice_outbox`.
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
import { connectBus, consumeEvents } from './packages/platform/dist/index.js';
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
