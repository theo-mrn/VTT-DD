import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { currentTraceId } from '../tracing.js';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  roomId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Contexte de la requête en cours, accessible partout sans le passer en paramètre. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Réutilise l'identifiant fourni par l'appelant s'il est sûr, sinon en génère un. */
export function genRequestId(req: { headers: Record<string, unknown> }): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

/**
 * - x-request-id : propre à chaque saut HTTP ;
 * - x-correlation-id : suit une action utilisateur à travers les services et
 *   le bus (il devient `correlationId` dans l'enveloppe d'événement) ;
 * - x-trace-id : renvoyé au client pour retrouver la trace dans Grafana.
 */
export const requestContext = fp(
  async (app: FastifyInstance) => {
    app.decorateRequest('ctx', undefined as unknown as RequestContext);

    app.addHook('onRequest', (req: FastifyRequest, reply, done) => {
      const corr = req.headers['x-correlation-id'];
      const ctx: RequestContext = {
        requestId: req.id,
        correlationId: typeof corr === 'string' && SAFE_ID.test(corr) ? corr : req.id,
      };
      req.ctx = ctx;
      reply.header('x-request-id', ctx.requestId);
      reply.header('x-correlation-id', ctx.correlationId);
      const traceId = currentTraceId();
      if (traceId) reply.header('x-trace-id', traceId);
      storage.run(ctx, done);
    });
  },
  { name: 'vtt-request-context' },
);
