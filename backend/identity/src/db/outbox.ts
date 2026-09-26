/**
 * Écriture d'un événement dans l'outbox, dans la transaction de la donnée :
 * l'état et sa trace sont enregistrés ensemble ou pas du tout.
 * Le relais (plus tard) publie ensuite ces lignes sur NATS JetStream.
 */
import { EventEnvelope, subjectFor, uuidv7, type Actor, type Visibility } from '@vtt/contracts';
import type { Db } from './client.js';
import { outbox } from './schema.js';

/** Transaction Drizzle (même API que la base, restreinte à la transaction en cours). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface EventContext {
  correlationId: string;
  traceparent?: string | null;
}

export async function appendEvent(
  tx: Tx,
  ctx: EventContext,
  event: {
    type: string;
    actor: Actor;
    aggregate: { type: string; id: string };
    payload: Record<string, unknown>;
    visibility?: Visibility;
    roomId?: string | null;
  },
): Promise<EventEnvelope> {
  // Validé contre le contrat partagé : un événement mal formé fait échouer la transaction
  const envelope = EventEnvelope.parse({
    id: uuidv7(),
    type: event.type,
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId: event.roomId ?? null,
    actor: event.actor,
    aggregate: event.aggregate,
    visibility: event.visibility ?? 'owner',
    payload: event.payload,
    correlationId: ctx.correlationId,
    traceparent: ctx.traceparent ?? null,
  });
  await tx.insert(outbox).values({ id: envelope.id, subject: subjectFor(envelope), envelope });
  return envelope;
}
