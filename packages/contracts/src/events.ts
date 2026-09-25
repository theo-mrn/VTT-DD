import { z } from 'zod';

/**
 * Enveloppe commune à tous les événements publiés sur le bus.
 * C'est aussi le format stocké par le service history (journal append-only).
 */
export const ActorRole = z.enum(['gm', 'player', 'system']);
export type ActorRole = z.infer<typeof ActorRole>;

export const Visibility = z.enum(['public', 'gm_only', 'owner']);
export type Visibility = z.infer<typeof Visibility>;

export const Actor = z.object({
  userId: z.uuid().nullable(),
  role: ActorRole,
  characterId: z.uuid().nullable().default(null),
});
export type Actor = z.infer<typeof Actor>;

export const Aggregate = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

/** `domaine.action` en snake_case, ex. `character.hp_changed`. */
export const EventType = z.string().regex(/^[a-z]+(?:_[a-z]+)*\.[a-z]+(?:_[a-z]+)*$/, {
  message: 'type attendu : domaine.action en snake_case',
});

export const EventEnvelope = z.object({
  id: z.uuid(),
  type: EventType,
  version: z.number().int().positive(),
  occurredAt: z.iso.datetime({ offset: true }),
  roomId: z.uuid().nullable(),
  actor: Actor,
  aggregate: Aggregate,
  visibility: Visibility.default('public'),
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.string().min(1),
  causationId: z.string().nullable().default(null),
  /** W3C traceparent : relie l'événement à la trace HTTP qui l'a produit. */
  traceparent: z.string().nullable().default(null),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;
export type EventEnvelopeInput = z.input<typeof EventEnvelope>;

/** Sujet NATS : vtt.<roomId|global>.<domaine>.<action> */
export function subjectFor(event: Pick<EventEnvelope, 'type' | 'roomId'>): string {
  const [domain, action] = event.type.split('.') as [string, string];
  return `vtt.${event.roomId ?? 'global'}.${domain}.${action}`;
}

export function parseEvent(input: unknown): EventEnvelope {
  return EventEnvelope.parse(input);
}
