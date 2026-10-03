# Observabilité : logs, traces, métriques

Ce document fait foi. Il décrit ce que le code produit. Le stockage et l'affichage (collecteur,
Loki, Tempo, Prometheus, Grafana) relèvent de l'infra, branchée plus tard **sans changer le code**.

## 1. Principes

- **Une action se suit du clic jusqu'à l'historique.** Le navigateur ouvre la trace. Elle traverse
  la gateway, le service, l'outbox, NATS, puis chaque consommateur (realtime, history, audio,
  identity).
- **Rien à configurer en développement.** Sans collecteur, rien n'est exporté. Les logs restent sur
  la sortie standard, lisibles avec pino-pretty.
- **Le standard plutôt que le maison.** OpenTelemetry pour les traces et les métriques, en W3C
  `traceparent`. Le protocole d'export est OTLP/HTTP.
- **Aucun secret ni contenu de joueur dans la télémétrie.** Les secrets sont masqués dans les
  logs (`REDACT_PATHS`). Les spans ne portent que des identifiants (campagne, personnage, type
  d'événement), jamais un texte de chat, une note ou une fiche.

## 2. Logs

- Chaque service écrit du JSON pino sur la sortie standard. Chaque ligne porte `service`,
  `version`, `env`, `trace_id` et `span_id`.
- Une ligne par requête HTTP, écrite par Fastify, avec `x-request-id` et `x-correlation-id`.
- **Logs métier** : une ligne `info` par changement d'état, écrite par le relais d'outbox après
  le COMMIT de la donnée. Son message est le type de l'événement (`dice.rolled`,
  `combat.attack_reported`…). Elle porte les identifiants (événement, agrégat, campagne, acteur,
  corrélation) et le `trace_id` de l'action d'origine, jamais le contenu (payload).
- **Refus** : une ligne `info` `request rejected` avec le statut et le code métier
  (`storage_quota_exceeded`, `upload_too_large`, `forbidden`…). Les erreurs inattendues sont en
  `error`, avec leur pile.
- **Navigateur** : les erreurs du front (exceptions, promesses rejetées, écrans plantés) partent
  en logs OTLP (§ 4).

## 3. Traces

### 3.1 Propagation

| Saut                           | Porteur                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| navigateur → gateway → service | en-tête `traceparent` (instrumentation fetch, puis HTTP)      |
| service → outbox → NATS        | `traceparent` de l'enveloppe, écrit dans la transaction       |
| NATS → consommateur            | span `CONSUMER`, enfant du `traceparent` de l'enveloppe       |
| realtime → navigateur          | non propagé (Socket.IO) ; le span de diffusion clôt la chaîne |

### 3.2 Spans d'infrastructure (`@vtt/platform`)

- `publish <sujet>` (`PRODUCER`) : publication par le relais d'outbox, enfant de la trace de
  l'événement.
- `process <type>` (`CONSUMER`) : traitement d'un événement par `consumeEvents`, enfant de la
  trace de l'événement. Attributs `messaging.*`, `vtt.event.type`, `vtt.campaign.id`.
- `task <nom>` : chaque passe d'une tâche planifiée (`periodic` : purge, inventaire, partitions).
- Le reste est automatique : HTTP, Fastify, Postgres, Redis et undici.

### 3.3 Spans métier

- Chaque route a son span (Fastify, automatique). Chaque événement écrit dans l'outbox y ajoute
  un événement de span `vtt.event` (`noteEvent`) : la trace d'une requête montre ce qu'elle a
  changé (type, agrégat). Le code métier d'un refus devient l'attribut `vtt.error.code`.
- Hors requête : `audio.job` (un job du worker), `task <nom>` (§ 3.2).
- Un nouveau traitement hors HTTP s'ouvre avec `withSpan('<domaine>.<action>', …)` et porte ses
  identifiants sous le préfixe `vtt.*`.

### 3.4 Échantillonnage

