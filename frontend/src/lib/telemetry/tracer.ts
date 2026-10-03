/**
 * Spans métier du navigateur : `@opentelemetry/api` seul, léger. Tant que le SDK n'est pas
 * chargé (ou s'il est désactivé), ils ne coûtent rien et ne partent nulle part.
 *
 * Limite : sans zone.js, le contexte ne survit pas à un `await`. Un span métier mesure une durée
 * et son issue ; les requêtes lancées pendant ont leur propre trace (span `fetch`), reliée au back.
 */
import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';

const tracer = () => trace.getTracer('web');

/** Ouvre un span métier ; `end` le ferme avec son issue et ses derniers attributs. */
export function startBusinessSpan(
  name: string,
  attributes: Attributes = {},
): { span: Span; end(outcome: string, more?: Attributes): void; fail(error: unknown): void } {
  const span = tracer().startSpan(name, { attributes });
  return {
    span,
    end(outcome, more = {}) {
      span.setAttributes({ ...more, 'vtt.outcome': outcome });
      span.end();
    },
    fail(error) {
      const e = error instanceof Error ? error : new Error(String(error));
      span.recordException(e);
      span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
      span.setAttribute('vtt.outcome', 'error');
      span.end();
    },
  };
}
