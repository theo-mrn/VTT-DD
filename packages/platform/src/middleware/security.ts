import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import underPressure from '@fastify/under-pressure';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Redis } from 'ioredis';

export interface SecurityOptions {
  corsOrigins: string[];
  rateLimit: { max: number; timeWindow: string };
  /** Compteurs partagés entre réplicas ; sans Redis, limite par instance. */
  redis?: Redis;
}

export const security = fp<SecurityOptions>(
  async (app: FastifyInstance, opts) => {
    await app.register(helmet, {
      // API JSON : pas de HTML servi, CSP la plus stricte possible
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    });

    await app.register(cors, {
      origin: opts.corsOrigins.length ? opts.corsOrigins : false,
      credentials: true,
      exposedHeaders: ['x-request-id', 'x-correlation-id', 'x-trace-id', 'retry-after'],
    });

    await app.register(rateLimit, {
      max: opts.rateLimit.max,
      timeWindow: opts.rateLimit.timeWindow,
      redis: opts.redis,
      nameSpace: 'rl:',
      // Par IP réelle (trustProxy derrière Traefik). Pas par jeton : il n'est pas
      // encore vérifié à ce stade et un attaquant pourrait en forger à l'infini.
      keyGenerator: (req) => req.ip,
      allowList: (req) => req.url === '/healthz' || req.url === '/readyz',
      skipOnError: true,
    });

    // Répond 503 plutôt que de s'effondrer quand la boucle d'événements sature
    await app.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxEventLoopUtilization: 0.98,
      retryAfter: 10,
      exposeStatusRoute: false,
    });
  },
  { name: 'vtt-security' },
);
