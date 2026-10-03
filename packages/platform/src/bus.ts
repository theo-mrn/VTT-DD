/**
 * Bus d'événements : NATS JetStream.
 *
 * Tous les événements (enveloppe `@vtt/contracts`) passent par un seul flux,
 * `VTT_EVENTS`, sur les sujets `vtt.<campaignId|global>.<domaine>.<action>`.
 * - les services publient (via leur relais d'outbox) avec l'id de l'événement
 *   comme `Nats-Msg-Id` : JetStream écarte les doublons dans sa fenêtre ;
 * - history consomme en durable (tout rejouer, ack explicite) ;
 * - realtime consomme en éphémère ordonné (seulement le nouveau).
 */
import {
  AckPolicy,
  DeliverPolicy,
  jetstream,
  jetstreamManager,
  RetentionPolicy,
  StorageType,
  type JetStreamClient,
  type JetStreamManager,
  type JsMsg,
} from '@nats-io/jetstream';
import { connect, nanos, type NatsConnection } from '@nats-io/transport-node';
import { SpanKind, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { parseEvent, subjectFor, type EventEnvelope } from '@vtt/contracts';
import type { Logger } from 'pino';
import { lazyInstruments } from './metrics.js';
import { contextFromTraceparent } from './tracing.js';

export const EVENTS_STREAM = 'VTT_EVENTS';

/** Rejeu possible pendant 7 jours ; history garde tout en Postgres. */
const RETENTION_MS = 7 * 24 * 3600 * 1000;
/** Fenêtre de dédoublonnage par `Nats-Msg-Id` (relais qui republie après une coupure). */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export interface Bus {
  nc: NatsConnection;
  js: JetStreamClient;
  jsm: JetStreamManager;
  close(): Promise<void>;
}

/** Connexion au bus ; crée ou met à jour le flux `VTT_EVENTS`. */
/**
 * Serveurs et identifiants d'une URL NATS (`nats://user:pass@hôte:4222`, plusieurs
 * serveurs séparés par des virgules). nats.js ignore les identifiants placés dans
 * l'URL : ils sont extraits ici et passés en options `user`/`pass`.
 */
export function parseNatsUrl(url: string): { servers: string[]; user?: string; pass?: string } {
  const parsed = url
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new URL(s.includes('://') ? s : `nats://${s}`));
  const withAuth = parsed.find((u) => u.username);
  return {
    servers: parsed.map((u) => `${u.protocol}//${u.host}`),
    ...(withAuth
      ? {
          user: decodeURIComponent(withAuth.username),
          ...(withAuth.password ? { pass: decodeURIComponent(withAuth.password) } : {}),
        }
      : {}),
  };
}

export async function connectBus(opts: {
  url: string;
  name: string;
  logger?: Logger;
  /**
   * Réplicas du flux `VTT_EVENTS` (1 aujourd'hui, 3 avec un NATS en cluster).
   * Par défaut `NATS_STREAM_REPLICAS`, sinon 1.
   */
  streamReplicas?: number;
}): Promise<Bus> {
  const nc = await connect({
    ...parseNatsUrl(opts.url),
    name: opts.name,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 1000,
  });
  void (async () => {
    for await (const s of nc.status()) {
      if (s.type === 'disconnect' || s.type === 'reconnect' || s.type === 'error') {
        opts.logger?.warn({ bus: s.type }, 'bus NATS : changement d’état');
      }
    }
  })();
  let jsm: JetStreamManager;
  try {
    jsm = await jetstreamManager(nc);
    await ensureEventStream(
      jsm,
      opts.streamReplicas ?? (Number(process.env.NATS_STREAM_REPLICAS) || 1),
    );
  } catch (err) {
    // Pas de connexion orpheline quand l'appelant réessaie en boucle (relais d'outbox)
    await nc.close().catch(() => undefined);
    throw err;
  }
  return {
    nc,
    js: jetstream(nc),
    jsm,
    close: () => nc.drain(),
  };
}

