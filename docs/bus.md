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
  éphémère ordonné (seulement le nouveau).

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
