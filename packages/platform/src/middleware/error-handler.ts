import { PROBLEM_CONTENT_TYPE, type Problem } from '@vtt/contracts';
import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { currentTraceId } from '../tracing.js';

/**
 * Erreur prête à journaliser, sans données de la requête SQL : les erreurs de
 * Drizzle portent les paramètres (hash de mot de passe, empreinte de jeton…)
 * dans `params` et dans leur message (« params: … »). On garde le type, le code
 * SQL, la contrainte et la pile, jamais les valeurs.
 */
export function erreurJournalisable(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { message: String(err) };
  const cause = (err as { cause?: unknown }).cause as
    { code?: string; constraint?: string; table?: string; message?: string } | undefined;
  const sansParams = (m: string) => m.replace(/\nparams:[\s\S]*$/, '');
  return {
    type: err.name,
    message: sansParams(err.message),
    stack: err.stack ? sansParams(err.stack) : undefined,
    ...(cause && typeof cause === 'object'
      ? {
          cause: {
            code: cause.code,
            constraint: cause.constraint,
            table: cause.table,
            message: cause.message ? sansParams(cause.message) : undefined,
          },
        }
      : {}),
  };
}

/** Erreur métier à lever dans les handlers : elle devient un problem+json propre. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly code?: string,
    public readonly detail?: string,
  ) {
    super(detail ?? title);
    this.name = 'HttpError';
  }
  static badRequest(detail?: string, code = 'bad_request') {
    return new HttpError(400, 'Requête invalide', code, detail);
  }
  static unauthorized(detail?: string) {
    return new HttpError(401, 'Authentification requise', 'unauthorized', detail);
  }
  static forbidden(detail?: string) {
    return new HttpError(403, 'Accès refusé', 'forbidden', detail);
  }
  static notFound(detail?: string) {
    return new HttpError(404, 'Ressource introuvable', 'not_found', detail);
  }
  static conflict(detail?: string, code = 'conflict') {
    return new HttpError(409, 'Conflit', code, detail);
  }
}

/**
 * Toutes les erreurs sortent en RFC 9457. Les 5xx ne divulguent jamais le
 * message interne ; elles sont loggées en `error` avec la pile, les 4xx en `info`.
 */
export const errorHandler = fp(
  async (app: FastifyInstance) => {
    app.setNotFoundHandler((req, reply) => {
      const body: Problem = {
        type: 'about:blank',
        title: 'Route introuvable',
        status: 404,
        code: 'route_not_found',
        instance: req.url,
        requestId: req.id,
      };
      reply.code(404).type(PROBLEM_CONTENT_TYPE).send(body);
    });

    app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
      const traceId = currentTraceId();
      let body: Problem;

      if (hasZodFastifySchemaValidationErrors(err)) {
        body = {
          type: 'about:blank',
          title: 'Requête invalide',
          status: 400,
          code: 'validation_failed',
          errors: err.validation.map((v) => ({
            path: v.instancePath || '/',
            message: v.message ?? 'invalide',
          })),
        };
      } else if (err instanceof HttpError) {
        body = {
          type: 'about:blank',
          title: err.title,
          status: err.status,
          code: err.code,
          detail: err.detail,
        };
      } else if (isResponseSerializationError(err)) {
        body = { type: 'about:blank', title: 'Erreur interne', status: 500, code: 'internal' };
      } else {
        const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
        body =
          status >= 500
            ? { type: 'about:blank', title: 'Erreur interne', status, code: 'internal' }
            : { type: 'about:blank', title: err.message, status, code: err.code?.toLowerCase() };
      }

      body.instance = req.url;
      body.requestId = req.id;
      if (traceId) body.traceId = traceId;

      if (body.status >= 500) req.log.error({ error: erreurJournalisable(err) }, 'request failed');
      else req.log.info({ status: body.status, code: body.code }, 'request rejected');

      reply.code(body.status).type(PROBLEM_CONTENT_TYPE).send(body);
    });
  },
  { name: 'vtt-error-handler' },
);
