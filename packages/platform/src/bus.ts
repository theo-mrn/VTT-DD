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
import { parseEvent, subjectFor, type EventEnvelope } from '@vtt/contracts';
import type { Logger } from 'pino';

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
export async function connectBus(opts: {
  url: string;
  name: string;
  logger?: Logger;
}): Promise<Bus> {
  const nc = await connect({
    servers: opts.url.split(','),
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
  const jsm = await jetstreamManager(nc);
  await ensureEventStream(jsm);
  return {
    nc,
    js: jetstream(nc),
    jsm,
    close: () => nc.drain(),
  };
}

export async function ensureEventStream(jsm: JetStreamManager): Promise<void> {
  const config = {
    name: EVENTS_STREAM,
    subjects: ['vtt.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
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

/** Publie un événement ; `duplicate` vaut true si JetStream l'avait déjà. */
export async function publishEvent(
  bus: Pick<Bus, 'js'>,
  event: EventEnvelope,
  subject = subjectFor(event),
): Promise<{ seq: number; duplicate: boolean }> {
  const ack = await bus.js.publish(subject, JSON.stringify(event), { msgID: event.id });
  return { seq: ack.seq, duplicate: ack.duplicate };
}

export interface ConsumeOptions {
  /** Nom du consommateur durable (history) ; absent : consommateur éphémère ordonné (realtime). */
  durable?: string;
  /** Sujets filtrés, ex. `vtt.>` ou `vtt.<campaignId>.>`. */
  subjects?: string[];
  /** `all` : depuis le début du flux ; `new` : seulement les prochains. */
  deliver?: 'all' | 'new';
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
  const deliver = opts.deliver === 'new' ? DeliverPolicy.New : DeliverPolicy.All;
  let consumer;
  if (opts.durable) {
    const config = {
      durable_name: opts.durable,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: deliver,
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
    consumer = await bus.js.consumers.get(EVENTS_STREAM, {
      filter_subjects: subjects,
      deliver_policy: deliver,
    });
  }

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
      try {
        await opts.handler(event, msg);
        if (opts.durable) msg.ack();
      } catch (err) {
        opts.logger?.error(
          { err, eventId: event.id, type: event.type },
          'échec du traitement, relivraison',
        );
        if (opts.durable) msg.nak(5_000);
      }
    }
  })();

  return async () => {
    await messages.close();
    await done;
  };
}
