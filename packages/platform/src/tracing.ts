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
