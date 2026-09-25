import { context, trace } from '@opentelemetry/api';
import { pino, type LoggerOptions, type Logger } from 'pino';

/**
 * Champs jamais écrits dans les logs, quel que soit leur niveau d'imbrication
 * dans les objets loggés (requêtes, erreurs, payloads).
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.cardNumber',
  'password',
  'token',
  'secret',
];

export interface LoggerSettings {
  service: string;
  version: string;
  env: string;
  level: string;
  /** Sortie lisible en développement ; JSON partout ailleurs. */
  pretty?: boolean;
}

/**
 * Options pino partagées : JSON structuré, horodatage ISO, niveau en texte,
 * secrets masqués, et `trace_id` / `span_id` ajoutés à chaque ligne pour
 * relier les logs (Loki) aux traces (Tempo).
 */
export function loggerOptions(s: LoggerSettings): LoggerOptions {
  return {
    level: s.level,
    base: { service: s.service, version: s.version, env: s.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: 'message',
    errorKey: 'error',
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    mixin() {
      const span = trace.getSpan(context.active());
      if (!span) return {};
      const { traceId, spanId, traceFlags } = span.spanContext();
      return { trace_id: traceId, span_id: spanId, trace_flags: traceFlags };
    },
    ...(s.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, messageKey: 'message', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}

export function createLogger(s: LoggerSettings): Logger {
  return pino(loggerOptions(s));
}

export type { Logger };
