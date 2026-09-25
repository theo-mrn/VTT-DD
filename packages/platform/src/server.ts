import swagger from '@fastify/swagger';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { pino, type DestinationStream } from 'pino';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { Redis } from 'ioredis';
import type { BaseConfig } from './config.js';
import { Cache, MemoryStore, RedisStore } from './cache.js';
import { health, type ReadinessCheck } from './health.js';
import { loggerOptions } from './logger.js';
import { auth, type AuthOptions } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { idempotency } from './middleware/idempotency.js';
import { genRequestId, requestContext } from './middleware/request-context.js';
import { security } from './middleware/security.js';

export type App = FastifyInstance & { withTypeProvider(): FastifyInstance };

export interface ServiceOptions {
  config: BaseConfig;
  /** Vérifications de /readyz propres au service (Postgres, NATS…). */
  readiness?: Record<string, ReadinessCheck>;
  /** Fermetures à exécuter à l'arrêt (pools, consommateurs…), dans l'ordre. */
  onShutdown?: Array<() => Promise<void>>;
  /** Désactive le JWT pour un service sans route protégée. */
  auth?: boolean;
  /** Résolveur de clé JWT fourni directement (tests), à la place de JWKS_URL. */
  authKeyResolver?: AuthOptions['keyResolver'];
  /** Destination des logs (tests : capture en mémoire). */
  logStream?: DestinationStream;
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: Cache;
    redis?: Redis;
  }
}

/**
 * Construit un service Fastify avec toute la chaîne commune, dans cet ordre :
 * contexte de requête → sécurité (helmet, CORS, rate limit, under-pressure)
 * → auth JWT → idempotence → routes, avec logs JSON corrélés aux traces,
 * erreurs RFC 9457, OpenAPI généré depuis les schémas Zod, sondes k8s.
 */
export async function createService(opts: ServiceOptions) {
  const c = opts.config;

  const logOpts = loggerOptions({
    service: c.SERVICE_NAME,
    version: c.SERVICE_VERSION,
    env: c.NODE_ENV,
    level: c.LOG_LEVEL,
    pretty: c.NODE_ENV === 'development' && !opts.logStream,
  });
  const app = Fastify({
    loggerInstance: opts.logStream ? pino(logOpts, opts.logStream) : pino(logOpts),
    genReqId: genRequestId,
    logController: new LogController({
      requestIdLogLabel: 'request_id',
      // Les sondes Kubernetes passent toutes les 10 s : inutile de les logger
      disableRequestLogging: (req) => req.url === '/healthz' || req.url === '/readyz',
    }),
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const redis = c.REDIS_URL
    ? new Redis(c.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
      })
    : undefined;
  if (redis) {
    redis.on('error', (err) => app.log.warn({ error: err }, 'redis error'));
    await redis
      .connect()
      .catch((err) => app.log.error({ error: err }, 'redis unreachable at boot'));
  }
  const store = redis ? new RedisStore(redis) : new MemoryStore();
  const cache = new Cache(
    store,
    { namespace: c.SERVICE_NAME, defaultTtlSeconds: c.CACHE_DEFAULT_TTL_SECONDS },
    (err, op) => app.log.warn({ error: err, op }, 'cache degraded'),
  );
  app.decorate('cache', cache);
  app.decorate('redis', redis);

  await app.register(requestContext);
  await app.register(errorHandler);
  await app.register(security, {
    corsOrigins: c.CORS_ORIGINS,
    rateLimit: { max: c.RATE_LIMIT_MAX, timeWindow: c.RATE_LIMIT_WINDOW },
    redis,
  });
  if (
    opts.auth !== false &&
    (c.JWKS_URL || opts.authKeyResolver) &&
    c.JWT_ISSUER &&
    c.JWT_AUDIENCE
  ) {
    await app.register(auth, {
      jwksUrl: c.JWKS_URL,
      keyResolver: opts.authKeyResolver,
      issuer: c.JWT_ISSUER,
      audience: c.JWT_AUDIENCE,
    });
  }
  await app.register(idempotency, { cache });
  await app.register(health, {
    checks: { ...(redis ? { redis: () => cache.ping() } : {}), ...opts.readiness },
  });
  await app.register(swagger, {
    openapi: { info: { title: c.SERVICE_NAME, version: c.SERVICE_VERSION } },
    transform: jsonSchemaTransform,
  });
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  app.addHook('onClose', async () => {
    for (const fn of opts.onShutdown ?? []) await fn();
    await redis?.quit().catch(() => undefined);
  });

  return app;
}

/**
 * Démarre l'écoute et gère SIGTERM/SIGINT : /readyz passe à 503, on laisse
 * le temps à Kubernetes de retirer le pod, puis on ferme proprement.
 */
export async function start(
  app: Awaited<ReturnType<typeof createService>>,
  c: Pick<BaseConfig, 'HOST' | 'PORT'>,
  drainMs = 5000,
): Promise<void> {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutdown requested');
    app.markShuttingDown();
    await new Promise((r) => setTimeout(r, drainMs));
    try {
      await app.close();
      const { shutdownTelemetry } = await import('./telemetry.js');
      await shutdownTelemetry();
      process.exit(0);
    } catch (err) {
      app.log.error({ error: err }, 'shutdown failed');
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) =>
    app.log.error({ error: reason }, 'unhandled rejection'),
  );

  await app.listen({ host: c.HOST, port: c.PORT });
}
