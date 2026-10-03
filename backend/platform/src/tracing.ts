import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
} from '@opentelemetry/api';

const tracer = () => trace.getTracer('@vtt/platform');

/**
 * Exécute `fn` dans un span enfant. Les erreurs sont enregistrées sur le span
 * puis relancées ; le span est toujours fermé.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes: Attributes = {},
): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** traceparent W3C du contexte courant, à placer dans l'enveloppe d'événement. */
export function currentTraceparent(): string | null {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent ?? null;
}

/** Reconstruit le contexte d'un producteur côté consommateur du bus. */
export function contextFromTraceparent(traceparent: string | null | undefined): Context {
  if (!traceparent) return context.active();
  return propagation.extract(context.active(), { traceparent });
}

export function currentTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  const id = span?.spanContext().traceId;
  return id && id !== '00000000000000000000000000000000' ? id : undefined;
}

/**
 * Marque sur le span en cours (la requête) l'événement de domaine qu'elle vient d'écrire dans
 * l'outbox : la trace montre ce que l'action a changé. Identifiants seulement, jamais le contenu.
 */
export function noteEvent(event: {
  id: string;
  type: string;
  roomId: string | null;
  aggregate: { type: string; id: string };
}): void {
  const span = trace.getSpan(context.active());
  if (!span) return;
  span.addEvent('vtt.event', {
    'vtt.event.id': event.id,
    'vtt.event.type': event.type,
    'vtt.aggregate.type': event.aggregate.type,
    'vtt.aggregate.id': event.aggregate.id,
  });
  if (event.roomId) span.setAttribute('vtt.campaign.id', event.roomId);
}

/** Identifiant de trace d'un `traceparent` W3C (`00-<trace>-<span>-<flags>`). */
export function traceIdOf(traceparent: string | null | undefined): string | undefined {
  const id = traceparent?.split('-')[1];
  return id && /^[0-9a-f]{32}$/.test(id) && !/^0+$/.test(id) ? id : undefined;
}
