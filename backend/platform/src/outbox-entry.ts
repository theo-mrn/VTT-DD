/**
 * Événement à écrire dans l'outbox d'un service, dans la transaction de la donnée (docs/bus.md) :
 * enveloppe commune validée contre le contrat partagé (un événement mal formé fait échouer la
 * transaction) et son sujet NATS. Chaque service garde sa table et son insertion, puis note
 * l'événement dans la trace (`noteEvent`) ; l'enveloppe est construite ici, une seule fois.
 */
import { EventEnvelope, subjectFor, uuidv7, type Actor, type Visibility } from '@vtt/contracts';

export interface EventContext {
  correlationId: string;
  traceparent?: string | null;
}

export interface OutboxEvent {
  type: string;
  actor: Actor;
  aggregate: { type: string; id: string };
  payload: Record<string, unknown>;
  visibility?: Visibility;
  /** Campagne concernée : champ `roomId` de l'enveloppe commune (sujet vtt.<id>.…). */
  campaignId?: string | null;
}

/**
 * Ligne de l'outbox d'un événement (`id`, `subject`, `envelope`), sa visibilité par défaut
 * donnée par le service ; l'appelant l'insère dans sa transaction.
 */
export function outboxEntry(
  ctx: EventContext,
  event: OutboxEvent,
  defaultVisibility: (event: OutboxEvent) => Visibility,
): { id: string; subject: string; envelope: EventEnvelope } {
  const envelope = EventEnvelope.parse({
    id: uuidv7(),
    type: event.type,
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId: event.campaignId ?? null,
    actor: event.actor,
    aggregate: event.aggregate,
    visibility: event.visibility ?? defaultVisibility(event),
    payload: event.payload,
    correlationId: ctx.correlationId,
    traceparent: ctx.traceparent ?? null,
  });
  return { id: envelope.id, subject: subjectFor(envelope), envelope };
}
