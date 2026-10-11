/**
 * Écriture d'un événement dans l'outbox, dans la transaction de la donnée :
 * l'état et sa trace sont enregistrés ensemble ou pas du tout.
 * Le relais (plus tard) publie ensuite ces lignes sur NATS JetStream.
 */
import type { EventEnvelope } from '@vtt/contracts';
import { noteEvent, outboxEntry, type EventContext, type OutboxEvent } from '@vtt/platform';
import type { Db } from './client.js';
import { outbox } from './schema.js';

/** Transaction Drizzle (même API que la base, restreinte à la transaction en cours). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type { EventContext };

export async function appendEvent(
  tx: Tx,
  ctx: EventContext,
  event: OutboxEvent,
): Promise<EventEnvelope> {
  const entry = outboxEntry(ctx, event, () => 'public');
  await tx.insert(outbox).values(entry);
  noteEvent(entry.envelope);
  return entry.envelope;
}