export async function ensureEventStream(jsm: JetStreamManager, replicas = 1): Promise<void> {
  const config = {
    name: EVENTS_STREAM,
    subjects: ['vtt.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    num_replicas: replicas,
    max_age: nanos(RETENTION_MS),
    duplicate_window: nanos(DUPLICATE_WINDOW_MS),
  };
  try {
    await jsm.streams.info(EVENTS_STREAM);
    await jsm.streams.update(EVENTS_STREAM, config);
  } catch {
    await jsm.streams.add(config);
  }
}

const tracer = () => trace.getTracer('@vtt/platform');

const busMetrics = lazyInstruments((m) => ({
  processed: m.createCounter('vtt.bus.processed', {
    description: 'Événements traités par un consommateur du bus',
  }),
  duration: m.createHistogram('vtt.bus.process.duration', {
    description: 'Durée de traitement d’un événement',
    unit: 'ms',
  }),
}));

/** Attributs de trace d'un événement : identifiants seulement, jamais son contenu. */
function eventAttributes(event: EventEnvelope, subject: string): Attributes {
  return {
    'messaging.system': 'nats',
    'messaging.destination.name': subject,
    'messaging.message.id': event.id,
    'vtt.event.type': event.type,
    'vtt.correlation.id': event.correlationId,
    ...(event.roomId ? { 'vtt.campaign.id': event.roomId } : {}),
  };
}

/**
 * Publie un événement ; `duplicate` vaut true si JetStream l'avait déjà. Le span de publication
 * est un enfant de la trace qui a produit l'événement (son `traceparent`), pas du relais.
 */
export async function publishEvent(
  bus: Pick<Bus, 'js'>,
  event: EventEnvelope,
  subject = subjectFor(event),
): Promise<{ seq: number; duplicate: boolean }> {
  return tracer().startActiveSpan(
    `publish ${subject}`,
    { kind: SpanKind.PRODUCER, attributes: eventAttributes(event, subject) },
    contextFromTraceparent(event.traceparent),
    async (span) => {
      try {
        const ack = await bus.js.publish(subject, JSON.stringify(event), { msgID: event.id });
        span.setAttribute('vtt.bus.duplicate', ack.duplicate);
        return { seq: ack.seq, duplicate: ack.duplicate };
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export interface ConsumeOptions {
  /** Nom du consommateur durable (history) ; absent : consommateur éphémère ordonné (realtime). */
  durable?: string;
  /** Nom du consommateur dans les métriques ; par défaut `durable`, sinon `ephemeral`. */
  name?: string;
  /** Sujets filtrés, ex. `vtt.>` ou `vtt.<campaignId>.>`. */
  subjects?: string[];
  /** `all` : depuis le début du flux ; `new` : seulement les prochains. */
  deliver?: 'all' | 'new';
  /**
   * Reprise à partir de cette séquence du flux, incluse (`by_start_sequence`),
   * ex. dernier `seq` reçu + 1. Prioritaire sur `deliver`. Pour un durable,
   * seulement à sa création.
   */
  startSeq?: number;
  logger?: Logger;
  /**
   * Traite un événement. Si la promesse est rejetée, le message est relivré
   * plus tard (durable) ; les messages illisibles sont acquittés et ignorés.
   */
  handler(event: EventEnvelope, msg: JsMsg): Promise<void>;
}

/** Consomme le flux ; renvoie une fonction d'arrêt. */
export async function consumeEvents(bus: Bus, opts: ConsumeOptions): Promise<() => Promise<void>> {
  const subjects = opts.subjects ?? ['vtt.>'];
  const start =
    opts.startSeq !== undefined
      ? {
          deliver_policy: DeliverPolicy.StartSequence,
          opt_start_seq: Math.max(1, Math.floor(opts.startSeq)),
        }
      : { deliver_policy: opts.deliver === 'new' ? DeliverPolicy.New : DeliverPolicy.All };
  let consumer;
  if (opts.durable) {
    const config = {
      durable_name: opts.durable,
      ack_policy: AckPolicy.Explicit,
      ...start,
      filter_subjects: subjects,
      max_deliver: -1,
      ack_wait: nanos(30_000),
    };
    try {
      await bus.jsm.consumers.info(EVENTS_STREAM, opts.durable);
      await bus.jsm.consumers.update(EVENTS_STREAM, opts.durable, {
        filter_subjects: subjects,
        ack_wait: config.ack_wait,
      });
    } catch {
      await bus.jsm.consumers.add(EVENTS_STREAM, config);
    }
    consumer = await bus.js.consumers.get(EVENTS_STREAM, opts.durable);
  } else {
    consumer = await bus.js.consumers.get(EVENTS_STREAM, { filter_subjects: subjects, ...start });
  }

  const name = opts.name ?? opts.durable ?? 'ephemeral';
  const messages = await consumer.consume();
  const done = (async () => {
    for await (const msg of messages) {
      let event: EventEnvelope;
      try {
        event = parseEvent(msg.json());
      } catch (err) {
        opts.logger?.error(
          { err, subject: msg.subject, seq: msg.seq },
          'événement illisible ignoré',
        );
        msg.ack();
        continue;
      }
      // Traitement dans la trace qui a produit l'événement : ses logs portent son trace_id
      const started = performance.now();
      const ok = await tracer().startActiveSpan(
        `process ${event.type}`,
        {
          kind: SpanKind.CONSUMER,
          attributes: { ...eventAttributes(event, msg.subject), 'vtt.bus.consumer': name },
        },
        contextFromTraceparent(event.traceparent),
        async (span) => {
          try {
            await opts.handler(event, msg);
            if (opts.durable) msg.ack();
            return true;
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
            opts.logger?.error(
              { err, eventId: event.id, type: event.type },
              'échec du traitement, relivraison',
            );
            if (opts.durable) msg.nak(5_000);
            return false;
          } finally {
            span.end();
          }
        },
      );
      const m = busMetrics();
      m.processed.add(1, { consumer: name, outcome: ok ? 'ok' : 'error' });
      m.duration.record(performance.now() - started, { consumer: name });
    }
  })();

  return async () => {
    await messages.close();
    await done;
  };
}

/** Dernière séquence du flux (0 s'il est vide) : curseur de départ d'un client. */
export async function streamLastSeq(bus: Pick<Bus, 'jsm'>): Promise<number> {
  return (await bus.jsm.streams.info(EVENTS_STREAM)).state.last_seq;
}

export interface ReplayOptions {
  /** Sujets relus, ex. `vtt.<campaignId>.>`. */
  subjects: string[];
  /** Première séquence du flux relue (incluse), ex. dernier `seq` reçu + 1. */
  startSeq: number;
  /** Au-delà de ce nombre d'événements, rien n'est relu (`truncated`). */
  max: number;
  logger?: Logger;
  /** Reçoit les événements dans l'ordre du flux ; les messages illisibles sont ignorés. */
  handler(event: EventEnvelope, msg: JsMsg): void | Promise<void>;
}

export interface ReplayResult {
  /** Événements transmis au handler. */
  count: number;
  /** Séquence du dernier message relu ; null si aucun. */
  lastSeq: number | null;
  /**
   * Rejeu impossible ou incomplet : plus de `max` événements, ou messages déjà
   * sortis du flux (rétention). Le client doit recharger son état.
   */
  truncated: boolean;
  /** Dernière séquence du flux au début du rejeu. */
  streamLastSeq: number;
}

/**
 * Rejoue les événements de `subjects` depuis `startSeq` jusqu'à la fin actuelle
 * du flux, puis s'arrête (consommateur éphémère ordonné, supprimé ensuite).
 * Sert à realtime pour rattraper un client qui se reconnecte avec son dernier `seq`.
 */
export async function replayEvents(
  bus: Pick<Bus, 'js' | 'jsm'>,
  opts: ReplayOptions,
): Promise<ReplayResult> {
  const { first_seq, last_seq } = (await bus.jsm.streams.info(EVENTS_STREAM)).state;
  const start = Math.max(1, Math.floor(opts.startSeq));
  const result: ReplayResult = {
    count: 0,
    lastSeq: null,
    truncated: false,
    streamLastSeq: last_seq,
  };
  if (start > last_seq) return result;
  // Des messages entre `start` et le début du flux ont expiré : rejeu incomplet
  if (first_seq > start) return { ...result, truncated: true };

  const consumer = await bus.js.consumers.get(EVENTS_STREAM, {
    filter_subjects: opts.subjects,
    deliver_policy: DeliverPolicy.StartSequence,
    opt_start_seq: start,
    inactive_threshold: 60_000,
  });
  try {
    let remaining = (await consumer.info(true)).num_pending;
    if (remaining > opts.max) return { ...result, truncated: true };
    while (remaining > 0) {
      const batch = await consumer.fetch({
        max_messages: Math.min(remaining, 256),
        expires: 5_000,
      });
      let received = 0;
      for await (const msg of batch) {
        received += 1;
        remaining -= 1;
        result.lastSeq = msg.seq;
        let event: EventEnvelope;
        try {
          event = parseEvent(msg.json());
        } catch (err) {
          opts.logger?.error(
            { err, subject: msg.subject, seq: msg.seq },
            'événement illisible ignoré',
          );
          continue;
        }
        await opts.handler(event, msg);
        result.count += 1;
      }
      // Messages supprimés entre-temps : on s'arrête sur ce qui a été lu
      if (!received) {
        result.truncated = true;
        break;
      }
    }
    return result;
  } finally {
    await consumer.delete().catch(() => undefined);
  }
}