- **Serveur** : les variables standard `OTEL_TRACES_SAMPLER` et `OTEL_TRACES_SAMPLER_ARG`, lues
  par le SDK. Par défaut tout est gardé ; en prod, `parentbased_traceidratio`.
- **Navigateur** : `NEXT_PUBLIC_OTEL_SAMPLE_RATIO`, 1 par défaut. Le serveur suit la décision du
  navigateur (`parentbased`).

## 4. Navigateur

- Le SDK Web OpenTelemetry est chargé **après** le premier affichage (import dynamique, au
  premier moment libre). Il reste hors du bundle initial, et seulement si
  `NEXT_PUBLIC_OTEL_ENABLED=true`.
- **Traces** :
  - chargement de la page (`document-load`) ;
  - chaque `fetch` vers `/v1/*`, qui envoie le `traceparent` ;
  - spans métier du front : lancer de dés 3D, de la demande à la lecture des faces ; attaque.
- **Logs** : `window.onerror`, `unhandledrejection` et les limites d'erreur React. Ils sont
  regroupés par lots et dédoublonnés (une même erreur au plus une fois par minute).
- **Export** : `/v1/telemetry/traces` et `/v1/telemetry/logs` sur la gateway. Ses limites :
  - même origine que l'app, donc aucun collecteur exposé sur Internet ;
  - taille limitée à 256 Ko par envoi ;
  - débit limité par adresse IP.
- **Relais** : la gateway relaie l'OTLP tel quel vers `OTEL_EXPORTER_OTLP_ENDPOINT`. Sans
  collecteur, elle répond 204 et jette l'envoi.

## 5. Métriques

Exportées par le SDK de chaque service, toutes les 15 s, en OTLP (`telemetry.ts`).

| Métrique                    | Type                   | Attributs                 | Service  |
| --------------------------- | ---------------------- | ------------------------- | -------- |
| `vtt.events.published`      | compteur               | `type` (`dice.rolled`…)   | relais   |
| `vtt.http.rejected`         | compteur               | `status`, `code`, `route` | tous     |
| `vtt.bus.processed`         | compteur               | `consumer`, `outcome`     | tous     |
| `vtt.bus.process.duration`  | histogramme (ms)       | `consumer`                | tous     |
| `vtt.outbox.pending`        | jauge observée         | `schema`                  | relais   |
| `vtt.tasks.duration`        | histogramme (ms)       | `task`, `outcome`         | tous     |
| `vtt.audio.jobs`            | compteur               | `kind`, `outcome`         | audio    |
| `vtt.audio.job.duration`    | histogramme (ms)       | `kind`                    | audio    |
| `vtt.realtime.connections`  | compteur montant/desc. | —                         | realtime |
| `vtt.realtime.rate_limited` | compteur               | —                         | realtime |

Les métriques métier se lisent par type d'événement : jets (`dice.rolled`), attaques, rapports
appliqués… Les envois refusés se lisent par code (`storage_quota_exceeded`, `upload_too_large`).
Les métriques HTTP, Postgres et du runtime Node viennent de l'instrumentation automatique.

## 6. Variables d'environnement

| Variable                        | Où       | Effet                                              |
| ------------------------------- | -------- | -------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`   | services | collecteur OTLP/HTTP ; absent : rien n'est exporté |
| `OTEL_TRACES_SAMPLER(_ARG)`     | services | échantillonnage standard                           |
| `LOG_LEVEL`                     | services | niveau pino                                        |
| `NEXT_PUBLIC_OTEL_ENABLED`      | front    | charge le SDK Web                                  |
| `NEXT_PUBLIC_OTEL_SAMPLE_RATIO` | front    | part des sessions tracées (0 à 1)                  |

## 7. Lots

1. Plateforme : spans du bus (publication, consommation), tâches planifiées, métriques du bus et
   de l'outbox.
2. Spans et logs métier des services.
3. Métriques métier.
4. Gateway : relais OTLP du navigateur.
5. Navigateur : SDK Web, erreurs, spans du lancer de dés et de l'attaque.
