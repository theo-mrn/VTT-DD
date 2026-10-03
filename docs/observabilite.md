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
- **Logs métier** : une ligne `info` par action qui change l'état (jet, attaque, rapport appliqué,
  envoi refusé, tâche planifiée). Elle reprend le même nom que le span (§ 3.3). Les erreurs
  inattendues sont en `error`, avec leur pile. Les refus normaux (droits, quota) sont en `warn`.
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

Ils sont nommés `<domaine>.<action>`. Exemples : `dice.roll`, `combat.attack.report`,
`combat.report.apply`, `uploads.ticket`, `storage.reserve`, `audio.job`, `history.append`.
Chacun est ouvert par `withSpan` et porte les identifiants utiles sous le préfixe `vtt.*`.

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

| Métrique                     | Type                 | Attributs                | Service  |
| ---------------------------- | -------------------- | ------------------------ | -------- |
| `vtt.dice.rolls`             | compteur             | `mode` (serveur, client) | dice     |
| `vtt.combat.attacks`         | compteur             | `outcome`                | campaign |
| `vtt.combat.reports.applied` | compteur             | `decision`               | campaign |
| `vtt.uploads.refused`        | compteur             | `reason` (quota, taille) | campaign |
| `vtt.storage.bytes`          | jauge observée       | —                        | campaign |
| `vtt.realtime.connections`   | jauge montante/desc. | —                        | realtime |
| `vtt.bus.processed`          | compteur             | `consumer`, `outcome`    | tous     |
| `vtt.bus.process.duration`   | histogramme (ms)     | `consumer`               | tous     |
| `vtt.outbox.pending`         | jauge observée       | `schema`                 | relais   |
| `vtt.audio.jobs`             | compteur             | `outcome`                | audio    |
| `vtt.tasks.duration`         | histogramme (ms)     | `task`, `outcome`        | tous     |

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
